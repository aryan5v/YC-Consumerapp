import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { CASE_ONE, caseScenes, checkCaseLogic, readCase } from "./lib/case";
import { ensureEpisode } from "./lib/episodes";
import { pacificDate } from "./lib/pacific";
import { normalizeRegion } from "./lib/segment";

export const prepare = internalMutation({
  args: {},
  returns: v.id("caseBundles"),
  handler: async (ctx) => {
    if (!checkCaseLogic(CASE_ONE)) throw new Error("the authored case has no unique solution");
    const episode = await ensureEpisode(ctx, pacificDate());
    const existing = await ctx.db.query("caseBundles")
      .withIndex("by_episode_version", (q) => q.eq("episodeId", episode._id).eq("version", "pier-nine-v1")).unique();
    if (existing !== null) return existing._id;
    return await ctx.db.insert("caseBundles", {
      episodeId: episode._id, version: "pier-nine-v1", data: CASE_ONE, clips: [], createdAt: Date.now(),
    });
  },
});

export const plan = internalQuery({
  args: { caseId: v.id("caseBundles") },
  handler: async (ctx, { caseId }) => {
    const bundle = await ctx.db.get(caseId);
    if (bundle === null) throw new Error("case not found");
    const data = readCase(bundle.data);
    if (data === null) throw new Error("case data is invalid");
    const episode = await ctx.db.get(bundle.episodeId);
    if (episode === null) throw new Error("episode not found");
    return {
      caseId, scenes: caseScenes(data), clips: bundle.clips, published: bundle.publishedAt !== undefined,
      targets: data.clues.map((clue) => ({ id: clue.id, target: clue.object })),
      characterSheetUrl: episode.characterSheetUrl,
      seed: episode.seed, aspect: episode.aspect, seconds: episode.seconds,
    };
  },
});

export const uploadUrl = internalMutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => await ctx.storage.generateUploadUrl(),
});

export const saveClip = internalMutation({
  args: {
    caseId: v.id("caseBundles"), key: v.string(), storageId: v.id("_storage"),
    audioStorageId: v.id("_storage"), frameStorageId: v.optional(v.id("_storage")),
    regions: v.optional(v.any()),
  },
  returns: v.null(),
  handler: async (ctx, { caseId, key, storageId, audioStorageId, frameStorageId, regions }) => {
    const bundle = await ctx.db.get(caseId);
    if (bundle === null) throw new Error("case not found");
    if (bundle.publishedAt !== undefined) throw new Error("published case clips are immutable");
    const data = readCase(bundle.data);
    if (data === null || !caseScenes(data).some((scene) => scene.key === key)) throw new Error("unknown scene");
    const url = await ctx.storage.getUrl(storageId);
    const audioUrl = await ctx.storage.getUrl(audioStorageId);
    const frameUrl = frameStorageId === undefined ? undefined : await ctx.storage.getUrl(frameStorageId);
    if (url === null || audioUrl === null) throw new Error("case media is not stored");
    const normalized = Object.fromEntries(data.clues.map((clue) => [clue.id, normalizeRegion(regions?.[clue.id])]));
    const clip = { key, url, storageId, audioStorageId, audioUrl, frameUrl: frameUrl ?? undefined, regions: normalized };
    await ctx.db.patch(caseId, { clips: [...bundle.clips.filter((entry) => entry.key !== key), clip] });
    return null;
  },
});

export const publish = internalMutation({
  args: { caseId: v.id("caseBundles") },
  returns: v.null(),
  handler: async (ctx, { caseId }) => {
    const bundle = await ctx.db.get(caseId);
    if (bundle === null) throw new Error("case not found");
    const data = readCase(bundle.data);
    if (data === null || !checkCaseLogic(data)) throw new Error("the case solution is invalid");
    for (const scene of caseScenes(data)) {
      const clip = bundle.clips.find((entry) => entry.key === scene.key);
      if (clip === undefined || clip.audioUrl === undefined) throw new Error(`case clip ${scene.key} is not ready`);
      if (await ctx.storage.getMetadata(clip.storageId) === null ||
          clip.audioStorageId === undefined || await ctx.storage.getMetadata(clip.audioStorageId) === null) {
        throw new Error(`case clip ${scene.key} is missing from storage`);
      }
    }
    await ctx.db.patch(caseId, { publishedAt: bundle.publishedAt ?? Date.now() });
    await ctx.db.patch(bundle.episodeId, {
      activeCaseId: caseId, title: data.title, tagline: data.question,
      ...(bundle.clips.find((clip) => clip.key === "opening")!.frameUrl === undefined ? {} : {
        posterUrl: bundle.clips.find((clip) => clip.key === "opening")!.frameUrl!,
      }),
    });
    return null;
  },
});
