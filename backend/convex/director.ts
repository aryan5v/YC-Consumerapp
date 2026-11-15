import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { deepseekJSON, directorMode, parseJSONObject } from "./lib/deepseek";
import {
  DirectorBeat,
  DirectorBeatState,
  buildDirectorMessages,
  expectedStopKind,
  fallbackBeat,
  validateBeat,
} from "./lib/director";
import { fixtureBeat } from "./lib/fixture";

export const generateBeat = internalAction({
  args: { beatId: v.id("beats") },
  returns: v.null(),
  handler: async (ctx, { beatId }) => {
    const data = await ctx.runQuery(internal.beats.context, { beatId });
    if (data === null) return null;
    const { beat, run, episode, pathLabels } = data;
    if (beat.status === "cancelled") return null;
    if (beat.stop !== undefined || beat.ending !== undefined) {
      await ctx.runMutation(internal.clips.ensureForBeat, { beatId });
      return null;
    }

    const beatsLeft = Math.max(1, episode.beatsTotal - beat.depth);
    const expectedKind = expectedStopKind(beat.depth, episode.beatsTotal);
    const state: DirectorBeatState = run.state;

    let director: DirectorBeat | null = null;
    let lastError: string | undefined;
    for (let attempt = 0; attempt < 2 && director === null; attempt += 1) {
      try {
        if (directorMode() === "fixture") {
          const raw = fixtureBeat({ depth: beat.depth, beatsTotal: episode.beatsTotal, state, pathLabels });
          const result = validateBeat(raw, { expectedKind, beatsLeft, beatIndex: beat.depth });
          if (result.ok) director = result.beat;
          else lastError = result.error;
          continue;
        }
        const raw = await deepseekJSON(
          buildDirectorMessages(
            {
              episodeTitle: episode.title,
              premise: episode.premise,
              styleBible: episode.styleBible,
              beatIndex: beat.depth,
              beatsTotal: episode.beatsTotal,
              beatsLeft,
              expectedKind,
              pathLabels,
              state,
            },
            lastError,
          ),
        );
        const result = validateBeat(parseJSONObject(raw), { expectedKind, beatsLeft, beatIndex: beat.depth });
        if (result.ok) director = result.beat;
        else lastError = result.error;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }

    if (director === null) {
      director = fallbackBeat({ beatIndex: beat.depth, beatsLeft, expectedKind, state });
    }
    await ctx.runMutation(internal.beats.applyDirector, { beatId, director });
    return null;
  },
});
