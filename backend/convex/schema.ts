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
  text: v.optional(
    v.object({
      character: v.string(),
      number: v.union(v.string(), v.null()),
      prompt: v.string(),
    }),
  ),
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
    phone: v.optional(v.string()),
    deviceKey: v.optional(v.string()),
    kind: v.union(v.literal("anonymous"), v.literal("named")),
    createdAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_kind", ["kind"])
    .index("by_device_key", ["deviceKey"])
    .index("by_phone", ["phone"]),

  recordings: defineTable({
    userId: v.id("users"),
    runId: v.id("runs"),
    beatId: v.id("beats"),
    storageId: v.optional(v.id("_storage")),
    consumed: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_run_beat", ["runId", "beatId"])
    .index("by_user", ["userId", "createdAt"]),

  storyMessages: defineTable({
    userId: v.id("users"),
    episodeId: v.optional(v.id("episodes")),
    runId: v.optional(v.id("runs")),
    character: v.string(),
    direction: v.union(v.literal("outbound"), v.literal("inbound")),
    text: v.string(),
    phone: v.optional(v.string()),
    code: v.optional(v.string()),
    conversationId: v.optional(v.string()),
    delivery: v.optional(v.union(v.literal("sent"), v.literal("queued"), v.literal("failed"), v.literal("fallback"))),
    error: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_phone", ["phone", "createdAt"])
    .index("by_code", ["code"])
    .index("by_run", ["runId"]),

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
    character: v.object({ name: v.string(), voice: v.string() }),
    voiceId: v.string(),
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
    prewarm: v.optional(v.boolean()),
    userId: v.id("users"),
    episodeId: v.id("episodes"),
    status: v.union(v.literal("active"), v.literal("ended")),
    currentBeatId: v.optional(v.id("beats")),
    custom: v.optional(v.boolean()),
    path: v.array(v.string()),
    optionPath: v.array(v.string()),
    state: stateValidator,
    beatsSeen: v.number(),
    ending: v.optional(endingValidator),
    error: v.optional(v.string()),
    startedAt: v.number(),
    lastActivityAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
  })
    .index("by_user_episode", ["userId", "episodeId"])
    .index("by_user", ["userId"])
    .index("by_status", ["status"]),

  beats: defineTable({
    runId: v.id("runs"),
    parentBeatId: v.optional(v.id("beats")),
    optionId: v.optional(v.string()),
    actionId: v.optional(v.string()),
    depth: v.number(),
    status: beatStatusValidator,
    narration: v.optional(v.string()),
    spokenLine: v.optional(v.string()),
    spokenAudioStorageId: v.optional(v.id("_storage")),
    spokenAudioUrl: v.optional(v.string()),
    spokenVoice: v.optional(v.string()),
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
    regions: v.optional(v.any()),
    status: clipStatusValidator,
    prompt: v.string(),
    seed: v.number(),
    aspect: v.string(),
    seconds: v.number(),
    attempts: v.number(),
    storageId: v.optional(v.id("_storage")),
    attemptToken: v.optional(v.string()),
    attemptAt: v.optional(v.number()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    readyAt: v.optional(v.number()),
  })
    .index("by_beat", ["beatId"])
    .index("by_job", ["jobId"])
    .index("by_run", ["runId"])
    .index("by_status_created", ["status", "createdAt"]),

  openings: defineTable({
    episodeId: v.id("episodes"),
    key: v.string(),
    seed: v.number(),
    aspect: v.string(),
    seconds: v.number(),
    beat: v.any(),
    clipStorageId: v.optional(v.id("_storage")),
    clipUrl: v.string(),
    audioStorageId: v.optional(v.id("_storage")),
    audioUrl: v.optional(v.string()),
    children: v.array(
      v.object({
        optionId: v.string(),
        actionId: v.optional(v.string()),
        clipPrompt: v.string(),
        stop: v.optional(v.any()),
        state: v.optional(v.any()),
        narration: v.optional(v.string()),
        spokenLine: v.optional(v.string()),
        storageId: v.optional(v.id("_storage")),
        url: v.string(),
        seed: v.number(),
        audioStorageId: v.optional(v.id("_storage")),
        audioUrl: v.optional(v.string()),
      }),
    ),
    createdAt: v.number(),
  }).index("by_episode_key", ["episodeId", "key"]),

  streaks: defineTable({
    userId: v.id("users"),
    current: v.number(),
    longest: v.number(),
    lastDate: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
});
