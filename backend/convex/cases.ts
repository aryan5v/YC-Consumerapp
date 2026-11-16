import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { CASE_ONE, caseScenesForVersion, checkCaseLogic, readCase } from "./lib/case";
import { ensureEpisode } from "./lib/episodes";
import { pacificDate } from "./lib/pacific";
import { normalizeRegion, usableRegion } from "./lib/segment";
import { ensurePlayer } from "./lib/session";
import { playCaseClip } from "./lib/caseRuntime";

export const prepare = internalMutation({
  args: { version: v.optional(v.union(v.literal("pier-nine-v1"), v.literal("pier-nine-v2"))) },
  returns: v.id("caseBundles"),
  handler: async (ctx, { version = "pier-nine-v1" }) => {
    if (!checkCaseLogic(CASE_ONE)) throw new Error("the authored case has no unique solution");
    const episode = await ensureEpisode(ctx, pacificDate());
    const existing = await ctx.db.query("caseBundles")
      .withIndex("by_episode_version", (q) => q.eq("episodeId", episode._id).eq("version", version)).unique();
    if (existing !== null) return existing._id;
    return await ctx.db.insert("caseBundles", {
      episodeId: episode._id, version, data: CASE_ONE, clips: [], createdAt: Date.now(),
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
    const original = bundle.version === "pier-nine-v2" ? await ctx.db.query("caseBundles")
      .withIndex("by_episode_version", (q) => q.eq("episodeId", episode._id).eq("version", "pier-nine-v1")).unique() : null;
    return {
      caseId, version: bundle.version, scenes: caseScenesForVersion(data, bundle.version), clips: bundle.clips,
      published: bundle.publishedAt !== undefined, active: episode.activeCaseId === caseId,
      targets: data.clues.map((clue) => ({ id: clue.id, target: clue.object })),
      characterSheetUrl: original?.clips.find((clip) => clip.key === "opening")?.frameUrl ?? episode.characterSheetUrl,
      seed: episode.seed, aspect: episode.aspect, seconds: episode.seconds,
      originalClips: original?.clips ?? [],
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
    prompt: v.optional(v.string()), seed: v.optional(v.number()), inputFrameUrl: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { caseId, key, storageId, audioStorageId, frameStorageId, regions, prompt, seed, inputFrameUrl }) => {
    const bundle = await ctx.db.get(caseId);
    if (bundle === null) throw new Error("case not found");
    if (bundle.publishedAt !== undefined) throw new Error("published case clips are immutable");
    const data = readCase(bundle.data);
    if (data === null || !caseScenesForVersion(data, bundle.version).some((scene) => scene.key === key)) throw new Error("unknown scene");
    const url = await ctx.storage.getUrl(storageId);
    const audioUrl = await ctx.storage.getUrl(audioStorageId);
    const frameUrl = frameStorageId === undefined ? undefined : await ctx.storage.getUrl(frameStorageId);
    if (url === null || audioUrl === null) throw new Error("case media is not stored");
    const normalized = Object.fromEntries(data.clues.map((clue) => [clue.id, normalizeRegion(regions?.[clue.id])]));
    const clip = { key, url, storageId, audioStorageId, audioUrl, frameUrl: frameUrl ?? undefined, regions: normalized, prompt, seed, inputFrameUrl };
    await ctx.db.patch(caseId, { clips: [...bundle.clips.filter((entry) => entry.key !== key), clip] });
    return null;
  },
});

export const publish = internalMutation({
  args: { caseId: v.id("caseBundles"), activate: v.optional(v.boolean()), deadlineAt: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { caseId, activate = true, deadlineAt }) => {
    const bundle = await ctx.db.get(caseId);
    if (bundle === null) throw new Error("case not found");
    const data = readCase(bundle.data);
    if (data === null || !checkCaseLogic(data)) throw new Error("the case solution is invalid");
    const episode = await ctx.db.get(bundle.episodeId);
    if (episode === null) throw new Error("episode not found");
    for (const scene of caseScenesForVersion(data, bundle.version)) {
      const clip = bundle.clips.find((entry) => entry.key === scene.key);
      if (clip === undefined || clip.audioUrl === undefined) throw new Error(`case clip ${scene.key} is not ready`);
      if (await ctx.db.system.get(clip.storageId) === null ||
          clip.audioStorageId === undefined || await ctx.db.system.get(clip.audioStorageId) === null) {
        throw new Error(`case clip ${scene.key} is missing from storage`);
      }
      if (bundle.version === "pier-nine-v2" && (![scene.prompt, (scene as { alternatePrompt?: string }).alternatePrompt].includes(clip.prompt) || clip.seed !== episode.seed ||
          clip.frameUrl === undefined || (scene.key !== "opening" && clip.inputFrameUrl !== bundle.clips.find((entry) => entry.key === "opening")?.frameUrl))) {
        throw new Error(`strict continuity metadata is missing for ${scene.key}`);
      }
    }
    if (activate && bundle.version === "pier-nine-v2") {
      if (deadlineAt !== undefined && Date.now() >= deadlineAt) throw new Error("the activation deadline has passed");
      const previews = await ctx.db.query("runs").withIndex("by_case", (q) => q.eq("caseId", caseId)).collect();
      if (!previews.some((run) => run.caseResult?.solved === true) || !previews.some((run) => run.caseResult?.solved === false)) {
        throw new Error("both preview endings must pass before activation");
      }
    }
    await ctx.db.patch(caseId, { publishedAt: bundle.publishedAt ?? Date.now() });
    if (!activate) return null;
    await ctx.db.patch(bundle.episodeId, {
      activeCaseId: caseId, title: data.title, tagline: data.question,
      ...(bundle.clips.find((clip) => clip.key === "opening")!.frameUrl === undefined ? {} : {
        posterUrl: bundle.clips.find((clip) => clip.key === "opening")!.frameUrl!,
      }),
    });
    return null;
  },
});

export const preview = internalMutation({
  args: { caseId: v.id("caseBundles"), deviceToken: v.string() },
  returns: v.id("runs"),
  handler: async (ctx, { caseId, deviceToken }) => {
    const bundle = await ctx.db.get(caseId);
    if (bundle?.publishedAt === undefined) throw new Error("the preview case is not ready");
    const user = await ensurePlayer(ctx, deviceToken);
    const data = readCase(bundle.data);
    if (data === null) throw new Error("invalid case");
    const past = await ctx.db.query("runs").withIndex("by_user_episode", (q) => q.eq("userId", user._id).eq("episodeId", bundle.episodeId)).collect();
    if (past.length > 0) throw new Error("use a fresh device token for a preview");
    const runId = await ctx.db.insert("runs", {
      userId: user._id, episodeId: bundle.episodeId, caseId, caseClues: [], status: "active", path: [], optionPath: [], beatsSeen: 0,
      state: { items: [], trust: 0, clues: [], beats_left: data.moves }, startedAt: Date.now(), lastActivityAt: Date.now(),
    });
    await playCaseClip(ctx, (await ctx.db.get(runId))!, "opening", 0);
    return runId;
  },
});

export const repairRegions = internalMutation({
  args: { caseId: v.id("caseBundles"), key: v.string(), regions: v.any() },
  returns: v.null(),
  handler: async (ctx, { caseId, key, regions }) => {
    const bundle = await ctx.db.get(caseId);
    if (bundle === null) throw new Error("case not found");
    const data = readCase(bundle.data);
    if (data === null || !bundle.clips.some((clip) => clip.key === key)) throw new Error("case clip not found");
    const checked = Object.fromEntries(data.clues.map((clue) => [clue.id, usableRegion(regions?.[clue.id])]));
    await ctx.db.patch(caseId, { clips: bundle.clips.map((clip) => clip.key === key ? { ...clip, regions: checked } : clip) });
    return null;
  },
});
