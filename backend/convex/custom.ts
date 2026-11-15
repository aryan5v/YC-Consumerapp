import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { CustomSeed, writeCustomSeed } from "./lib/custom";
import { voiceFor } from "./lib/openai";

export const refineSeed = internalAction({
  args: { episodeId: v.id("episodes"), beatId: v.id("beats"), prompt: v.string() },
  returns: v.null(),
  handler: async (ctx, { episodeId, beatId, prompt }) => {
    const seed = await writeCustomSeed(prompt);
    await ctx.runMutation(internal.custom.applySeed, { episodeId, beatId, seed });
    return null;
  },
});

export const applySeed = internalMutation({
  args: { episodeId: v.id("episodes"), beatId: v.id("beats"), seed: v.any() },
  returns: v.null(),
  handler: async (ctx, { episodeId, beatId, seed }) => {
    const episode = await ctx.db.get(episodeId);
    if (episode !== null && episode.date.startsWith("custom-")) {
      const parsed = seed as CustomSeed;
      await ctx.db.patch(episodeId, {
        title: parsed.title,
        tagline: parsed.tagline,
        premise: parsed.premise,
        character: parsed.character,
        voiceId: voiceFor(parsed.character.name),
      });
    }
    await ctx.scheduler.runAfter(0, internal.director.generateBeat, { beatId });
    return null;
  },
});
