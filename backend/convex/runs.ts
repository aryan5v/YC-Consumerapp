import { v } from "convex/values";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { ensurePlayer, requirePlayer, runOwnedBy } from "./lib/session";
import { PREWARM_MAX_AGE_MS, openingFor, applyOpening, STORY_OPENING_KEY } from "./lib/openings";
import { ensureEpisode } from "./lib/episodes";
import { pacificDate } from "./lib/pacific";
import { runViewValidator } from "./lib/validators";
import { buildRunView, runIsReadable } from "./lib/view";
import { DirectorPuzzleStop } from "./lib/director";
import { answerPuzzle, chooseOption, loadCurrent } from "./lib/advance";
import { askAgainLine, matchSpokenOption, SpokenOption } from "./lib/speech";
import { openaiConfigured, synthesize, transcribe } from "./lib/openai";
import { deepseekJSON, directorMode, parseJSONObject } from "./lib/deepseek";
import { graderMessages, speechMapperMessages } from "./lib/director";
import { checkAnswer } from "./lib/story";
import { childrenOfBeat, clipForBeat, kickRun, rescueStuckClips } from "./lib/orchestration";
import {
  activeRunTtlMs,
  customRunsPerHour,
  idleRunTtlMs,
  episodeBeats,
  maxActiveRuns,
  maxUploadBytes,
  speechAttemptsPerBeat,
} from "./lib/config";
import { customEpisodeRow, defaultCustomSeed, sanitizeCustomPrompt } from "./lib/custom";
import { buildCaseView, playCaseClip, solveCase } from "./lib/caseRuntime";

const NO_SPEECH = {
  transcript: "",
  matchedOptionId: null as string | null,
  correct: null as boolean | null,
  reply: null as string | null,
  replyAudioUrl: null as string | null,
};

// End every run that has had no activity for a while, so abandoned test runs and closed phones
// cannot eat the capacity a demo needs. Pre-generation runs are ours, not players', so they are
// swept on their own shorter clock and never counted against the cap.
export async function sweepStaleRuns(ctx: Parameters<typeof kickRun>[0]): Promise<{ ended: number; live: number }> {
  const now = Date.now();
  const idleCutoff = now - idleRunTtlMs();
  const hardCutoff = now - activeRunTtlMs();
  const active = await ctx.db
    .query("runs")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .collect();
  let ended = 0;
  let live = 0;
  for (const run of active) {
    const last = run.lastActivityAt ?? run.startedAt;
    if (run.prewarm === true) {
      if (now - run.startedAt > PREWARM_MAX_AGE_MS) {
        await ctx.db.patch(run._id, {
          status: "ended",
          endedAt: now,
          error: "abandoned: this pre-generation attempt did not finish",
        });
        ended += 1;
      }
      continue;
    }
    if (last < idleCutoff || run.startedAt < hardCutoff) {
      await ctx.db.patch(run._id, {
        status: "ended",
        endedAt: now,
        error: "abandoned: no activity for ten minutes, a fresh run will start where this one stopped",
      });
      ended += 1;
      continue;
    }
    live += 1;
  }
  return { ended, live };
}

async function refuseWhenAtCapacity(ctx: Parameters<typeof kickRun>[0]): Promise<void> {
  const { live } = await sweepStaleRuns(ctx);
  if (live >= maxActiveRuns()) {
    throw new Error(
      "the demo is at capacity: too many episodes are being generated at once. Try again in a minute.",
    );
  }
}

