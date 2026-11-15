import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const stateValidator = v.object({
  items: v.array(v.string()),
  trust: v.number(),
  clues: v.array(v.string()),
  beats_left: v.number(),
});

export const endingValidator = v.object({
  title: v.string(),
  summary: v.string(),
});

export const boxValidator = v.object({
  x: v.number(),
  y: v.number(),
  w: v.number(),
  h: v.number(),
});

export const clipStatusValidator = v.union(
  v.literal("queued"),
  v.literal("generating"),
  v.literal("ready"),
  v.literal("failed"),
  v.literal("cancelled"),
);

export const beatStatusValidator = v.union(
  v.literal("generating"),
  v.literal("ready"),
  v.literal("failed"),
  v.literal("cancelled"),
);

export default defineSchema({
  users: defineTable({
    name: v.optional(v.string()),
    kind: v.union(v.literal("anonymous"), v.literal("named")),
    createdAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_kind", ["kind"]),

  sessions: defineTable({
    key: v.string(),
    userId: v.id("users"),
  }).index("by_key", ["key"]),

  episodes: defineTable({
    date: v.string(),
    dayIndex: v.number(),
    seed: v.number(),
    title: v.string(),
    tagline: v.string(),
    premise: v.string(),
    styleBible: v.string(),
    styleImageUrl: v.string(),
    characterSheetUrl: v.string(),
    voiceRefUrl: v.string(),
    posterUrl: v.string(),
    beatsTotal: v.number(),
    aspect: v.string(),
    seconds: v.number(),
    createdAt: v.number(),
  }).index("by_date", ["date"]),

  runs: defineTable({
    userId: v.id("users"),
    episodeId: v.id("episodes"),
    status: v.union(v.literal("active"), v.literal("ended")),
    currentBeatId: v.optional(v.id("beats")),
    path: v.array(v.string()),
    optionPath: v.array(v.string()),
    state: stateValidator,
    beatsSeen: v.number(),
    ending: v.optional(endingValidator),
    error: v.optional(v.string()),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    .index("by_user_episode", ["userId", "episodeId"])
    .index("by_user", ["userId"]),

  beats: defineTable({
    runId: v.id("runs"),
    parentBeatId: v.optional(v.id("beats")),
    optionId: v.optional(v.string()),
    depth: v.number(),
    status: beatStatusValidator,
    narration: v.optional(v.string()),
    clipPrompt: v.string(),
    stopKind: v.optional(v.union(v.literal("choice"), v.literal("puzzle"))),
    stop: v.optional(v.any()),
    director: v.optional(v.any()),
    state: v.optional(stateValidator),
    ending: v.optional(endingValidator),
    directorAttempts: v.number(),
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_run", ["runId"])
    .index("by_parent", ["parentBeatId"]),

  clips: defineTable({
    runId: v.id("runs"),
    beatId: v.id("beats"),
    option: v.optional(v.string()),
    jobId: v.optional(v.string()),
    url: v.optional(v.string()),
    lastFrameUrl: v.optional(v.string()),
    boxes: v.optional(v.any()),
    status: clipStatusValidator,
    prompt: v.string(),
    seed: v.number(),
    aspect: v.string(),
    seconds: v.number(),
    attempts: v.number(),
    error: v.optional(v.string()),
    createdAt: v.number(),
    readyAt: v.optional(v.number()),
  })
    .index("by_beat", ["beatId"])
    .index("by_job", ["jobId"])
    .index("by_run", ["runId"]),

  streaks: defineTable({
    userId: v.id("users"),
    current: v.number(),
    longest: v.number(),
    lastDate: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
});
