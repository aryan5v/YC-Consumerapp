import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { SLOTS } from "./lib/world";
import { WORLD_CACHE_VERSION, WORLD_CACHE_CLOCK, WORLD_CACHE_LANDMARKS, worldCacheScenes } from "./lib/worldCache";

export const prepare = internalMutation({
  args: { characterSheetUrl: v.string() },
  returns: v.id("worldClipCaches"),
  handler: async (ctx, { characterSheetUrl }) => {
    const url = new URL(characterSheetUrl);
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.hostname === "picsum.photos") {
      throw new Error("supply an approved HTTPS Mira identity reference, not a placeholder");
    }
    const existing = await ctx.db.query("worldClipCaches")
      .withIndex("by_version", (q) => q.eq("version", WORLD_CACHE_VERSION)).unique();
    if (existing !== null) {
      if (existing.characterSheetUrl !== characterSheetUrl) throw new Error("the cache reference is already frozen");
      return existing._id;
    }
    return await ctx.db.insert("worldClipCaches", {
      version: WORLD_CACHE_VERSION, characterSheetUrl, clips: [], selections: [], createdAt: Date.now(),
    });
  },
});

export const plan = internalQuery({
  args: { cacheId: v.id("worldClipCaches") },
  handler: async (ctx, { cacheId }) => {
    const cache = await ctx.db.get(cacheId);
    if (cache === null || cache.version !== WORLD_CACHE_VERSION) throw new Error("unknown landmark cache");
    return {
      cacheId, version: cache.version, characterSheetUrl: cache.characterSheetUrl,
      scenes: worldCacheScenes(), clips: cache.clips, selections: cache.selections,
      published: cache.publishedAt !== undefined,
      aspect: "9:16", seconds: 5, shortEdge: 768, model: "FastH3-Omni", task: "ref2va",
      conditions: [{ type: "image", role: "reference", uri: cache.characterSheetUrl }],
      configure: { ...WORLD_CACHE_CLOCK, palette: {}, landmarks: WORLD_CACHE_LANDMARKS, transitionMs: 0 },
    };
  },
});

export const uploadUrl = internalMutation({
  args: {}, returns: v.string(),
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

export const saveClip = internalMutation({
  args: {
    cacheId: v.id("worldClipCaches"), key: v.string(),
    storageId: v.id("_storage"), frameStorageId: v.id("_storage"), prompt: v.string(), seed: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cache = await ctx.db.get(args.cacheId);
    if (cache === null || cache.version !== WORLD_CACHE_VERSION) throw new Error("unknown landmark cache");
    if (cache.publishedAt !== undefined) throw new Error("published landmark clips are immutable");
    const scene = worldCacheScenes().find((entry) => entry.key === args.key);
    if (scene === undefined || args.prompt !== scene.prompt || args.seed !== scene.seed) {
      throw new Error("the take does not match its frozen plan");
    }
    const video = await ctx.db.system.get(args.storageId);
    const frame = await ctx.db.system.get(args.frameStorageId);
    const url = await ctx.storage.getUrl(args.storageId);
    const frameUrl = await ctx.storage.getUrl(args.frameStorageId);
    if (video === null || video.size === 0 || video.contentType !== "video/mp4" || url === null ||
        frame === null || frame.size === 0 || !["image/png", "image/jpeg"].includes(frame.contentType ?? "") || frameUrl === null) {
      throw new Error("the take and its last frame must be stored media");
    }
    const clip = {
      key: args.key, storageId: args.storageId, url, frameStorageId: args.frameStorageId,
      frameUrl, prompt: args.prompt, seed: args.seed,
    };
    await ctx.db.patch(cache._id, { clips: [...cache.clips.filter((entry) => entry.key !== args.key), clip] });
    return null;
  },
});

export const publish = internalMutation({
  args: {
    cacheId: v.id("worldClipCaches"),
    selections: v.array(v.object({ slot: v.string(), take: v.number(), evidence: v.string(), continuityState: v.string() })),
  },
  returns: v.null(),
  handler: async (ctx, { cacheId, selections }) => {
    const cache = await ctx.db.get(cacheId);
    if (cache === null || cache.version !== WORLD_CACHE_VERSION) throw new Error("unknown landmark cache");
    if (cache.publishedAt !== undefined) throw new Error("the landmark cache is already published");
    if (selections.length !== SLOTS.length || SLOTS.some((slot) => selections.filter((entry) => entry.slot === slot).length !== 1) ||
        selections.some((entry) => ![1, 2].includes(entry.take) || entry.evidence.trim() === "" || entry.continuityState.trim() === "")) {
      throw new Error("supply one judged winner and observed continuity state for each landmark");
    }
    for (const scene of worldCacheScenes()) {
      const clip = cache.clips.find((entry) => entry.key === scene.key);
      if (clip === undefined || clip.prompt !== scene.prompt || clip.seed !== scene.seed ||
          await ctx.db.system.get(clip.storageId) === null || await ctx.db.system.get(clip.frameStorageId) === null) {
        throw new Error(`both stored takes must be ready: ${scene.key}`);
      }
    }
    await ctx.db.patch(cacheId, { selections, publishedAt: Date.now() });
    return null;
  },
});
