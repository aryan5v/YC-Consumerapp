import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { maxPolls, pollMs } from "./lib/config";
import { trayCancel, trayDownload, trayGenerate, trayGetJob, trayMode } from "./lib/tray";
import { segmentConfigured, segmentFrame } from "./lib/segment";

export const startClip = internalAction({
  args: { beatId: v.id("beats") },
  returns: v.null(),
  handler: async (ctx, { beatId }) => {
    const data = await ctx.runQuery(internal.clips.work, { beatId });
    if (data === null) return null;
    const attemptToken = await ctx.runMutation(internal.clips.claimAttempt, { beatId });
    if (attemptToken === null) return null;
    try {
      const job = await trayGenerate({
        prompt: data.clip.prompt,
        continuityFrameUrl: data.anchors.continuityFrameUrl,
        continuityVideoUrl: data.anchors.continuityVideoUrl,
        characterSheetUrl: data.anchors.characterSheetUrl,
        styleImageUrl: data.anchors.styleImageUrl,
        seed: data.clip.seed,
        aspect: data.clip.aspect,
        seconds: data.clip.seconds,
      });
      const stored = await ctx.runMutation(internal.clips.setJob, {
        beatId,
        jobId: job.jobId,
        attemptToken,
      });
      if (!stored) {
        await trayCancel(job.jobId).catch(() => null);
        return null;
      }
      await ctx.scheduler.runAfter(pollMs(), internal.tray.pollClip, { beatId, attempt: 1, attemptToken });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.clips.markFailed, { beatId, error: `generate: ${message}`, retryable: true });
    }
    return null;
  },
});

export const pollClip = internalAction({
  args: { beatId: v.id("beats"), attempt: v.number(), attemptToken: v.string() },
  returns: v.null(),
  handler: async (ctx, { beatId, attempt, attemptToken }) => {
    const data = await ctx.runQuery(internal.clips.work, { beatId });
    if (data === null) return null;
    const clip = data.clip;
    if (clip.status === "cancelled" || clip.status === "failed") {
      if (clip.jobId !== undefined) await trayCancel(clip.jobId).catch(() => null);
      return null;
    }
    if (clip.status !== "generating" || clip.attemptToken !== attemptToken) return null;
    if (clip.jobId === undefined) {
      await ctx.runMutation(internal.clips.markFailed, { beatId, error: "no tray job id", retryable: true });
      return null;
    }
    if (attempt > maxPolls()) {
      await trayCancel(clip.jobId).catch(() => null);
      await ctx.runMutation(internal.clips.markFailed, {
        beatId,
        error: `tray job ${clip.jobId} did not finish after ${attempt - 1} polls`,
      });
      return null;
    }
    try {
      const job = await trayGetJob(clip.jobId);
      if (job.status === "ready" && job.mp4Url !== null) {
        const mirrored = await mirrorClip(ctx, job.mp4Url);
        await ctx.runMutation(internal.clips.markReady, {
          beatId,
          url: mirrored.url,
          lastFrameUrl: job.lastFrameUrl ?? undefined,
          storageId: mirrored.storageId,
        });
        if (mirrored.mirrored) await trayCancel(clip.jobId).catch(() => null);
        return null;
      }
      if (job.status === "failed") {
        await ctx.runMutation(internal.clips.markFailed, { beatId, error: job.error ?? "tray job failed", retryable: true });
        return null;
      }
      await ctx.scheduler.runAfter(pollMs(), internal.tray.pollClip, {
        beatId,
        attempt: attempt + 1,
        attemptToken,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= maxPolls()) {
        await trayCancel(clip.jobId).catch(() => null);
        await ctx.runMutation(internal.clips.markFailed, { beatId, error: `poll: ${message}` });
        return null;
      }
      await ctx.scheduler.runAfter(pollMs(), internal.tray.pollClip, {
        beatId,
        attempt: attempt + 1,
        attemptToken,
      });
    }
    return null;
  },
});

async function mirrorClip(
  ctx: { storage: { store: (blob: Blob) => Promise<Id<"_storage">>; getUrl: (id: Id<"_storage">) => Promise<string | null> } },
  mp4Url: string,
): Promise<{ url: string; storageId?: Id<"_storage">; mirrored: boolean }> {
  if (trayMode() === "mock") return { url: mp4Url, mirrored: false };
  const { bytes, contentType } = await trayDownload(mp4Url);
  const blob = new Blob([new Uint8Array(bytes)], { type: contentType });
  const storageId = await ctx.storage.store(blob);
  const url = await ctx.storage.getUrl(storageId);
  if (url === null) throw new Error("stored the clip but Convex returned no URL for it");
  return { url, storageId, mirrored: true };
}

export const runSegment = internalAction({
  args: { beatId: v.id("beats") },
  returns: v.null(),
  handler: async (ctx, { beatId }) => {
    const data = await ctx.runQuery(internal.clips.work, { beatId });
    if (data === null) return null;
    try {
      if (data.clip.lastFrameUrl === undefined || data.targets.length === 0 || !segmentConfigured()) {
        await ctx.runMutation(internal.clips.setRegions, { beatId, regions: {} });
        return null;
      }
      const found = await segmentFrame(
        data.clip.lastFrameUrl,
        data.targets.map((target) => target.target),
      );
      const regions: Record<string, unknown> = {};
      for (const target of data.targets) {
        regions[target.optionId] = found[target.target] ?? null;
      }
      await ctx.runMutation(internal.clips.setRegions, { beatId, regions });
    } catch {
      await ctx.runMutation(internal.clips.setRegions, { beatId, regions: {} });
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
