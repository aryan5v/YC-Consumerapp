import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { ensureActiveUser } from "./lib/session";
import { ensureEpisode } from "./lib/episodes";
import { pacificDate } from "./lib/pacific";
import { runViewValidator } from "./lib/validators";
import { buildRunView } from "./lib/view";
import { DirectorPuzzleStop } from "./lib/director";
import { answerPuzzle, chooseOption, loadCurrent } from "./lib/advance";
import { askAgainLine, matchSpokenOption, SpokenOption } from "./lib/speech";
import { openaiConfigured, synthesize, transcribe } from "./lib/openai";
import { deepseekJSON, directorMode, parseJSONObject } from "./lib/deepseek";
import { graderMessages, speechMapperMessages } from "./lib/director";
import { checkAnswer } from "./lib/story";
import { childrenOfBeat, clipForBeat, kickRun } from "./lib/orchestration";

export const startToday = mutation({
  args: {},
  returns: v.id("runs"),
  handler: async (ctx) => {
    const userId = await ensureActiveUser(ctx);
    const episode = await ensureEpisode(ctx, pacificDate());
    const existing = await ctx.db
      .query("runs")
      .withIndex("by_user_episode", (q) => q.eq("userId", userId).eq("episodeId", episode._id))
      .order("desc")
      .first();
    if (existing !== null && existing.status === "active") {
      await kickRun(ctx, existing);
      return existing._id;
    }
    const runId = await ctx.db.insert("runs", {
      userId,
      episodeId: episode._id,
      status: "active",
      path: [],
      optionPath: [],
      beatsSeen: 0,
      state: { items: [], trust: 0, clues: [], beats_left: episode.beatsTotal },
      startedAt: Date.now(),
    });
    const beatId = await ctx.db.insert("beats", {
      runId,
      depth: 0,
      status: "generating",
      clipPrompt: "",
      directorAttempts: 0,
      createdAt: Date.now(),
    });
    await ctx.db.patch(runId, { currentBeatId: beatId });
    await ctx.scheduler.runAfter(0, internal.director.generateBeat, { beatId });
    return runId;
  },
});

export const view = query({
  args: { runId: v.id("runs") },
  returns: runViewValidator,
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (run === null) throw new Error("run not found");
    const episode = await ctx.db.get(run.episodeId);
    if (episode === null) throw new Error("episode not found");
    const beatId = run.currentBeatId;
    if (beatId === undefined) throw new Error("run has no current beat");
    const beat = await ctx.db.get(beatId);
    if (beat === null) throw new Error("current beat not found");
    const clip = await clipForBeat(ctx, beatId);
    const childBeats = await childrenOfBeat(ctx, beatId);
    const children: { beat: Doc<"beats">; clip: Doc<"clips"> | null }[] = [];
    for (const child of childBeats) {
      children.push({ beat: child, clip: await clipForBeat(ctx, child._id) });
    }
    return buildRunView({ run, episode, beat, clip, children });
  },
});

export const choose = mutation({
  args: { runId: v.id("runs"), optionId: v.string() },
  returns: v.null(),
  handler: async (ctx, { runId, optionId }) => {
    await chooseOption(ctx, runId, optionId);
    return null;
  },
});

export const answer = mutation({
  args: { runId: v.id("runs"), answer: v.string() },
  returns: v.object({ correct: v.boolean() }),
  handler: async (ctx, { runId, answer: given }) => {
    const correct = await answerPuzzle(ctx, runId, given);
    return { correct };
  },
});

export const speakContext = internalQuery({
  args: { runId: v.id("runs") },
  handler: async (ctx, { runId }) => {
    const run = await ctx.db.get(runId);
    if (run === null || run.status !== "active") return null;
    const beatId = run.currentBeatId;
    if (beatId === undefined) return null;
    const beat = await ctx.db.get(beatId);
    if (beat === null) return null;
    const episode = await ctx.db.get(run.episodeId);
    if (episode === null) return null;
    return {
      stop: beat.stop ?? null,
      spokenLine: beat.spokenLine ?? "",
      characterName: episode.character.name,
      characterVoice: episode.character.voice,
      voiceId: episode.voiceId,
      pathLabels: run.path,
    };
  },
});

export const speakChoose = internalMutation({
  args: { runId: v.id("runs"), optionId: v.string() },
  returns: v.null(),
  handler: async (ctx, { runId, optionId }) => {
    await chooseOption(ctx, runId, optionId);
    return null;
  },
});

