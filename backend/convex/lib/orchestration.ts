import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { childSpecs } from "./story";
import { clipPrompt } from "./style";
import { stuckClipMs } from "./config";
import { expectedStopKind } from "./director";
import { bumpStreak } from "./streak";
import {
  characterQuestion,
  endingPrompt,
  keikiConfigured,
  keikiOutboundEnabled,
  makeCode,
  openerText,
  sharedLine,
} from "./keiki";

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
  if (beat === null || beat.status === "cancelled") return 0;
  const run = await ctx.db.get(beat.runId);
  if (run === null || run.status !== "active") return 0;
  if (run.currentBeatId !== beatId) return 0;
  const clip = await clipForBeat(ctx, beatId);
  if (clip === null || (clip.status !== "ready" && clip.status !== "failed")) return 0;
  if (beat.ending !== undefined) return 0;
  const existing = await childrenOfBeat(ctx, beatId);
  if (existing.length > 0) return 0;
  if (beat.stop === undefined) {
    const episode = await ctx.db.get(run.episodeId);
    if (episode === null) return 0;
    if (expectedStopKind(beat.depth, episode.beatsTotal) === "choice") {
      await ctx.scheduler.runAfter(0, internal.director.authorObjects, { beatId });
    }
    return 0;
  }
  const specs = childSpecs(beat.stop);
  let started = 0;
  for (const spec of specs) {
    const childId = await ctx.db.insert("beats", {
      runId: beat.runId,
      parentBeatId: beat._id,
      optionId: spec.optionId,
      actionId: spec.actionId,
      depth: beat.depth + 1,
      status: "generating",
      narration: spec.narration,
      spokenLine: spec.spokenLine,
      clipPrompt: spec.clipPrompt === undefined ? "" : clipPrompt(spec.clipPrompt),
      directorAttempts: 0,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.director.generateBeat, { beatId: childId });
    started += 1;
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
  if (episode === null) return false;

  const character = episode.character;
  const line = sharedLine();
  let code = makeCode(`${run.userId}:${episode.date}`);
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const clash = await ctx.db
      .query("storyMessages")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (clash === null) break;
    code = makeCode(`${run.userId}:${episode.date}`, attempt);
  }
  const lastAction = run.path.length === 0 ? null : run.path[run.path.length - 1];
  const opener = openerText({
    characterName: character.name,
    lastAction,
    question: characterQuestion(run._id),
  });
  const createdAt = Date.now();

  await ctx.db.patch(runId, {
    status: "ended",
    ending: {
      ...beat.ending,
      text: {
        character: character.name,
        number: line,
        prompt: endingPrompt({ characterName: character.name, code, line }),
      },
    },
    endedAt: createdAt,
  });
  await bumpStreak(ctx, run.userId, episode.date);
  await ctx.db.insert("storyMessages", {
    userId: run.userId,
    episodeId: episode._id,
    runId,
    character: character.name,
    direction: "outbound",
    text: opener,
    code,
    delivery: keikiConfigured() && keikiOutboundEnabled() ? "queued" : "fallback",
    createdAt,
  });
  await ctx.scheduler.runAfter(0, internal.keiki.sendOpener, { runId });
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
    lastActivityAt: Date.now(),
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
  if (beat.stop === undefined && beat.ending === undefined) {
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
    if (clip.attemptToken === undefined) {
      await ctx.db.patch(clip._id, { status: "queued", jobId: undefined });
      await ctx.scheduler.runAfter(0, internal.tray.startClip, { beatId });
      return;
    }
    await ctx.scheduler.runAfter(0, internal.tray.pollClip, {
      beatId,
      attempt: 1,
      attemptToken: clip.attemptToken,
    });
    return;
  }
  await maybePrefetch(ctx, beatId);
}

// A clip whose poll chain died stays "generating" forever, which is what leaves a phone with a
// clip and no options after it. Restart the chain for anything that has not moved in a while.
export async function rescueStuckClips(
  ctx: MutationCtx,
): Promise<{ resumed: number; restarted: number }> {
  const now = Date.now();
  const cutoff = now - stuckClipMs();
  let resumed = 0;
  let restarted = 0;
  for (const clip of await ctx.db
    .query("clips")
    .withIndex("by_status_created", (q) => q.eq("status", "generating").lt("createdAt", cutoff))
    .take(60)) {
    const startedAt = clip.attemptAt ?? clip.createdAt;
    if (startedAt > cutoff) continue;
    if (clip.attemptToken === undefined) {
      await ctx.db.patch(clip._id, { status: "queued", jobId: undefined });
      await ctx.scheduler.runAfter(0, internal.tray.startClip, { beatId: clip.beatId });
      restarted += 1;
      continue;
    }
    if (clip.jobId === undefined) {
      await ctx.db.patch(clip._id, { status: "queued", jobId: undefined });
      await ctx.scheduler.runAfter(0, internal.tray.startClip, { beatId: clip.beatId });
      restarted += 1;
      continue;
    }
    await ctx.scheduler.runAfter(0, internal.tray.pollClip, {
      beatId: clip.beatId,
      attempt: 1,
      attemptToken: clip.attemptToken,
    });
    resumed += 1;
  }
  for (const clip of await ctx.db
    .query("clips")
    .withIndex("by_status_created", (q) => q.eq("status", "queued").lt("createdAt", cutoff))
    .take(60)) {
    await ctx.scheduler.runAfter(0, internal.tray.startClip, { beatId: clip.beatId });
    restarted += 1;
  }
  return { resumed, restarted };
}
