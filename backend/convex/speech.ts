import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { openaiConfigured, synthesize, voiceFor } from "./lib/openai";

export const setAudio = internalMutation({
  args: {
    beatId: v.id("beats"),
    storageId: v.id("_storage"),
    url: v.union(v.string(), v.null()),
    voice: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { beatId, storageId, url, voice }) => {
    const beat = await ctx.db.get(beatId);
    if (beat === null || beat.status === "cancelled") return null;
    await ctx.db.patch(beatId, {
      spokenAudioStorageId: storageId,
      spokenAudioUrl: url ?? undefined,
      spokenVoice: voice,
    });
    return null;
  },
});

export const renderLine = internalAction({
  args: { beatId: v.id("beats") },
  returns: v.null(),
  handler: async (ctx, { beatId }) => {
    const data = await ctx.runQuery(internal.speech.lineContext, { beatId });
    if (data === null) return null;
    if (!openaiConfigured()) return null;
    const voice = data.voice === "" ? voiceFor(data.characterName) : data.voice;
    try {
      const audio = await synthesize({
        text: data.line,
        voice,
        instructions: `You are ${data.characterName}. ${data.characterVoice} Say one short line of dialogue plainly, no narrator tone, no sound effects.`,
      });
      const storageId = await ctx.storage.store(audio);
      const url = await ctx.storage.getUrl(storageId);
      await ctx.runMutation(internal.speech.setAudio, { beatId, storageId, url, voice });
    } catch {
      return null;
    }
    return null;
  },
});

export const lineContext = internalQuery({
  args: { beatId: v.id("beats") },
  handler: async (ctx, { beatId }) => {
    const beat = await ctx.db.get(beatId);
    if (beat === null || beat.status === "cancelled") return null;
    if (beat.spokenAudioStorageId !== undefined) return null;
    const line = (beat.spokenLine ?? "").trim();
    if (line === "") return null;
    const run = await ctx.db.get(beat.runId);
    if (run === null) return null;
    const episode = await ctx.db.get(run.episodeId);
    if (episode === null) return null;
    return {
      line,
      voice: episode.voiceId,
      characterName: episode.character.name,
      characterVoice: episode.character.voice,
    };
  },
});
