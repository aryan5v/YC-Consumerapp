import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { maxPolls, pollMs } from "./lib/config";
import { trayCancel, trayDetect, trayGenerate, trayGetJob, trayMode } from "./lib/tray";

export const startClip = internalAction({
  args: { beatId: v.id("beats") },
  returns: v.null(),
  handler: async (ctx, { beatId }) => {
    const data = await ctx.runQuery(internal.clips.work, { beatId });
    if (data === null || data.clip.status !== "queued") return null;
    try {
      const job = await trayGenerate({
        prompt: data.clip.prompt,
        continuityFrameUrl: data.anchors.continuityFrameUrl,
        continuityVideoUrl: data.anchors.continuityVideoUrl,
        characterSheetUrl: data.anchors.characterSheetUrl,
        styleImageUrl: data.anchors.styleImageUrl,
        voiceRefUrl: data.anchors.voiceRefUrl,
        seed: data.clip.seed,
        aspect: data.clip.aspect,
        seconds: data.clip.seconds,
      });
      await ctx.runMutation(internal.clips.setJob, { beatId, jobId: job.jobId });
      await ctx.scheduler.runAfter(pollMs(), internal.tray.pollClip, { beatId, attempt: 1 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.clips.markFailed, { beatId, error: `generate: ${message}`, retryable: true });
    }
    return null;
  },
});

export const pollClip = internalAction({
  args: { beatId: v.id("beats"), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, { beatId, attempt }) => {
    const data = await ctx.runQuery(internal.clips.work, { beatId });
    if (data === null) return null;
    const clip = data.clip;
    if (clip.status === "ready" || clip.status === "cancelled" || clip.status === "failed") return null;
    if (clip.jobId === undefined) {
      await ctx.runMutation(internal.clips.markFailed, { beatId, error: "no tray job id", retryable: true });
      return null;
    }
    if (attempt > maxPolls()) {
      await ctx.runMutation(internal.clips.markFailed, {
        beatId,
        error: `tray job ${clip.jobId} did not finish after ${attempt - 1} polls`,
      });
      return null;
    }
    try {
      const job = await trayGetJob(clip.jobId);
      if (job.status === "ready" && job.mp4Url !== null) {
        await ctx.runMutation(internal.clips.markReady, {
          beatId,
          url: job.mp4Url,
          lastFrameUrl: job.lastFrameUrl ?? undefined,
        });
        return null;
      }
      if (job.status === "failed") {
        await ctx.runMutation(internal.clips.markFailed, { beatId, error: job.error ?? "tray job failed", retryable: true });
        return null;
      }
      await ctx.scheduler.runAfter(pollMs(), internal.tray.pollClip, { beatId, attempt: attempt + 1 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= maxPolls()) {
        await ctx.runMutation(internal.clips.markFailed, { beatId, error: `poll: ${message}` });
        return null;
      }
      await ctx.scheduler.runAfter(pollMs(), internal.tray.pollClip, { beatId, attempt: attempt + 1 });
    }
    return null;
  },
});

export const runDetect = internalAction({
  args: { beatId: v.id("beats") },
  returns: v.null(),
  handler: async (ctx, { beatId }) => {
    const data = await ctx.runQuery(internal.clips.work, { beatId });
    if (data === null) return null;
    try {
      if (data.clip.lastFrameUrl === undefined || data.targets.length === 0) {
        await ctx.runMutation(internal.clips.setBoxes, { beatId, boxes: {} });
        return null;
      }
      const result = await trayDetect(
        data.clip.lastFrameUrl,
        data.targets.map((target) => target.target),
      );
      const boxes: Record<string, unknown> = {};
      for (const target of data.targets) {
        boxes[target.optionId] = result.boxes[target.target] ?? null;
      }
      await ctx.runMutation(internal.clips.setBoxes, { beatId, boxes });
    } catch {
      await ctx.runMutation(internal.clips.setBoxes, { beatId, boxes: {} });
    }
    return null;
  },
});

export const cancelClip = internalAction({
  args: { beatId: v.id("beats") },
  returns: v.null(),
  handler: async (ctx, { beatId }) => {
    const clip = await ctx.runQuery(internal.clips.forBeat, { beatId });
    if (clip === null || clip.jobId === undefined) return null;
    try {
      await trayCancel(clip.jobId);
    } catch {
      return null;
    }
    return null;
  },
});

export const mode = internalAction({
  args: {},
  returns: v.union(v.literal("live"), v.literal("mock")),
  handler: async () => trayMode(),
});
