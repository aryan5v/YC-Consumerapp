import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { childSpecs, composeChildPrompt } from "./story";
import { styledPrompt } from "./style";
import { bumpStreak } from "./streak";

export const MAX_GENERATE_ATTEMPTS = 2;

export async function clipForBeat(ctx: { db: QueryCtx["db"] }, beatId: Id<"beats">): Promise<Doc<"clips"> | null> {
  return await ctx.db
    .query("clips")
    .withIndex("by_beat", (q) => q.eq("beatId", beatId))
    .first();
}

export async function childrenOfBeat(ctx: { db: QueryCtx["db"] }, beatId: Id<"beats">): Promise<Doc<"beats">[]> {
  return await ctx.db
    .query("beats")
    .withIndex("by_parent", (q) => q.eq("parentBeatId", beatId))
    .collect();
}

export async function maybePrefetch(ctx: MutationCtx, beatId: Id<"beats">): Promise<number> {
  const beat = await ctx.db.get(beatId);
  if (beat === null || beat.status === "cancelled" || beat.stop === undefined) return 0;
  const run = await ctx.db.get(beat.runId);
  if (run === null || run.status !== "active") return 0;
  if (run.currentBeatId !== beatId) return 0;
  const clip = await clipForBeat(ctx, beatId);
  if (clip === null || (clip.status !== "ready" && clip.status !== "failed")) return 0;
  const existing = await childrenOfBeat(ctx, beatId);
  if (existing.length > 0) return 0;
  const episode = await ctx.db.get(run.episodeId);
  if (episode === null) return 0;

  const specs = childSpecs(beat.stop);
  let started = 0;
  let index = 0;
  for (const spec of specs) {
    const clipPrompt = styledPrompt(composeChildPrompt(beat.clipPrompt, spec));
    const createdAt = Date.now();
    const childId = await ctx.db.insert("beats", {
      runId: beat.runId,
      parentBeatId: beat._id,
      optionId: spec.optionId,
      depth: beat.depth + 1,
      status: "generating",
      narration: spec.narration,
      clipPrompt,
      directorAttempts: 0,
      createdAt,
    });
    await ctx.db.insert("clips", {
      runId: beat.runId,
      beatId: childId,
      option: spec.optionId,
      status: "queued",
      prompt: clipPrompt,
      seed: episode.seed + beat.depth * 97 + index,
      aspect: episode.aspect,
      seconds: episode.seconds,
      attempts: 0,
      createdAt,
    });
    await ctx.scheduler.runAfter(0, internal.tray.startClip, { beatId: childId });
    started += 1;
    index += 1;
  }
  return started;
}

export async function maybeFinish(ctx: MutationCtx, runId: Id<"runs">, beatId: Id<"beats">): Promise<boolean> {
  const run = await ctx.db.get(runId);
  if (run === null || run.status !== "active") return false;
  if (run.currentBeatId !== beatId) return false;
  const beat = await ctx.db.get(beatId);
  if (beat === null || beat.ending === undefined) return false;
  const clip = await clipForBeat(ctx, beatId);
  if (clip === null || clip.status !== "ready") return false;
  const episode = await ctx.db.get(run.episodeId);
  await ctx.db.patch(runId, { status: "ended", ending: beat.ending, endedAt: Date.now() });
  if (episode !== null) await bumpStreak(ctx, run.userId, episode.date);
  return true;
}

export async function cancelSiblings(ctx: MutationCtx, siblings: Doc<"beats">[]): Promise<void> {
  for (const beat of siblings) {
    if (beat.status === "cancelled") continue;
    await ctx.db.patch(beat._id, { status: "cancelled" });
    const clip = await clipForBeat(ctx, beat._id);
    if (clip === null || clip.status === "ready" || clip.status === "cancelled") continue;
    await ctx.db.patch(clip._id, { status: "cancelled" });
    if (clip.jobId !== undefined) {
      await ctx.scheduler.runAfter(0, internal.tray.cancelClip, { beatId: beat._id });
    }
  }
}

export async function promoteTo(
  ctx: MutationCtx,
  run: Doc<"runs">,
  child: Doc<"beats">,
  label: string,
  optionId: string,
): Promise<void> {
  await ctx.db.patch(run._id, {
    currentBeatId: child._id,
    path: [...run.path, label].slice(-24),
    optionPath: [...run.optionPath, optionId].slice(-24),
    beatsSeen: run.beatsSeen + 1,
    state: child.state ?? run.state,
  });
  await ctx.scheduler.runAfter(0, internal.director.generateBeat, { beatId: child._id });
  await maybePrefetch(ctx, child._id);
  await maybeFinish(ctx, run._id, child._id);
}

export async function kickRun(ctx: MutationCtx, run: Doc<"runs">): Promise<void> {
  const beatId = run.currentBeatId;
  if (beatId === undefined) return;
  const beat = await ctx.db.get(beatId);
  if (beat === null || beat.status === "cancelled" || beat.status === "failed") return;
  const clip = await clipForBeat(ctx, beatId);
  if (beat.stop === undefined || beat.ending === undefined) {
    await ctx.scheduler.runAfter(0, internal.director.generateBeat, { beatId });
    return;
  }
  if (clip === null) {
    await ctx.scheduler.runAfter(0, internal.clips.ensureForBeat, { beatId });
    return;
  }
  if (clip.status === "queued") {
    await ctx.scheduler.runAfter(0, internal.tray.startClip, { beatId });
    return;
  }
  if (clip.status === "generating") {
    await ctx.scheduler.runAfter(0, internal.tray.pollClip, { beatId, attempt: 1 });
    return;
  }
  await maybePrefetch(ctx, beatId);
}
