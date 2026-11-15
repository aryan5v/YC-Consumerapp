import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import {
  PREWARM_MAX_AGE_MS,
  STORY_OPENING_KEY,
  captureOpening,
  openingFor,
  prewarmUser,
} from "./lib/openings";
import { pacificDate } from "./lib/pacific";
import { ensureEpisode } from "./lib/episodes";

// Pre-generation, story half. Today's opening — the first shot and every option shot hanging off
// it — is rendered once by a run nobody plays, ahead of the first player. A fresh run replays that
// stored opening instead of waiting about forty seconds for it.
export const ensureToday = internalAction({
  args: {},
  returns: v.union(v.id("runs"), v.null()),
  handler: async (ctx): Promise<Id<"runs"> | null> => {
    const episodeId: Id<"episodes"> = await ctx.runMutation(internal.openings.ensureTodayEpisode, {});
    return await ctx.runMutation(internal.openings.startPrewarmRun, { episodeId });
  },
});

export const ensureTodayEpisode = internalMutation({
  args: {},
  returns: v.id("episodes"),
  handler: async (ctx) => {
    const episode = await ensureEpisode(ctx, pacificDate());
    return episode._id;
  },
});

export const startPrewarmRun = internalMutation({
  args: { episodeId: v.id("episodes") },
  returns: v.union(v.id("runs"), v.null()),
  handler: async (ctx, { episodeId }): Promise<Id<"runs"> | null> => {
    if ((await openingFor(ctx, episodeId, STORY_OPENING_KEY)) !== null) return null;
    const userId = await prewarmUser(ctx);
    for (const run of await ctx.db
      .query("runs")
      .withIndex("by_user_episode", (q) => q.eq("userId", userId).eq("episodeId", episodeId))
      .collect()) {
      if (run.status !== "active" || run.prewarm !== true) continue;
      if (Date.now() - run.startedAt < PREWARM_MAX_AGE_MS) return null;
      await ctx.db.patch(run._id, {
        status: "ended",
        endedAt: Date.now(),
        error: "abandoned: this pre-generation attempt did not finish",
      });
    }
    const episode = await ctx.db.get(episodeId);
    if (episode === null) throw new Error("episode not found");
    const runId = await ctx.db.insert("runs", {
      userId,
      episodeId,
      prewarm: true,
      status: "active",
      path: [],
      optionPath: [],
      beatsSeen: 0,
      state: { items: [], trust: 0, clues: [], beats_left: episode.beatsTotal },
      startedAt: Date.now(),
    });
    const beatId = await ctx.db.insert("beats", {
      runId,
      depth: 0,
      status: "generating",
      clipPrompt: "",
      directorAttempts: 0,
      createdAt: Date.now(),
    });
    await ctx.db.patch(runId, { currentBeatId: beatId });
    await ctx.scheduler.runAfter(0, internal.director.generateBeat, { beatId });
    return runId;
  },
});

// Called by the clip pipeline whenever a shot of a pre-generation run lands.
export const capture = internalMutation({
  args: { runId: v.id("runs") },
  returns: v.boolean(),
  handler: async (ctx, { runId }): Promise<boolean> => {
    const run = await ctx.db.get(runId);
    if (run === null) return false;
    return await captureOpening(ctx, run.episodeId, runId);
  },
});

export const forEpisode = internalQuery({
  args: { episodeId: v.id("episodes") },
  returns: v.any(),
  handler: async (ctx, { episodeId }) => {
    return await openingFor(ctx, episodeId, STORY_OPENING_KEY);
  },
});
