import { v } from "convex/values";
import { mutation, query, internalAction, internalMutation, internalQuery, httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { ensureDeviceUser, requireDeviceUser } from "./lib/session";
import { sanitizeCustomPrompt } from "./lib/custom";
import { deepseekJSON, parseJSONObject } from "./lib/deepseek";
import { validateBeat } from "./lib/director";
import { PROFILE } from "./lib/h3";
import { trayGenerate, trayGetJob, trayDownload, trayJobReference } from "./lib/tray";
import { contentUrl } from "./lib/trayUniserve";
import { characterSheetUrl } from "./lib/config";
import { sleep } from "./lib/env";

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
    return { status: dream.status, prompt: dream.prompt, clipUrl: dream.clipUrl,
      elapsedMs: Math.max(0, dream.updatedAt - dream.createdAt), error: dream.error };
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
      const raw = await deepseekJSON([
        { role: "system", content: `Write one five-second live-action cinematic shot from a player's fictional world idea. Fixed cast: ${PROFILE.cast}. No real people, selfies, minors, readable text, logos, violence, sexual content or crowds. One simple physical action, real textures and a named light source with direction. Return JSON only: {"shot":{"mode":"t2va","shotSize":"wide shot","cameraMove":"Push In","cameraNote":"with small amplitude at slow speed","light":"source and direction","materials":"concrete surfaces","beats":["first beat","second beat","third beat","fourth beat"],"ambience":"physical sounds only","ending":"the final second is held in a steady wide framing with objects clearly separated"},"narration":"one short sentence"}. This is a cut, never a continuation. Do not invent extra shots or timestamps.` },
        { role: "user", content: dream.prompt },
      ], 1500);
      const checked = validateBeat(parseJSONObject(raw), { expectedKind: "choice", beatsLeft: 1, beatIndex: 0 });
      if (!checked.ok) throw new Error("invalid shot");
      await ctx.runMutation(internal.dream.update, { dreamId, status: "generating", h3Prompt: checked.beat.clip_prompt });
      const job = await trayGenerate({ prompt: checked.beat.clip_prompt, seed: 0, aspect: "9:16", seconds: 5,
        continuityFrameUrl: null, continuityVideoUrl: null,
        characterSheetUrl: process.env.DREAM_REFERENCE_URL ?? characterSheetUrl(), styleImageUrl: null });
      await ctx.runMutation(internal.dream.update, { dreamId, status: "generating", jobId: job.jobId });
      let touchedAt = Date.now();
      for (let poll = 0; poll < 360; poll += 1) {
        const state = await trayGetJob(job.jobId);
        if (state.status === "failed") throw new Error("video generation failed");
        if (state.status === "ready" && state.mp4Url !== null) {
          const reference = trayJobReference(job.jobId);
          const sourceUrl = reference.baseUrl === null ? state.mp4Url : contentUrl(reference.baseUrl, reference.jobId);
          const mediaToken = crypto.randomUUID();
          const site = process.env.CONVEX_SITE_URL;
          if (!site) throw new Error("media origin is not configured");
          const clipUrl = `${site}/dream/media/${dreamId}/${mediaToken}`;
          await ctx.runMutation(internal.dream.update, { dreamId, status: "ready", sourceUrl, mediaToken, clipUrl });
          await ctx.scheduler.runAfter(0, internal.dream.mirror, { dreamId });
          return null;
        }
        if (Date.now() - touchedAt >= 1000) {
          await ctx.runMutation(internal.dream.update, { dreamId, status: "generating" });
          touchedAt = Date.now();
        }
        await sleep(300);
      }
      throw new Error("video generation timed out");
    } catch {
      await ctx.runMutation(internal.dream.update, { dreamId, status: "failed", error: "This dream could not be made. Please try another scene." });
      return null;
    }
  },
});

export const setStored = internalMutation({
  args: { dreamId: v.id("dreams"), storageId: v.id("_storage") }, returns: v.null(),
  handler: async (ctx, { dreamId, storageId }) => {
    if (await ctx.db.get(dreamId) !== null) await ctx.db.patch(dreamId, { storageId });
    return null;
  },
});

export const mirror = internalAction({
  args: { dreamId: v.id("dreams") }, returns: v.null(),
  handler: async (ctx, { dreamId }) => {
    const dream = await ctx.runQuery(internal.dream.read, { dreamId });
    if (dream?.status !== "ready" || dream.sourceUrl === undefined || dream.storageId !== undefined) return null;
    try {
      const video = await trayDownload(dream.sourceUrl);
      const storageId = await ctx.storage.store(new Blob([new Uint8Array(video.bytes)], { type: video.contentType }));
      await ctx.runMutation(internal.dream.setStored, { dreamId, storageId });
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
