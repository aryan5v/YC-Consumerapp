import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { deepseekJSON, directorMode, parseJSONObject } from "./lib/deepseek";
import {
  DirectorBeat,
  DirectorBeatState,
  StopObject,
  buildDirectorMessages,
  buildObjectsMessages,
  expectedStopKind,
  fallbackBeat,
  fallbackObjects,
  validateBeat,
  validateObjects,
} from "./lib/director";
import { fixtureBeat, fixtureObjectsFor } from "./lib/fixture";
import { actionsPerObject, objectsPerBeat } from "./lib/config";
import { directorProvider } from "./lib/deepseek";

export const authorObjects = internalAction({
  args: { beatId: v.id("beats") },
  returns: v.null(),
  handler: async (ctx, { beatId }) => {
    const data = await ctx.runQuery(internal.beats.context, { beatId });
    if (data === null) return null;
    const { beat, run, episode, pathLabels, lastPlayerText } = data;
    if (beat.status === "cancelled" || beat.stop !== undefined || beat.ending !== undefined) return null;
    if (beat.clipPrompt.trim() === "") return null;
    if (expectedStopKind(beat.depth, episode.beatsTotal) !== "choice") return null;
    if (run.status !== "active" || run.currentBeatId !== beatId) return null;

    const clip = await ctx.runQuery(internal.clips.forBeat, { beatId });
    const frameObjects: { name: string; score: number }[] = [];
    const lastFrameUrl = clip?.lastFrameUrl ?? null;
    if (frameObjects.length === 0 && lastFrameUrl === null && clip?.status !== "ready") {
      await ctx.scheduler.runAfter(2000, internal.director.authorObjects, { beatId });
      return null;
    }

    const objectCount = objectsPerBeat();
    const actionCount = actionsPerObject();
    const context = {
      episodeTitle: episode.title,
      premise: episode.premise,
      character: episode.character,
      beatIndex: beat.depth,
      beatsLeft: Math.max(1, episode.beatsTotal - beat.depth),
      pathLabels,
      state: beat.state ?? run.state,
      clipPrompt: beat.clipPrompt,
      spokenLine: beat.spokenLine ?? "",
      lastPlayerText: beat.depth === 0 ? lastPlayerText : null,
      frameObjects,
      objectCount,
      actionCount,
    };

    let objects: StopObject[] | null = null;
    let lastError: string | undefined;
    for (let attempt = 0; attempt < 2 && objects === null; attempt += 1) {
      try {
        if (directorMode() === "fixture") {
          const written = fixtureObjectsFor(beat.depth, objectCount);
          const result = validateObjects(
            { objects: written },
            { objectCount, actionCount, clipPrompt: beat.clipPrompt, frameNames: written.map((object) => object.target) },
          );
          if (result.ok) objects = result.objects;
          else lastError = result.error;
          continue;
        }
        const raw = await deepseekJSON(
          buildObjectsMessages(context, lastError),
          directorProvider() === "openai" ? 4000 : 2500,
        );
        const result = validateObjects(parseJSONObject(raw), {
          objectCount,
          actionCount,
          clipPrompt: beat.clipPrompt,
          frameNames: frameObjects.map((entry) => entry.name),
        });
        if (result.ok) objects = result.objects;
        else lastError = result.error;
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    if (objects === null) {
      objects = fallbackObjects(beat.clipPrompt, objectCount, episode.character.name);
    }
    await ctx.runMutation(internal.beats.applyObjects, { beatId, objects });
    return null;
  },
});

export const generateBeat = internalAction({
  args: { beatId: v.id("beats") },
  returns: v.null(),
  handler: async (ctx, { beatId }) => {
    const data = await ctx.runQuery(internal.beats.context, { beatId });
    if (data === null) return null;
    const { beat, run, episode, pathLabels, lastPlayerText, parentBeat, option } = data;
    if (beat.status === "cancelled") return null;
    if (beat.clipPrompt.trim() !== "") {
      await ctx.runMutation(internal.clips.ensureForBeat, { beatId });
    }
    if (beat.stop !== undefined || beat.ending !== undefined) {
      return null;
    }
    const kind = expectedStopKind(beat.depth, episode.beatsTotal);
    if (beat.clipPrompt.trim() !== "" && kind === "choice") {
      if (run.currentBeatId === beatId) {
        await ctx.scheduler.runAfter(0, internal.director.authorObjects, { beatId });
      }
      return null;
    }

    const beatsLeft = Math.max(1, episode.beatsTotal - beat.depth);
    const expectedKind = kind;
    const state: DirectorBeatState = parentBeat?.state ?? run.state;
    const continuation =
      parentBeat === null || option === null
        ? null
        : {
            previousClipPrompt: parentBeat.clipPrompt,
            optionLabel: option.label,
            optionAction: option.action,
            optionTarget: option.target,
          };
    const childPath = continuation === null ? pathLabels : [...pathLabels, continuation.optionLabel];

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
              character: episode.character,
              beatIndex: beat.depth,
              beatsTotal: episode.beatsTotal,
              beatsLeft,
              expectedKind,
              pathLabels: childPath,
              state,
              lastPlayerText: beat.depth === 0 ? lastPlayerText : null,
              continuation,
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
      const written = validateBeat(
        fixtureBeat({ depth: beat.depth, beatsTotal: episode.beatsTotal, state, pathLabels }),
        { expectedKind, beatsLeft, beatIndex: beat.depth },
      );
      director = written.ok
        ? written.beat
        : fallbackBeat({
            beatIndex: beat.depth,
            beatsLeft,
            expectedKind,
            state,
            characterName: episode.character.name,
          });
    }
    await ctx.runMutation(internal.beats.applyDirector, { beatId, director });
    if (expectedKind === "choice") {
      await ctx.scheduler.runAfter(0, internal.director.authorObjects, { beatId });
    }
    return null;
  },
});