export const startToday = mutation({
  args: { deviceToken: v.string() },
  returns: v.id("runs"),
  handler: async (ctx, { deviceToken }) => {
    const user = await ensurePlayer(ctx, deviceToken);
    const episode = await ensureEpisode(ctx, pacificDate());
    if (episode.activeCaseId !== undefined) {
      const past = await ctx.db.query("runs")
        .withIndex("by_user_episode", (q) => q.eq("userId", user._id).eq("episodeId", episode._id)).collect();
      const completed = past.find((run) => run.caseId !== undefined && run.caseResult !== undefined);
      if (completed !== undefined) return completed._id;
      const resumable = past.find((run) => run.caseId !== undefined);
      if (resumable !== undefined && await runIsReadable(ctx, resumable)) {
        if (resumable.status !== "active") await refuseWhenAtCapacity(ctx);
        await ctx.db.patch(resumable._id, { status: "active", endedAt: undefined, error: undefined, lastActivityAt: Date.now() });
        return resumable._id;
      }
    }
    const existing = await ctx.db
      .query("runs")
      .withIndex("by_user_episode", (q) => q.eq("userId", user._id).eq("episodeId", episode._id))
      .order("desc")
      .first();
    if (existing !== null && existing.status === "active" && episode.activeCaseId === undefined) {
      if (await runIsReadable(ctx, existing)) {
        await ctx.db.patch(existing._id, { lastActivityAt: Date.now() });
        if (existing.caseId === undefined) await kickRun(ctx, existing);
        return existing._id;
      }
      await ctx.db.patch(existing._id, {
        status: "ended",
        endedAt: Date.now(),
        error: "abandoned: this run could not be read, a fresh one was started",
      });
    }
    await refuseWhenAtCapacity(ctx);
    const opening = await openingFor(ctx, episode._id, STORY_OPENING_KEY);
    const runId = await ctx.db.insert("runs", {
      userId: user._id,
      episodeId: episode._id,
      caseId: episode.activeCaseId,
      caseClues: episode.activeCaseId === undefined ? undefined : [],
      status: "active",
      path: [],
      optionPath: [],
      beatsSeen: 0,
      state: { items: [], trust: 0, clues: [], beats_left: episode.beatsTotal },
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
    });
    if (episode.activeCaseId !== undefined) {
      const run = await ctx.db.get(runId);
      await playCaseClip(ctx, run!, "opening", 0);
      return runId;
    }
    if (opening !== null) {
      await applyOpening(ctx, runId, opening);
      return runId;
    }
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

// The sweeper: end abandoned runs, and restart the poll chain of any clip whose own chain died.
// A clip stuck mid-generation is what makes a phone show a clip with no options after it, so this
// has to heal itself without a deploy.
export const sweep = internalMutation({
  args: {},
  returns: v.object({ ended: v.number(), live: v.number(), resumed: v.number(), recipled: v.number() }),
  handler: async (ctx) => {
    const swept = await sweepStaleRuns(ctx);
    const rescued = await rescueStuckClips(ctx);
    return { ended: swept.ended, live: swept.live, resumed: rescued.resumed, recipled: rescued.restarted };
  },
});

export const startCustom = mutation({
  args: { deviceToken: v.string(), prompt: v.string() },
  returns: v.id("runs"),
  handler: async (ctx, { deviceToken, prompt }) => {
    const user = await ensurePlayer(ctx, deviceToken);
    const clean = sanitizeCustomPrompt(prompt);
    if (!clean.ok) throw new Error(clean.message);
    const recent = await ctx.db
      .query("runs")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const cutoff = Date.now() - 60 * 60 * 1000;
    const customs = recent.filter((run) => run.startedAt >= cutoff && run.custom === true).length;
    if (customs >= customRunsPerHour()) {
      throw new Error("that is a lot of worlds in one hour. Give it a few minutes and try again.");
    }
    await refuseWhenAtCapacity(ctx);
    const episodeId = await ctx.db.insert("episodes", customEpisodeRow(defaultCustomSeed(clean.prompt)));
    const runId = await ctx.db.insert("runs", {
      userId: user._id,
      episodeId,
      status: "active",
      custom: true,
      path: [],
      optionPath: [],
      beatsSeen: 0,
      state: { items: [], trust: 0, clues: [], beats_left: episodeBeats() },
      startedAt: Date.now(),
      lastActivityAt: Date.now(),
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
    await ctx.scheduler.runAfter(0, internal.custom.refineSeed, {
      episodeId,
      beatId,
      prompt: clean.prompt,
    });
    return runId;
  },
});

export const view = query({
  args: { runId: v.id("runs"), deviceToken: v.string() },
  returns: runViewValidator,
  handler: async (ctx, { runId, deviceToken }) => {
    const { run } = await runOwnedBy(ctx, runId, deviceToken);
    const episode = await ctx.db.get(run.episodeId);
    if (episode === null) throw new Error("episode not found");
    const beatId = run.currentBeatId;
    if (beatId === undefined) throw new Error("run has no current beat");
    const beat = await ctx.db.get(beatId);
    if (beat === null) throw new Error("current beat not found");
    if (run.caseId !== undefined) return await buildCaseView(ctx, run, beat);
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
  args: {
    runId: v.id("runs"),
    optionId: v.string(),
    actionId: v.optional(v.string()),
    expectedBeatId: v.id("beats"),
    deviceToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { runId, optionId, actionId, expectedBeatId, deviceToken }) => {
    await runOwnedBy(ctx, runId, deviceToken);
    await chooseOption(ctx, runId, optionId, actionId, expectedBeatId);
    return null;
  },
});

export const answer = mutation({
  args: { runId: v.id("runs"), answer: v.string(), expectedBeatId: v.id("beats"), deviceToken: v.string() },
  returns: v.object({ correct: v.boolean() }),
  handler: async (ctx, { runId, answer: given, expectedBeatId, deviceToken }) => {
    await runOwnedBy(ctx, runId, deviceToken);
    const result = await answerPuzzle(ctx, runId, given, expectedBeatId);
    return { correct: result.correct };
  },
});

export const solve = mutation({
  args: { runId: v.id("runs"), answerId: v.string(), expectedBeatId: v.id("beats"), deviceToken: v.string() },
  returns: v.object({ solved: v.boolean() }),
  handler: async (ctx, { runId, answerId, expectedBeatId, deviceToken }) => {
    const { run } = await runOwnedBy(ctx, runId, deviceToken);
    return await solveCase(ctx, run, answerId, expectedBeatId);
  },
});

export const speakContext = internalQuery({
  args: { runId: v.id("runs"), deviceToken: v.string() },
  handler: async (ctx, { runId, deviceToken }) => {
    const { run } = await runOwnedBy(ctx, runId, deviceToken);
    if (run.status !== "active") return null;
    const beatId = run.currentBeatId;
    if (beatId === undefined) return null;
    const beat = await ctx.db.get(beatId);
    if (beat === null) return null;
    const episode = await ctx.db.get(run.episodeId);
    if (episode === null) return null;
    return {
      beatId,
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
  args: {
    runId: v.id("runs"),
    optionId: v.string(),
    actionId: v.optional(v.string()),
    expectedBeatId: v.id("beats"),
    deviceToken: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, { runId, optionId, actionId, expectedBeatId, deviceToken }) => {
    await runOwnedBy(ctx, runId, deviceToken);
    return await chooseOption(ctx, runId, optionId, actionId, expectedBeatId);
  },
});

export const speakAnswer = internalMutation({
  args: {
    runId: v.id("runs"),
    answer: v.string(),
    correct: v.boolean(),
    expectedBeatId: v.id("beats"),
    deviceToken: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, { runId, answer, correct, expectedBeatId, deviceToken }) => {
    await runOwnedBy(ctx, runId, deviceToken);
    const result = await answerPuzzle(ctx, runId, answer, expectedBeatId, correct);
    return result.applied;
  },
});

export const speakUploadUrl = mutation({
  args: { runId: v.id("runs"), expectedBeatId: v.id("beats"), deviceToken: v.string() },
  returns: v.string(),
  handler: async (ctx, { runId, expectedBeatId, deviceToken }) => {
    if (!openaiConfigured()) {
      throw new Error("voice is not configured on this deployment: OPENAI_API_KEY is unset");
    }
    const { user } = await runOwnedBy(ctx, runId, deviceToken);
    if (expectedBeatId === undefined) throw new Error("a recording belongs to one beat");
    const used = await ctx.db
      .query("recordings")
      .withIndex("by_run_beat", (q) => q.eq("runId", runId).eq("beatId", expectedBeatId))
      .collect();
    if (used.length >= speechAttemptsPerBeat()) {
      throw new Error("too many voice attempts on this beat: tap your answer or type it instead");
    }
    await ctx.db.insert("recordings", {
      userId: user._id,
      runId,
      beatId: expectedBeatId,
      consumed: false,
      createdAt: Date.now(),
    });
    return await ctx.storage.generateUploadUrl();
  },
});

export const claimRecording = internalMutation({
  args: {
    runId: v.id("runs"),
    beatId: v.id("beats"),
    audioStorageId: v.id("_storage"),
    deviceToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { runId, beatId, audioStorageId, deviceToken }) => {
    await runOwnedBy(ctx, runId, deviceToken);
    const pending = await ctx.db
      .query("recordings")
      .withIndex("by_run_beat", (q) => q.eq("runId", runId).eq("beatId", beatId))
      .collect();
    const claim = pending.find((row) => !row.consumed && row.storageId === undefined);
    if (claim === undefined) {
      await ctx.storage.delete(audioStorageId);
      throw new Error("that recording does not belong to this beat: ask for the upload URL again");
    }
    const meta = await ctx.storage.getMetadata(audioStorageId);
    if (meta === null) throw new Error("that recording is no longer in storage");
    if (meta.size > maxUploadBytes()) {
      await ctx.storage.delete(audioStorageId);
      await ctx.db.patch(claim._id, { consumed: true });
      throw new Error("that recording is too long: keep it under ten seconds");
    }
    await ctx.db.patch(claim._id, { consumed: true, storageId: audioStorageId });
  },
});

export const speak = action({
  args: {
    runId: v.id("runs"),
    audioStorageId: v.id("_storage"),
    expectedBeatId: v.id("beats"),
    deviceToken: v.string(),
  },
  returns: v.object({
    transcript: v.string(),
    matchedOptionId: v.union(v.string(), v.null()),
    correct: v.union(v.boolean(), v.null()),
    reply: v.union(v.string(), v.null()),
    replyAudioUrl: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { runId, audioStorageId, expectedBeatId, deviceToken }) => {
    if (!openaiConfigured()) {
      throw new Error("voice is not configured on this deployment: OPENAI_API_KEY is unset");
    }
    const context = await ctx.runQuery(internal.runs.speakContext, { runId, deviceToken });
    if (context === null) throw new Error("this run is no longer active");
    if (context.beatId !== expectedBeatId) return NO_SPEECH;
    await ctx.runMutation(internal.runs.claimRecording, {
      runId,
      beatId: expectedBeatId,
      audioStorageId,
      deviceToken,
    });
    const recording = await ctx.storage.get(audioStorageId);
    if (recording === null) throw new Error("that recording is no longer in storage");
    let transcript = "";
    try {
      transcript = await transcribe(recording, "m4a");
    } finally {
      await ctx.storage.delete(audioStorageId);
    }
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
      if (!correct && directorMode() === "live") {
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
      const applied = await ctx.runMutation(internal.runs.speakAnswer, {
        runId,
        answer: said,
        correct,
        expectedBeatId,
        deviceToken,
      });
      if (!applied) return { ...NO_SPEECH, transcript };
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
    if (optionId === null && directorMode() === "live") {
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
    const applied = await ctx.runMutation(internal.runs.speakChoose, {
      runId,
      optionId,
      expectedBeatId,
      deviceToken,
    });
    if (!applied) return { ...NO_SPEECH, transcript };
    return { transcript, matchedOptionId: optionId, correct: null, reply: null, replyAudioUrl: null };
  },
});

export { loadCurrent };
