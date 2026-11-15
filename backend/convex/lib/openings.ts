import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { childrenOfBeat, clipForBeat } from "./orchestration";

export const STORY_OPENING_KEY = "story";
export const PREWARM_DEVICE_KEY = "synqui prewarm store";
// A prewarm run whose shots never all arrive is abandoned and started over, rather than left
// holding the slot forever.
export const PREWARM_MAX_AGE_MS = 10 * 60 * 1000;

// The opening a fresh run replays: the first shot, its spoken line, the objects and every option
// shot, already rendered and stored, so a player who opens the app starts playing in seconds.
export async function applyOpening(
  ctx: MutationCtx,
  runId: Id<"runs">,
  opening: Doc<"openings">,
): Promise<void> {
  const run = await ctx.db.get(runId);
  if (run === null) return;
  const stored = opening.beat as {
    clipPrompt?: string;
    narration?: string;
    spokenLine?: string;
    stop?: unknown;
    state?: Doc<"beats">["state"];
  };
  const state = stored.state ?? run.state;
  const createdAt = Date.now();
  const beatId = await ctx.db.insert("beats", {
    runId,
    depth: 0,
    status: "ready",
    narration: stored.narration,
    spokenLine: stored.spokenLine,
    spokenAudioStorageId: opening.audioStorageId,
    spokenAudioUrl: opening.audioUrl,
    clipPrompt: stored.clipPrompt ?? "",
    stopKind: stored.stop === undefined ? undefined : "choice",
    stop: stored.stop,
    director: stored as Doc<"beats">["director"],
    state,
    directorAttempts: 1,
    createdAt,
  });
  await ctx.db.patch(runId, { currentBeatId: beatId, state });
  await ctx.db.insert("clips", {
    runId,
    beatId,
    status: "ready",
    url: opening.clipUrl,
    storageId: opening.clipStorageId,
    prompt: stored.clipPrompt ?? "",
    seed: opening.seed,
    aspect: opening.aspect,
    seconds: opening.seconds,
    attempts: 1,
    createdAt,
    readyAt: createdAt,
  });
  for (const child of opening.children) {
    const childBeatId = await ctx.db.insert("beats", {
      runId,
      parentBeatId: beatId,
      optionId: child.optionId,
      actionId: child.actionId,
      depth: 1,
      status: "ready",
      narration: child.narration,
      spokenLine: child.spokenLine,
      spokenAudioStorageId: child.audioStorageId,
      spokenAudioUrl: child.audioUrl,
      clipPrompt: child.clipPrompt,
      stopKind: child.stop === undefined ? undefined : "choice",
      stop: child.stop,
      state: child.state,
      directorAttempts: 1,
      createdAt,
    });
    await ctx.db.insert("clips", {
      runId,
      beatId: childBeatId,
      option: child.optionId,
      status: "ready",
      url: child.url,
      storageId: child.storageId,
      prompt: child.clipPrompt,
      seed: child.seed,
      aspect: opening.aspect,
      seconds: opening.seconds,
      attempts: 1,
      createdAt,
      readyAt: createdAt,
    });
    // The next level of options starts generating while the opening clip plays.
    await ctx.scheduler.runAfter(0, internal.director.generateBeat, { beatId: childBeatId });
  }
}

export async function openingFor(
  ctx: QueryCtx,
  episodeId: Id<"episodes">,
  key = STORY_OPENING_KEY,
): Promise<Doc<"openings"> | null> {
  return await ctx.db
    .query("openings")
    .withIndex("by_episode_key", (q) => q.eq("episodeId", episodeId).eq("key", key))
    .first();
}

export async function prewarmUser(ctx: MutationCtx): Promise<Id<"users">> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_device_key", (q) => q.eq("deviceKey", PREWARM_DEVICE_KEY))
    .first();
  if (existing !== null) return existing._id;
  return await ctx.db.insert("users", {
    kind: "anonymous",
    deviceKey: PREWARM_DEVICE_KEY,
    createdAt: Date.now(),
  });
}

