import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { clipPrompt } from "./lib/style";
import { ChildSpec, childSpecs } from "./lib/story";
import { StopObject } from "./lib/director";
import { childrenOfBeat, maybeFinish, maybePrefetch } from "./lib/orchestration";

export const context = internalQuery({
  args: { beatId: v.id("beats") },
  handler: async (ctx, { beatId }) => {
    const beat = await ctx.db.get(beatId);
    if (beat === null) return null;
    const run = await ctx.db.get(beat.runId);
    if (run === null) return null;
    const episode = await ctx.db.get(run.episodeId);
    if (episode === null) return null;
    const recent = await ctx.db
      .query("storyMessages")
      .withIndex("by_user", (q) => q.eq("userId", run.userId))
      .order("desc")
      .take(6);
    const inbound = recent.find((message) => message.direction === "inbound");
    const parentBeat = beat.parentBeatId === undefined ? null : await ctx.db.get(beat.parentBeatId);
    let option: ChildSpec | null = null;
    if (parentBeat !== null && beat.optionId !== undefined && parentBeat.stop !== undefined) {
      option = childSpecs(parentBeat.stop).find((spec) => spec.optionId === beat.optionId) ?? null;
    }
    return {
      beat,
      run,
      episode,
      pathLabels: run.path,
      lastPlayerText: inbound?.text ?? null,
      parentBeat,
      option,
    };
  },
});

export const applyDirector = internalMutation({
  args: { beatId: v.id("beats"), director: v.any() },
  returns: v.null(),
  handler: async (ctx, { beatId, director }) => {
    const beat = await ctx.db.get(beatId);
    if (beat === null || beat.status === "cancelled") return null;
    if (beat.stop !== undefined || beat.ending !== undefined) return null;
    const run = await ctx.db.get(beat.runId);
    if (run === null) return null;
    const payload = director as Doc<"beats">["director"] & {
      clip_prompt: string;
      spoken_line?: string;
      narration: string;
      stop?: { kind: "choice" | "puzzle" } | null;
      state: Doc<"beats">["state"];
      ending?: { title: string; summary: string } | null;
    };

    const episode = await ctx.db.get(run.episodeId);
    const authored = beat.clipPrompt.trim() === "";
    const spokenLine = beat.spokenLine ?? payload.spoken_line;
    await ctx.db.patch(beatId, {
      narration: payload.narration,
      spokenLine,
      clipPrompt: authored ? clipPrompt(payload.clip_prompt) : beat.clipPrompt,
      stopKind: payload.stop?.kind,
      stop: payload.stop ?? undefined,
      director: payload,
      state: payload.state,
      ending: payload.ending ?? undefined,
      directorAttempts: beat.directorAttempts + 1,
    });
    if (run.currentBeatId === beatId && payload.state !== undefined) {
      await ctx.db.patch(run._id, { state: payload.state });
    }
    if (authored) {
      await ctx.scheduler.runAfter(0, internal.clips.ensureForBeat, { beatId });
    }
    await ctx.scheduler.runAfter(0, internal.speech.renderLine, { beatId });
    await maybePrefetch(ctx, beatId);
    await maybeFinish(ctx, run._id, beatId);
    return null;
  },
});

export const applyObjects = internalMutation({
  args: { beatId: v.id("beats"), objects: v.any() },
  returns: v.number(),
  handler: async (ctx, { beatId, objects }) => {
    const beat = await ctx.db.get(beatId);
    if (beat === null || beat.status === "cancelled") return 0;
    if (beat.stop !== undefined || beat.ending !== undefined) return 0;
    const run = await ctx.db.get(beat.runId);
    if (run === null || run.status !== "active") return 0;
    const existing = await childrenOfBeat(ctx, beatId);
    if (existing.length > 0) return 0;
    const stop = { kind: "choice" as const, objects: objects as StopObject[] };
    const specs = childSpecs(stop);
    if (specs.length === 0) return 0;
    await ctx.db.patch(beatId, { stop, stopKind: "choice" });
    let created = 0;
    for (const spec of specs) {
      const childId = await ctx.db.insert("beats", {
        runId: beat.runId,
        parentBeatId: beatId,
        optionId: spec.optionId,
        actionId: spec.actionId,
        depth: beat.depth + 1,
        status: "generating",
        narration: spec.narration,
        spokenLine: spec.spokenLine,
        clipPrompt: spec.clipPrompt === undefined ? "" : clipPrompt(spec.clipPrompt),
        directorAttempts: 0,
        createdAt: Date.now(),
      });
      await ctx.scheduler.runAfter(0, internal.director.generateBeat, { beatId: childId });
      created += 1;
    }
    await maybeFinish(ctx, run._id, beatId);
    return created;
  },
});

export const markStatus = internalMutation({
  args: { beatId: v.id("beats"), status: v.union(v.literal("generating"), v.literal("ready"), v.literal("failed"), v.literal("cancelled")), error: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { beatId, status, error }) => {
    const beat = await ctx.db.get(beatId);
    if (beat === null) return null;
    if (beat.status === "cancelled") return null;
    await ctx.db.patch(beatId, { status, error });
    return null;
  },
});
