import { v } from "convex/values";
import { QueryCtx, internalMutation, internalQuery } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { childSpecs } from "./lib/story";
import { MAX_GENERATE_ATTEMPTS, maybeFinish, maybePrefetch } from "./lib/orchestration";

async function clipForBeat(ctx: { db: QueryCtx["db"] }, beatId: Id<"beats">) {
  return await ctx.db
    .query("clips")
    .withIndex("by_beat", (q) => q.eq("beatId", beatId))
    .first();
}

export const forBeat = internalQuery({
  args: { beatId: v.id("beats") },
  handler: async (ctx, { beatId }) => {
    return await clipForBeat(ctx, beatId);
  },
});

export const work = internalQuery({
  args: { beatId: v.id("beats") },
  handler: async (ctx, { beatId }) => {
    const beat = await ctx.db.get(beatId);
    if (beat === null) return null;
    const clip = await clipForBeat(ctx, beatId);
    if (clip === null) return null;
    const run = await ctx.db.get(beat.runId);
    if (run === null) return null;
    const episode = await ctx.db.get(run.episodeId);
    if (episode === null) return null;
    const parent = beat.parentBeatId === undefined ? null : await ctx.db.get(beat.parentBeatId);
    const parentClip = parent === null ? null : await clipForBeat(ctx, parent._id);
    const targets =
      beat.stop === undefined
        ? []
        : childSpecs(beat.stop).map((spec) => ({
            optionId: spec.optionId,
            target: spec.target ?? spec.label,
          }));
    return {
      beat,
      clip,
      targets,
      anchors: {
        continuityFrameUrl: parentClip?.lastFrameUrl ?? null,
        characterSheetUrl: episode.characterSheetUrl,
        styleImageUrl: episode.styleImageUrl,
        voiceRefUrl: episode.voiceRefUrl,
      },
    };
  },
});

export const ensureForBeat = internalMutation({
  args: { beatId: v.id("beats") },
  returns: v.null(),
  handler: async (ctx, { beatId }) => {
    const beat = await ctx.db.get(beatId);
    if (beat === null || beat.status === "cancelled") return null;
    const existing = await clipForBeat(ctx, beatId);
    if (existing !== null) {
      if (existing.status === "queued") {
        await ctx.scheduler.runAfter(0, internal.tray.startClip, { beatId });
      }
      return null;
    }
    if (beat.clipPrompt.trim() === "") return null;
    const run = await ctx.db.get(beat.runId);
    if (run === null) return null;
    const episode = await ctx.db.get(run.episodeId);
    if (episode === null) return null;
    await ctx.db.insert("clips", {
      runId: beat.runId,
      beatId,
      option: beat.optionId,
      status: "queued",
      prompt: beat.clipPrompt,
      seed: episode.seed + beat.depth * 97,
      aspect: episode.aspect,
      seconds: episode.seconds,
      attempts: 0,
      createdAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.tray.startClip, { beatId });
    return null;
  },
});

export const setJob = internalMutation({
  args: { beatId: v.id("beats"), jobId: v.string() },
  returns: v.null(),
  handler: async (ctx, { beatId, jobId }) => {
    const clip = await clipForBeat(ctx, beatId);
    if (clip === null || clip.status !== "queued") return null;
    await ctx.db.patch(clip._id, { jobId, status: "generating" });
    return null;
  },
});

export const markReady = internalMutation({
  args: { beatId: v.id("beats"), url: v.string(), lastFrameUrl: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { beatId, url, lastFrameUrl }) => {
    const clip = await clipForBeat(ctx, beatId);
    if (clip === null || clip.status === "cancelled" || clip.status === "ready") return null;
    await ctx.db.patch(clip._id, {
      status: "ready",
      url,
      lastFrameUrl,
      attempts: clip.attempts + 1,
      readyAt: Date.now(),
    });
    const beat = await ctx.db.get(beatId);
    if (beat === null) return null;
    if (beat.status === "generating") await ctx.db.patch(beatId, { status: "ready" });
    await maybePrefetch(ctx, beatId);
    await maybeFinish(ctx, beat.runId, beatId);
    const run = await ctx.db.get(beat.runId);
    if (run !== null && run.currentBeatId === beatId && beat.stop !== undefined && lastFrameUrl !== undefined) {
      await ctx.scheduler.runAfter(0, internal.tray.runDetect, { beatId });
    }
    return null;
  },
});

export const markFailed = internalMutation({
  args: { beatId: v.id("beats"), error: v.string(), retryable: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, { beatId, error, retryable }) => {
    const clip = await clipForBeat(ctx, beatId);
    if (clip === null || clip.status === "cancelled" || clip.status === "ready") return null;
    const attempts = clip.attempts + 1;
    if (retryable === true && attempts < MAX_GENERATE_ATTEMPTS) {
      await ctx.db.patch(clip._id, { status: "queued", attempts, jobId: undefined, error });
      await ctx.scheduler.runAfter(0, internal.tray.startClip, { beatId });
      return null;
    }
    await ctx.db.patch(clip._id, { status: "failed", error, attempts });
    const beat = await ctx.db.get(beatId);
    if (beat !== null && beat.status === "generating") {
      await ctx.db.patch(beatId, { status: "failed", error });
    }
    await maybePrefetch(ctx, beatId);
    return null;
  },
});

export const setBoxes = internalMutation({
  args: { beatId: v.id("beats"), boxes: v.any() },
  returns: v.null(),
  handler: async (ctx, { beatId, boxes }) => {
    const clip = await clipForBeat(ctx, beatId);
    if (clip === null) return null;
    await ctx.db.patch(clip._id, { boxes });
    return null;
  },
});

export const bumpAttempt = internalMutation({
  args: { beatId: v.id("beats") },
  returns: v.number(),
  handler: async (ctx, { beatId }) => {
    const clip = await clipForBeat(ctx, beatId);
    if (clip === null) return 0;
    const attempts = clip.attempts + 1;
    await ctx.db.patch(clip._id, { attempts });
    return attempts;
  },
});