// A run is replayable once its first shot and every option shot are ready. A puzzle opening needs
// both outcome shots too.
export async function openingReadiness(
  ctx: QueryCtx,
  runId: Id<"runs">,
): Promise<{ ready: boolean; beatId: Id<"beats"> | null; children: number }> {
  const run = await ctx.db.get(runId);
  if (run === null || run.currentBeatId === undefined) {
    return { ready: false, beatId: null, children: 0 };
  }
  const beat = await ctx.db.get(run.currentBeatId);
  if (beat === null) return { ready: false, beatId: null, children: 0 };
  const clip = await clipForBeat(ctx, beat._id);
  if (clip === null || clip.status !== "ready" || clip.url === undefined) {
    return { ready: false, beatId: beat._id, children: 0 };
  }
  if (beat.stop === undefined) return { ready: false, beatId: beat._id, children: 0 };
  const live = (await childrenOfBeat(ctx, beat._id)).filter((child) => child.status !== "cancelled");
  if (live.length === 0) return { ready: false, beatId: beat._id, children: 0 };
  for (const child of live) {
    const childClip = await clipForBeat(ctx, child._id);
    if (childClip === null || childClip.status !== "ready" || childClip.url === undefined) {
      return { ready: false, beatId: beat._id, children: live.length };
    }
  }
  if ((beat.stop as { kind?: string }).kind === "puzzle" && live.length < 2) {
    return { ready: false, beatId: beat._id, children: live.length };
  }
  return { ready: true, beatId: beat._id, children: live.length };
}

// Store the rendered opening, the moment its last shot lands. Ends the run that rendered it.
export async function captureOpening(
  ctx: MutationCtx,
  episodeId: Id<"episodes">,
  runId: Id<"runs">,
): Promise<boolean> {
  const already = await openingFor(ctx, episodeId, STORY_OPENING_KEY);
  if (already !== null) return false;
  const state = await openingReadiness(ctx, runId);
  if (!state.ready || state.beatId === null) return false;
  const beat = await ctx.db.get(state.beatId);
  if (beat === null) return false;
  const clip = await clipForBeat(ctx, beat._id);
  if (clip === null || clip.url === undefined) return false;
  const children: Doc<"openings">["children"] = [];
  for (const child of await childrenOfBeat(ctx, beat._id)) {
    if (child.status === "cancelled") continue;
    const childClip = await clipForBeat(ctx, child._id);
    if (childClip === null || childClip.url === undefined) continue;
    children.push({
      optionId: child.optionId ?? "",
      actionId: child.actionId,
      clipPrompt: child.clipPrompt,
      narration: child.narration,
      spokenLine: child.spokenLine,
      stop: child.stop,
      state: child.state,
      storageId: childClip.storageId,
      url: childClip.url,
      seed: childClip.seed ?? 0,
      audioStorageId: child.spokenAudioStorageId,
      audioUrl: child.spokenAudioUrl,
    });
  }
  if (children.length === 0) return false;
  await ctx.db.insert("openings", {
    episodeId,
    key: STORY_OPENING_KEY,
    seed: clip.seed ?? 0,
    aspect: clip.aspect ?? "9:16",
    seconds: clip.seconds ?? 5,
    beat: {
      clipPrompt: beat.clipPrompt,
      narration: beat.narration,
      spokenLine: beat.spokenLine,
      stop: beat.stop,
      state: beat.state,
    },
    clipStorageId: clip.storageId,
    clipUrl: clip.url,
    audioStorageId: beat.spokenAudioStorageId,
    audioUrl: beat.spokenAudioUrl,
    children,
    createdAt: Date.now(),
  });
  const run = await ctx.db.get(runId);
  if (run !== null && run.status === "active") {
    await ctx.db.patch(runId, { status: "ended", endedAt: Date.now() });
  }
  return true;
}