export const speakAnswer = internalMutation({
  args: { runId: v.id("runs"), answer: v.string(), correct: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { runId, answer, correct }) => {
    await answerPuzzle(ctx, runId, answer, correct);
    return null;
  },
});

export const speakUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    if (!openaiConfigured()) {
      throw new Error("voice is not configured on this deployment: OPENAI_API_KEY is unset");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

export const speak = action({
  args: { runId: v.id("runs"), audioStorageId: v.id("_storage") },
  returns: v.object({
    transcript: v.string(),
    matchedOptionId: v.union(v.string(), v.null()),
    correct: v.union(v.boolean(), v.null()),
    reply: v.union(v.string(), v.null()),
    replyAudioUrl: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { runId, audioStorageId }) => {
    if (!openaiConfigured()) {
      throw new Error("voice is not configured on this deployment: OPENAI_API_KEY is unset");
    }
    const context = await ctx.runQuery(internal.runs.speakContext, { runId });
    if (context === null) throw new Error("this run is no longer active");
    const recording = await ctx.storage.get(audioStorageId);
    if (recording === null) throw new Error("that recording is no longer in storage");
    const transcript = await transcribe(recording, "m4a");
    const replyAudio = async (text: string): Promise<{ reply: string; replyAudioUrl: string | null }> => {
      try {
        const audio = await synthesize({
          text,
          voice: context.voiceId,
          instructions: `You are ${context.characterName}. ${context.characterVoice} Say one short line of dialogue plainly.`,
        });
        const stored = await ctx.storage.store(audio);
        return { reply: text, replyAudioUrl: await ctx.storage.getUrl(stored) };
      } catch {
        return { reply: text, replyAudioUrl: null };
      }
    };
    const nothingHeard = () => replyAudio("I did not catch that. Say it again, or tap one of the three.");
    const stop = context.stop as
      | { kind: "choice"; options: { id: string; label: string; target: string; spoken_line: string }[] }
      | DirectorPuzzleStop
      | null;
    const said = transcript.trim();
    if (stop === null) {
      const spoken = await replyAudio("Hold on a beat and say that again.");
      return { transcript, matchedOptionId: null, correct: null, ...spoken };
    }
    if (said === "") {
      const spoken = await nothingHeard();
      return { transcript, matchedOptionId: null, correct: null, ...spoken };
    }

    if (stop.kind === "puzzle") {
      let correct = checkAnswer(stop, said);
      if (!correct && said !== "" && directorMode() === "live") {
        try {
          const raw = await deepseekJSON(
            graderMessages({ question: stop.question, answers: stop.answers, transcript: said }),
            120,
          );
          const parsed = parseJSONObject(raw) as { correct?: unknown };
          if (parsed.correct === true) correct = true;
        } catch {
          correct = false;
        }
      }
      await ctx.runMutation(internal.runs.speakAnswer, { runId, answer: said, correct });
      return { transcript, matchedOptionId: correct ? "success" : "failure", correct, reply: null, replyAudioUrl: null };
    }

    const options: SpokenOption[] = stop.options.map((option) => ({
      id: option.id,
      label: option.label,
      target: option.target,
      spokenLine: option.spoken_line,
    }));
    const local = matchSpokenOption(options, said);
    let optionId = local.optionId;
    let reply: string | null = null;
    if (optionId === null && said !== "" && directorMode() === "live") {
      try {
        const raw = await deepseekJSON(
          speechMapperMessages({
            character: context.characterName,
            question: context.spokenLine === "" ? "What do you do?" : context.spokenLine,
            spokenLine: context.spokenLine,
            options: options.map((option) => ({ id: option.id, label: option.label, target: option.target })),
            transcript: said,
          }),
          200,
        );
        const parsed = parseJSONObject(raw) as { option_id?: unknown; reply?: unknown };
        const candidate = typeof parsed.option_id === "string" ? parsed.option_id.trim().toLowerCase() : null;
        if (candidate !== null && options.some((option) => option.id === candidate)) optionId = candidate;
        if (typeof parsed.reply === "string" && parsed.reply.trim() !== "") reply = parsed.reply.trim();
      } catch {
        reply = null;
      }
    }
    if (optionId === null) {
      const spoken = await replyAudio(reply ?? askAgainLine(context.characterName));
      return { transcript, matchedOptionId: null, correct: null, ...spoken };
    }
    await ctx.runMutation(internal.runs.speakChoose, { runId, optionId });
    return { transcript, matchedOptionId: optionId, correct: null, reply: null, replyAudioUrl: null };
  },
});

export { loadCurrent };
