import { v } from "convex/values";
import { mutation, query, internalAction, internalMutation, internalQuery, httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { ensureDeviceUser, requireDeviceUser } from "./lib/session";
import { sanitizeCustomPrompt } from "./lib/custom";
import { buildH3Prompt, PROFILE } from "./lib/h3";
import { trayGenerateDream, trayGetJob, trayDownload, trayJobReference } from "./lib/tray";
import { contentUrl } from "./lib/trayUniserve";
import { characterSheetUrl } from "./lib/config";
import { sleep } from "./lib/env";


export function buildDreamPrompt(prompt: string): string {
  const night = /\b(night|midnight|moon|stars)\b/i.test(prompt);
  return buildH3Prompt({
    mode: "t2va",
    shotSize: "wide shot",
    cameraMove: "Push In",
    cameraNote: "with small amplitude at slow speed",
    light: night
      ? "a warm practical lamp from camera left against cool night light"
      : "natural sunlight from camera left, with soft daylight filling the shadows",
    materials: "worn wood, brushed metal, natural fabric and real stone where present",
    preserved: null,
    beats: [
      prompt,
      "The protagonist slowly turns their head toward the scene's focal object, keeping both hands relaxed at their sides",
      "The scene's small physical movement continues naturally while fixed objects keep their positions",
      "The movement slows and the protagonist comes to rest without a cut",
    ],
    ambience: "Soft environmental tone and quiet physical sounds from the scene; no dialogue and no music",
    ending: "The final second is held in a steady wide framing with the protagonist and main objects clearly separated and none cut off by the frame edge",
    cast: PROFILE.cast,
  });
}

export const start = mutation({
  args: { deviceToken: v.string(), prompt: v.string() },
  returns: v.object({ dreamId: v.id("dreams") }),
  handler: async (ctx, { deviceToken, prompt }) => {
    const clean = sanitizeCustomPrompt(prompt);
    if (!clean.ok) throw new Error(clean.message);
    const user = await ensureDeviceUser(ctx, deviceToken);
    const now = Date.now();
    const recent = await ctx.db.query("dreams")
      .withIndex("by_user_created", (q) => q.eq("userId", user._id).gte("createdAt", now - 15 * 60_000)).collect();
    if (recent.length >= 3) throw new Error("three dreams is enough for now; try again in fifteen minutes");
    if (recent.some((dream) => ["writing", "generating"].includes(dream.status) && dream.createdAt > now - 5 * 60_000)) {
      throw new Error("your previous dream is still being made");
    }
    const dreamId = await ctx.db.insert("dreams", { userId: user._id, prompt: clean.prompt, status: "writing", createdAt: now, updatedAt: now });
    await ctx.scheduler.runAfter(0, internal.dream.generate, { dreamId });
    return { dreamId };
  },
});

export const watch = query({
  args: { deviceToken: v.string(), dreamId: v.id("dreams") },
  returns: v.object({
    status: v.union(v.literal("writing"), v.literal("generating"), v.literal("ready"), v.literal("failed")),
    prompt: v.string(), clipUrl: v.optional(v.string()), elapsedMs: v.number(), error: v.optional(v.string()),
  }),
  handler: async (ctx, { deviceToken, dreamId }) => {
    const user = await requireDeviceUser(ctx, deviceToken);
    const dream = await ctx.db.get(dreamId);
    if (dream === null || dream.userId !== user._id) throw new Error("this dream belongs to another device");
    const stored = dream.storageId === undefined ? null : await ctx.storage.getUrl(dream.storageId);
    const direct = stored ?? (dream.clipUrl?.includes("/api/storage/") ? dream.clipUrl : undefined);
    const playable = dream.status === "ready" && direct !== undefined && direct !== null;
    const status: "writing" | "generating" | "ready" | "failed" = playable
      ? "ready"
      : dream.status === "failed"
        ? "failed"
        : dream.status === "writing"
          ? "writing"
          : "generating";
    return {
      status,
      prompt: dream.prompt,
      clipUrl: playable ? direct : undefined,
      elapsedMs: Math.max(0, dream.updatedAt - dream.createdAt),
      error: dream.error,
    };
  },
});

export const read = internalQuery({
  args: { dreamId: v.id("dreams") },
  handler: async (ctx, { dreamId }) => await ctx.db.get(dreamId),
});

export const update = internalMutation({
  args: {
    dreamId: v.id("dreams"),
    status: v.union(v.literal("writing"), v.literal("generating"), v.literal("ready"), v.literal("failed")),
    h3Prompt: v.optional(v.string()), jobId: v.optional(v.string()), sourceUrl: v.optional(v.string()),
    mediaToken: v.optional(v.string()), clipUrl: v.optional(v.string()), error: v.optional(v.string()),
    promptMs: v.optional(v.number()), submitMs: v.optional(v.number()), pollMs: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, { dreamId, ...fields }) => {
    const dream = await ctx.db.get(dreamId);
    if (dream === null || dream.status === "ready" || dream.status === "failed") return null;
    const patch = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
    await ctx.db.patch(dreamId, { ...patch, updatedAt: Date.now() });
    return null;
  },
});

export const generate = internalAction({
  args: { dreamId: v.id("dreams") }, returns: v.null(),
  handler: async (ctx, { dreamId }) => {
    const dream = await ctx.runQuery(internal.dream.read, { dreamId });
    if (dream === null || dream.status !== "writing") return null;
    try {
      const promptStarted = Date.now();
      const h3Prompt = buildDreamPrompt(dream.prompt);
      const promptMs = Date.now() - promptStarted;
      await ctx.runMutation(internal.dream.update, { dreamId, status: "generating", h3Prompt, promptMs });
      const submitStarted = Date.now();
      const job = await trayGenerateDream({ prompt: h3Prompt, seed: 0, aspect: "9:16", seconds: 5 });
      const submitMs = Date.now() - submitStarted;
      await ctx.runMutation(internal.dream.update, { dreamId, status: "generating", jobId: job.jobId, submitMs });
      const pollStarted = Date.now();
      let touchedAt = Date.now();
      for (let poll = 0; poll < 400; poll += 1) {
        const state = await trayGetJob(job.jobId);
        if (state.status === "failed") throw new Error("video generation failed");
        if (state.status === "ready" && state.mp4Url !== null) {
          const reference = trayJobReference(job.jobId);
          const sourceUrl = reference.baseUrl === null ? state.mp4Url : contentUrl(reference.baseUrl, reference.jobId);
          const copyStarted = Date.now();
          const video = await trayDownload(sourceUrl);
          const storageId = await ctx.storage.store(new Blob([new Uint8Array(video.bytes)], { type: "video/mp4" }));
          const clipUrl = await ctx.storage.getUrl(storageId);
          if (clipUrl === null || !clipUrl.includes("/api/storage/")) throw new Error("stored clip has no direct URL");
          await ctx.runMutation(internal.dream.setStored, { dreamId, storageId, copyMs: Date.now() - copyStarted });
          await ctx.runMutation(internal.dream.update, {
            dreamId, status: "ready", sourceUrl, clipUrl, pollMs: Date.now() - pollStarted,
          });
          return null;
        }
        if (Date.now() - touchedAt >= 1000) {
          await ctx.runMutation(internal.dream.update, { dreamId, status: "generating" });
          touchedAt = Date.now();
        }
        await sleep(200);
      }
      throw new Error("video generation timed out");
    } catch {
      await ctx.runMutation(internal.dream.update, { dreamId, status: "failed", error: "This dream could not be made. Please try another scene." });
      return null;
    }
  },
});

export const setStored = internalMutation({
  args: { dreamId: v.id("dreams"), storageId: v.id("_storage"), copyMs: v.number() }, returns: v.null(),
  handler: async (ctx, { dreamId, storageId, copyMs }) => {
    if (await ctx.db.get(dreamId) !== null) await ctx.db.patch(dreamId, { storageId, copyMs });
    return null;
  },
});

export const mirror = internalAction({
  args: { dreamId: v.id("dreams") }, returns: v.null(),
  handler: async (ctx, { dreamId }) => {
    const dream = await ctx.runQuery(internal.dream.read, { dreamId });
    if (dream?.status !== "ready" || dream.sourceUrl === undefined || dream.storageId !== undefined) return null;
    try {
      const copyStarted = Date.now();
      const video = await trayDownload(dream.sourceUrl);
      const storageId = await ctx.storage.store(new Blob([new Uint8Array(video.bytes)], { type: video.contentType }));
      await ctx.runMutation(internal.dream.setStored, { dreamId, storageId, copyMs: Date.now() - copyStarted });
    } catch {}
    return null;
  },
});

export const media = httpAction(async (ctx, request) => {
  const parts = new URL(request.url).pathname.split("/").filter(Boolean);
  let dream;
  try { dream = await ctx.runQuery(internal.dream.read, { dreamId: parts[2] as Id<"dreams"> }); }
  catch { return new Response("not found", { status: 404 }); }
  if (dream?.status !== "ready" || !dream.mediaToken || parts[3] !== dream.mediaToken) return new Response("not found", { status: 404 });
  if (dream.storageId !== undefined) {
    const url = await ctx.storage.getUrl(dream.storageId);
    if (url !== null) return new Response(null, { status: 302, headers: { location: url, "access-control-allow-origin": "*" } });
  }
  if (!dream.sourceUrl || !dream.jobId) return new Response("not found", { status: 404 });
  const headers: Record<string, string> = { "user-agent": "Mozilla/5.0 Synqui/1.0" };
  if (trayJobReference(dream.jobId).baseUrl !== null && process.env.FASTH3_API_KEY) headers.authorization = `Bearer ${process.env.FASTH3_API_KEY}`;
  const range = request.headers.get("range");
  if (range !== null) headers.range = range;
  const upstream = await fetch(dream.sourceUrl, { headers, signal: AbortSignal.timeout(60000) });
  const responseHeaders = new Headers({ "content-type": "video/mp4", "access-control-allow-origin": "*", "access-control-expose-headers": "content-range,accept-ranges,content-length" });
  for (const key of ["content-length", "content-range", "accept-ranges"]) {
    const value = upstream.headers.get(key); if (value !== null) responseHeaders.set(key, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
});
