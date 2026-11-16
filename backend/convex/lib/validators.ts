import { v } from "convex/values";

const clipStateValidator = v.object({
  status: v.union(v.literal("generating"), v.literal("ready")),
  clipUrl: v.union(v.string(), v.null()),
});

const pointValidator = v.object({ x: v.number(), y: v.number() });

const regionValidator = v.object({
  centroid: pointValidator,
  polygon: v.union(v.array(v.array(v.array(v.number()))), v.null()),
  maskUrl: v.union(v.string(), v.null()),
});

const runStopValidator = v.union(
  v.null(),
  v.object({
    kind: v.literal("choice"),
    spokenLine: v.string(),
    spokenAudioUrl: v.union(v.string(), v.null()),
    options: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        region: v.union(regionValidator, v.null()),
        actions: v.array(
          v.object({
            id: v.string(),
            label: v.string(),
            childStatus: v.union(v.literal("generating"), v.literal("ready")),
            childClipUrl: v.union(v.string(), v.null()),
          }),
        ),
      }),
    ),
  }),
  v.object({
    kind: v.literal("puzzle"),
    spokenLine: v.string(),
    spokenAudioUrl: v.union(v.string(), v.null()),
    question: v.string(),
    answerType: v.union(v.literal("pick"), v.literal("number"), v.literal("text")),
    choices: v.union(v.array(v.string()), v.null()),
    outcomes: v.object({ success: clipStateValidator, failure: clipStateValidator }),
  }),
);

export const runViewValidator = v.object({
  case: v.optional(v.object({
    question: v.string(), movesLeft: v.number(), movesTotal: v.number(),
    solveChoices: v.array(v.object({ id: v.string(), label: v.string() })),
  })),
  status: v.union(v.literal("active"), v.literal("ended")),
  beatIndex: v.number(),
  beatsTotal: v.number(),
  current: v.object({
    beatId: v.id("beats"),
    clipUrl: v.union(v.string(), v.null()),
    narration: v.string(),
    status: v.union(v.literal("generating"), v.literal("ready")),
  }),
  stop: runStopValidator,
  ending: v.union(
    v.null(),
    v.object({
      title: v.string(),
      result: v.optional(v.object({ solved: v.boolean(), movesUsed: v.number(), movesTotal: v.number() })),
      streak: v.optional(v.number()),
      shareText: v.optional(v.string()),
      summary: v.string(),
      path: v.array(v.string()),
      text: v.optional(
        v.object({
          character: v.string(),
          number: v.union(v.string(), v.null()),
          prompt: v.string(),
        }),
      ),
    }),
  ),
});

export const homeValidator = v.object({
  episode: v.object({
    id: v.id("episodes"),
    date: v.string(),
    title: v.string(),
    tagline: v.string(),
    posterUrl: v.string(),
  }),
  streak: v.number(),
  run: v.union(v.null(), v.object({ id: v.id("runs"), status: v.union(v.literal("active"), v.literal("ended")) })),
});
