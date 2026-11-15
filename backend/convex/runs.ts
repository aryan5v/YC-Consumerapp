import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";
import { ensureActiveUser } from "./lib/session";
import { ensureEpisode } from "./lib/episodes";
import { pacificDate } from "./lib/pacific";
import { runViewValidator } from "./lib/validators";
import { buildRunView } from "./lib/view";
import { DirectorPuzzleStop } from "./lib/director";
import { checkAnswer, outcomeLabel } from "./lib/story";
import { cancelSiblings, childrenOfBeat, clipForBeat, kickRun, promoteTo } from "./lib/orchestration";

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
    const { run, beat } = await loadCurrent(ctx, runId);
    const stop = beat.stop as { kind: string; options?: { id: string; label: string }[] } | undefined;
    if (stop === undefined || stop.kind !== "choice" || stop.options === undefined) {
      throw new Error("the current beat is not a choice stop");
    }
    const option = stop.options.find((entry) => entry.id === optionId);
    if (option === undefined) throw new Error(`no option "${optionId}" on the current beat`);
    await promote(ctx, run, beat, optionId, option.label);
    return null;
  },
});

export const answer = mutation({
  args: { runId: v.id("runs"), answer: v.string() },
  returns: v.object({ correct: v.boolean() }),
  handler: async (ctx, { runId, answer: given }) => {
    const { run, beat } = await loadCurrent(ctx, runId);
    const stop = beat.stop as DirectorPuzzleStop | undefined;
    if (stop === undefined || stop.kind !== "puzzle") throw new Error("the current beat is not a puzzle stop");
    const correct = checkAnswer(stop, given);
    const optionId = correct ? "success" : "failure";
    await promote(ctx, run, beat, optionId, outcomeLabel(stop, correct));
    return { correct };
  },
});

async function loadCurrent(ctx: Parameters<typeof ensureActiveUser>[0], runId: Doc<"runs">["_id"]) {
  const run = await ctx.db.get(runId);
  if (run === null) throw new Error("run not found");
  if (run.status !== "active") throw new Error("this run has already ended");
  const beatId = run.currentBeatId;
  if (beatId === undefined) throw new Error("run has no current beat");
  const beat = await ctx.db.get(beatId);
  if (beat === null) throw new Error("current beat not found");
  return { run, beat };
}

async function promote(
  ctx: Parameters<typeof cancelSiblings>[0],
  run: Doc<"runs">,
  beat: Doc<"beats">,
  optionId: string,
  label: string,
): Promise<void> {
  const children = await childrenOfBeat(ctx, beat._id);
  const chosen = children.find((child) => child.optionId === optionId);
  if (chosen === undefined) throw new Error(`option "${optionId}" has no shot yet`);
  await cancelSiblings(
    ctx,
    children.filter((child) => child._id !== chosen._id),
  );
  await promoteTo(ctx, run, chosen, label, optionId);
}
