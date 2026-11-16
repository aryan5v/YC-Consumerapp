import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";
import { ensureDeviceUser, requireDeviceUser } from "./lib/session";
import { characterSheetUrl, heldClipUrl, maxUploadBytes } from "./lib/config";
import { pacificDate } from "./lib/pacific";
import { openaiConfigured, synthesize } from "./lib/openai";
import { WORLD_CACHE_CLOCK, WORLD_CACHE_LANDMARKS, WORLD_CACHE_VERSION, canonicalWorldSlot, worldCacheScenes } from "./lib/worldCache";
import {
  Change,
  ClientClock,
  Configure,
  DEFAULT_CAST,
  DEFAULT_LANDMARKS,
  DescribeResult,
  Landmark,
  Palette,
  Slot,
  Weather,
  askContinuation,
  askDescribe,
  askDirect,
  clampDay,
  clampHours,
  clampMood,
  clipSeed,
  dataUriFromBlob,
  defaultChange,
  deployCap,
  deviceCap,
  echoConfigure,
  fetchClipBytes,
  landmarksOrDefault,
  normalizeWeather,
  paletteOrNull,
  slotOf,
  submitWorldClip,
  thingCap,
  thingWindowMs,
  waitForClip,
  worldClipPrompt,
} from "./lib/world";

const STORE_KEY = "synqui world store";
const PREFIX = "synqui-world";

const weatherValidator = v.union(
  v.literal("clear"),
  v.literal("cloudy"),
  v.literal("mist"),
  v.literal("rain"),
  v.literal("snow"),
);
const weatherInput = v.union(weatherValidator, v.literal("fair"));
const slotValidator = v.union(
  v.literal("lighthouse"),
  v.literal("arch"),
  v.literal("boat"),
  v.literal("cabin"),
  v.literal("lantern"),
  v.literal("well"),
  v.literal("stranger"),
);
const paletteValidator = v.object({
  sky: v.optional(v.string()),
  fog: v.optional(v.string()),
  ground: v.optional(v.string()),
  water: v.optional(v.string()),
  accentLight: v.optional(v.string()),
});
const landmarkValidator = v.object({
  slot: slotValidator,
  name: v.string(),
  description: v.string(),
});
const configureValidator = v.object({
  timeOfDay: v.number(),
  day: v.optional(v.number()),
  weather: weatherValidator,
  palette: paletteValidator,
  mood: v.string(),
  landmarks: v.array(landmarkValidator),
  transitionMs: v.number(),
});
const changeValidator = v.object({
  lit: v.optional(v.boolean()),
  doorOpen: v.optional(v.boolean()),
  gone: v.optional(v.boolean()),
  position: v.optional(
    v.object({
      x: v.optional(v.number()),
      y: v.optional(v.number()),
      z: v.optional(v.number()),
    }),
  ),
});
const positionValidator = v.object({ x: v.number(), y: v.number(), z: v.number() });
const stateValidator = v.object({
  timeOfDay: v.number(),
  day: v.number(),
  weather: weatherInput,
  position: positionValidator,
  lastThingId: v.union(v.string(), v.null()),
  palette: v.optional(paletteValidator),
  mood: v.optional(v.string()),
});

type StoredWorld = {
  seed: number;
  timeOfDay: number;
  day: number;
  weather: Weather;
  palette: Palette | null;
  mood: string;
  landmarks: Landmark[];
  position: { x: number; y: number; z: number } | null;
  lastThingId: string | null;
  lastWeatherChangeAt: number | null;
  described: boolean;
  castName: string;
  castLook: string;
  castVoice: string;
  visited: string[];
  notes: string[];
};

type InteractionRow = {
  ownerId: string;
  thingId: string;
  name: string;
  slot: Slot | null;
  status: "generating" | "ready";
  narration: string;
  spokenLine: string;
  spokenAudioUrl: string | null;
  clipUrl: string | null;
  change: Change;
  configure: Configure;
  transitionMs: number;
  error?: string;
};

type Flight = { jobs: { id: string; at: number }[] };
type Hits = { hits: number[] };

const generateRef = makeFunctionReference<"action", { interactionId: string }>("world:generate");
const readInteractRef = makeFunctionReference<"query", { interactionId: string }>("world:readInteract");
const finishInteractRef = makeFunctionReference<
  "mutation",
  {
    interactionId: string;
    narration: string;
    spokenLine: string;
    spokenAudioUrl: string | null;
    clipUrl: string | null;
    change: Change;
    error?: string;
  }
>("world:finishInteract");
const readSheetRef = makeFunctionReference<"query", { interactionId: string }>("world:readSheet");

function defaultWorld(): StoredWorld {
  return {
    seed: 8741,
    timeOfDay: 18.5,
    day: 1,
    weather: "clear",
    palette: null,
    mood: "",
    landmarks: DEFAULT_LANDMARKS.map((entry) => ({ ...entry })),
    position: null,
    lastThingId: null,
    lastWeatherChangeAt: null,
    described: false,
    castName: DEFAULT_CAST.name,
    castLook: DEFAULT_CAST.look,
    castVoice: DEFAULT_CAST.voice,
    visited: [],
    notes: [],
  };
}

function asWorld(raw: unknown): StoredWorld {
  const base = defaultWorld();
  if (raw === null || typeof raw !== "object") return base;
  const row = raw as Partial<StoredWorld>;
  const weather = normalizeWeather(row.weather) ?? base.weather;
  const hour = clampHours(row.timeOfDay) ?? base.timeOfDay;
  const day = clampDay(row.day) ?? base.day;
  return {
    seed: typeof row.seed === "number" && Number.isFinite(row.seed) ? Math.trunc(row.seed) : base.seed,
    timeOfDay: hour,
    day,
    weather,
    palette: paletteOrNull(row.palette),
    mood: clampMood(row.mood),
    landmarks: landmarksOrDefault(row.landmarks),
    position: row.position ?? null,
    lastThingId: typeof row.lastThingId === "string" ? row.lastThingId : null,
    lastWeatherChangeAt:
      typeof row.lastWeatherChangeAt === "number" && Number.isFinite(row.lastWeatherChangeAt)
        ? row.lastWeatherChangeAt
        : null,
    described: row.described === true,
    castName: typeof row.castName === "string" && row.castName.trim() !== "" ? row.castName : base.castName,
    castLook: typeof row.castLook === "string" && row.castLook.trim() !== "" ? row.castLook : base.castLook,
    castVoice: typeof row.castVoice === "string" && row.castVoice.trim() !== "" ? row.castVoice : base.castVoice,
    visited: Array.isArray(row.visited) ? row.visited.filter((entry) => typeof entry === "string").slice(-12) : [],
    notes: Array.isArray(row.notes) ? row.notes.filter((entry) => typeof entry === "string").slice(-8) : [],
  };
}

async function storeUser(ctx: MutationCtx | QueryCtx): Promise<Doc<"users">> {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_device_key", (q) => q.eq("deviceKey", STORE_KEY))
    .first();
  if (existing !== null) return existing;
  if (!("insert" in ctx.db)) throw new Error("the world store is not ready");
  const mutation = ctx as MutationCtx;
  const userId = await mutation.db.insert("users", {
    kind: "anonymous",
    deviceKey: STORE_KEY,
    createdAt: Date.now(),
  });
  const created = await mutation.db.get(userId);
  if (created === null) throw new Error("the world store is not ready");
  return created;
}

async function rowByCode(ctx: QueryCtx, code: string): Promise<Doc<"storyMessages"> | null> {
  return await ctx.db
    .query("storyMessages")
    .withIndex("by_code", (q) => q.eq("code", code))
    .order("desc")
    .first();
}

async function readJson<T>(ctx: QueryCtx, code: string, parse: (raw: unknown) => T, fallback: T): Promise<T> {
  const row = await rowByCode(ctx, code);
  if (row === null) return fallback;
  try {
    return parse(JSON.parse(row.text));
  } catch {
    return fallback;
  }
}

async function writeJson(ctx: MutationCtx, code: string, character: string, value: unknown): Promise<void> {
  const store = await storeUser(ctx);
  const text = JSON.stringify(value);
  const existing = await rowByCode(ctx, code);
  if (existing !== null) {
    await ctx.db.patch(existing._id, { text, character });
    return;
  }
  await ctx.db.insert("storyMessages", {
    userId: store._id,
    character,
    direction: "outbound",
    text,
    code,
    createdAt: Date.now(),
  });
}

function stateCode(userId: string): string {
  return `${PREFIX}:state:${userId}`;
}

function interactCode(interactionId: string): string {
  return `${PREFIX}:interact:${interactionId}`;
}

function uploadCode(userId: string): string {
  return `${PREFIX}:upload:${userId}`;
}

function rateCode(userId: string, thingId: string): string {
  return `${PREFIX}:rate:${userId}:${thingId}`;
}

function deviceFlightCode(userId: string): string {
  return `${PREFIX}:device:${userId}`;
}

function deployCode(): string {
  return `${PREFIX}:capacity`;
}

async function loadWorld(ctx: QueryCtx, userId: string): Promise<StoredWorld> {
  return await readJson(ctx, stateCode(userId), asWorld, defaultWorld());
}

async function saveWorld(ctx: MutationCtx, userId: string, world: StoredWorld): Promise<void> {
  await writeJson(ctx, stateCode(userId), "world-state", world);
}

function freshJobs(flight: Flight, now: number): Flight["jobs"] {
  return flight.jobs.filter((job) => now - job.at < 180_000);
}

function clientFrom(args: {
  timeOfDay: number;
  day: number;
  weather: string;
  palette?: { sky?: string; fog?: string; ground?: string; water?: string; accentLight?: string };
  mood?: string;
}, stored: StoredWorld): ClientClock & { day: number } {
  const weather = normalizeWeather(args.weather) ?? stored.weather;
  const hour = clampHours(args.timeOfDay) ?? stored.timeOfDay;
  const day = clampDay(args.day) ?? stored.day;
  const givenPalette = paletteOrNull(args.palette);
  const palette = args.palette !== undefined && Object.keys(args.palette).length === 0 ? null : (givenPalette ?? stored.palette);
  const mood = args.mood !== undefined ? clampMood(args.mood) : stored.mood;
  return { timeOfDay: hour, day, weather, palette, mood };
}

function absorb(stored: StoredWorld, client: ClientClock & { day: number; position?: { x: number; y: number; z: number } | null; lastThingId?: string | null }): StoredWorld {
  return {
    ...stored,
    timeOfDay: client.timeOfDay,
    day: client.day,
    weather: client.weather,
    palette: client.palette,
    mood: client.mood,
    position: client.position === undefined ? stored.position : client.position,
    lastThingId: client.lastThingId === undefined ? stored.lastThingId : client.lastThingId,
  };
}

async function sheetFor(ctx: QueryCtx): Promise<string> {
  const episode = await ctx.db
    .query("episodes")
    .withIndex("by_date", (q) => q.eq("date", pacificDate()))
    .first();
  if (episode !== null && episode.characterSheetUrl.trim() !== "") return episode.characterSheetUrl;
  return characterSheetUrl();
}

async function storyFor(ctx: QueryCtx, userId: Id<"users">): Promise<{ items: string[]; trust: number; clues: string[] } | null> {
  const run = await ctx.db
    .query("runs")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .first();
  if (run === null) return null;
  return { items: run.state.items, trust: run.state.trust, clues: run.state.clues };
}

export const interactUploadUrl = mutation({
  args: { deviceToken: v.string(), thingId: v.string() },
  returns: v.string(),
  handler: async (ctx, { deviceToken, thingId }) => {
    const user = await ensureDeviceUser(ctx, deviceToken);
    const id = thingId.trim();
    if (id === "" || id.length > 120) throw new Error("that thing has no name the shore can keep");
    await writeJson(ctx, uploadCode(user._id), "world-upload", { thingId: id, consumed: false });
    return await ctx.storage.generateUploadUrl();
  },
});

export const interact = mutation({
  args: {
    deviceToken: v.string(),
    thingId: v.string(),
    name: v.string(),
    description: v.string(),
    screenshotStorageId: v.id("_storage"),
    timeOfDay: v.number(),
    day: v.number(),
    state: v.optional(stateValidator),
  },
  returns: v.object({
    interactionId: v.string(),
    clipUrl: v.optional(v.string()),
    narration: v.optional(v.string()),
    spokenLine: v.optional(v.string()),
    spokenAudioUrl: v.optional(v.union(v.string(), v.null())),
    outcome: v.optional(v.object({ thingId: v.string(), change: changeValidator })),
    configure: configureValidator,
    transitionMs: v.number(),
  }),
  handler: async (ctx, args) => {
    const user = await ensureDeviceUser(ctx, args.deviceToken);
    const thingId = args.thingId.trim();
    const name = args.name.replace(/\s+/g, " ").trim().slice(0, 60);
    if (thingId === "" || name === "") throw new Error("that thing has no name the shore can keep");
    const claim = await readJson(ctx, uploadCode(user._id), (raw) => raw as { thingId?: string; consumed?: boolean }, {
      thingId: "",
      consumed: true,
    });
    if (claim.consumed !== false || claim.thingId !== thingId) {
      throw new Error("that screenshot does not belong to this device");
    }
    const screenshot = await ctx.storage.get(args.screenshotStorageId);
    if (screenshot === null) throw new Error("that screenshot is no longer in storage");
    if (screenshot.size > maxUploadBytes()) {
      await ctx.storage.delete(args.screenshotStorageId);
      throw new Error("that screenshot is too large");
    }
    if (
      screenshot.type !== "" &&
      screenshot.type !== "application/octet-stream" &&
      !screenshot.type.startsWith("image/")
    ) {
      throw new Error("that screenshot is not an image");
    }
    const now = Date.now();
    await enforceCaps(ctx, user._id, thingId, now);
    await writeJson(ctx, uploadCode(user._id), "world-upload", {
      thingId,
      consumed: true,
      storageId: args.screenshotStorageId,
    });
    const stored = await loadWorld(ctx, user._id);
    const cache = await ctx.db.query("worldClipCaches").withIndex("by_version", (q) => q.eq("version", WORLD_CACHE_VERSION)).unique();
    if (cache?.publishedAt !== undefined) {
      const slot = canonicalWorldSlot(thingId);
      if (slot === null) throw new Error("that landmark is not part of the shore");
      const selection = cache.selections.find((entry) => entry.slot === slot);
      const clip = cache.clips.find((entry) => entry.key === `${slot}-take-${selection?.take}`);
      const scene = worldCacheScenes().find((entry) => entry.key === clip?.key);
      if (clip === undefined || scene === undefined) throw new Error("that landmark's scene is not ready yet; try another landmark");
      const next = absorb(stored, { ...WORLD_CACHE_CLOCK, position: args.state?.position ?? stored.position, lastThingId: thingId });
      next.landmarks = WORLD_CACHE_LANDMARKS.map((entry) => ({ ...entry }));
      next.castName = DEFAULT_CAST.name;
      next.castLook = DEFAULT_CAST.look;
      next.castVoice = DEFAULT_CAST.voice;
      next.visited = [...next.visited, scene.name].slice(-12);
      next.notes = [...next.notes, scene.narration].slice(-8);
      await saveWorld(ctx, user._id, next);
      const cachedConfigure = echoConfigure({ ...WORLD_CACHE_CLOCK, palette: null }, next.landmarks, 0);
      const interactionId = crypto.randomUUID();
      const row: InteractionRow = {
        ownerId: user._id, thingId, name: scene.name, slot, status: "ready",
        narration: scene.narration, spokenLine: "", spokenAudioUrl: null, clipUrl: clip.url,
        change: scene.change, configure: cachedConfigure, transitionMs: 0,
      };
      await writeJson(ctx, interactCode(interactionId), "world-interact", row);
      return { interactionId, clipUrl: clip.url, narration: row.narration, spokenLine: "", spokenAudioUrl: null, outcome: { thingId, change: row.change }, configure: cachedConfigure, transitionMs: 0 };
    }
    const client = clientFrom(
      {
        timeOfDay: args.state?.timeOfDay ?? args.timeOfDay,
        day: args.state?.day ?? args.day,
        weather: args.state?.weather ?? stored.weather,
        palette: args.state?.palette,
        mood: args.state?.mood,
      },
      stored,
    );
    const next = absorb(stored, {
      ...client,
      position: args.state?.position ?? stored.position,
      lastThingId: thingId,
    });
    next.visited = [...next.visited, name].slice(-12);
    await saveWorld(ctx, user._id, next);
    const configure = echoConfigure(client, next.landmarks, 0);
    const interactionId = crypto.randomUUID();
    const row: InteractionRow = {
      ownerId: user._id,
      thingId,
      name,
      slot: slotOf(thingId, name),
      status: "generating",
      narration: "",
      spokenLine: "",
      spokenAudioUrl: null,
      clipUrl: null,
      change: {},
      configure,
      transitionMs: 0,
    };
    await writeJson(ctx, interactCode(interactionId), "world-interact", {
      ...row,
      description: args.description.replace(/\s+/g, " ").trim().slice(0, 280),
      screenshotStorageId: args.screenshotStorageId,
      timeOfDay: client.timeOfDay,
      weather: client.weather,
      mood: client.mood,
    });
    await rememberFlight(ctx, user._id, interactionId, now);
    await ctx.scheduler.runAfter(0, generateRef, { interactionId });
    return { interactionId, configure, transitionMs: 0 };
  },
});

async function enforceCaps(ctx: MutationCtx, userId: string, thingId: string, now: number): Promise<void> {
  const hits = await readJson(ctx, rateCode(userId, thingId), (raw) => raw as Hits, { hits: [] });
  const recent = hits.hits.filter((at) => now - at < thingWindowMs());
  if (recent.length >= thingCap()) {
    throw new Error("give that one a minute: three looks at the same thing is enough");
  }
  const device = await readJson(ctx, deviceFlightCode(userId), (raw) => raw as Flight, { jobs: [] });
  const deviceJobs = freshJobs(device, now);
  if (deviceJobs.length >= deviceCap()) {
    throw new Error("a scene is already being made on this device");
  }
  const deploy = await readJson(ctx, deployCode(), (raw) => raw as Flight, { jobs: [] });
  const deployJobs = freshJobs(deploy, now);
  if (deployJobs.length >= deployCap()) {
    throw new Error("the shore is busy: too many scenes are being made at once. Try again in a minute.");
  }
  await writeJson(ctx, rateCode(userId, thingId), "world-rate", { hits: [...recent, now].slice(-12) });
  await writeJson(ctx, deviceFlightCode(userId), "world-flight", { jobs: deviceJobs });
  await writeJson(ctx, deployCode(), "world-flight", { jobs: deployJobs });
}

async function rememberFlight(ctx: MutationCtx, userId: string, interactionId: string, now: number): Promise<void> {
  const device = await readJson(ctx, deviceFlightCode(userId), (raw) => raw as Flight, { jobs: [] });
  const deploy = await readJson(ctx, deployCode(), (raw) => raw as Flight, { jobs: [] });
  await writeJson(ctx, deviceFlightCode(userId), "world-flight", {
    jobs: [...freshJobs(device, now), { id: interactionId, at: now }],
  });
  await writeJson(ctx, deployCode(), "world-flight", {
    jobs: [...freshJobs(deploy, now), { id: interactionId, at: now }],
  });
}

async function releaseFlight(ctx: MutationCtx, userId: string, interactionId: string): Promise<void> {
  const now = Date.now();
  const device = await readJson(ctx, deviceFlightCode(userId), (raw) => raw as Flight, { jobs: [] });
  const deploy = await readJson(ctx, deployCode(), (raw) => raw as Flight, { jobs: [] });
  await writeJson(ctx, deviceFlightCode(userId), "world-flight", {
    jobs: freshJobs(device, now).filter((job) => job.id !== interactionId),
  });
  await writeJson(ctx, deployCode(), "world-flight", {
    jobs: freshJobs(deploy, now).filter((job) => job.id !== interactionId),
  });
}

export const watch = query({
  args: { deviceToken: v.string(), interactionId: v.string() },
  returns: v.object({
    clipUrl: v.union(v.string(), v.null()),
    narration: v.string(),
    spokenLine: v.string(),
    spokenAudioUrl: v.union(v.string(), v.null()),
    outcome: v.object({
      thingId: v.string(),
      change: changeValidator,
    }),
    configure: configureValidator,
    transitionMs: v.number(),
  }),
  handler: async (ctx, { deviceToken, interactionId }) => {
    const user = await requireDeviceUser(ctx, deviceToken);
    const row = await rowByCode(ctx, interactCode(interactionId));
    if (row === null) throw new Error("interaction not found");
    const parsed = JSON.parse(row.text) as InteractionRow;
    if (parsed.ownerId !== user._id) throw new Error("this interaction belongs to another device");
    return {
      clipUrl: parsed.clipUrl,
      narration: parsed.narration,
      spokenLine: parsed.spokenLine,
      spokenAudioUrl: parsed.spokenAudioUrl,
      outcome: { thingId: parsed.thingId, change: parsed.change ?? {} },
      configure: parsed.configure,
      transitionMs: parsed.transitionMs,
    };
  },
});

export const readInteract = internalQuery({
  args: { interactionId: v.string() },
  handler: async (ctx, { interactionId }) => {
    const row = await rowByCode(ctx, interactCode(interactionId));
    if (row === null) return null;
    const parsed = JSON.parse(row.text) as InteractionRow & {
      description?: string;
      screenshotStorageId?: string;
      timeOfDay?: number;
      weather?: Weather;
      mood?: string;
    };
    const world = await loadWorld(ctx, parsed.ownerId);
    return {
      ownerId: parsed.ownerId,
      thingId: parsed.thingId,
      name: parsed.name,
      description: parsed.description ?? "",
      slot: parsed.slot,
      screenshotStorageId: parsed.screenshotStorageId ?? null,
      timeOfDay: parsed.timeOfDay ?? world.timeOfDay,
      weather: parsed.weather ?? world.weather,
      mood: parsed.mood ?? world.mood,
      world,
      sheetUrl: await sheetFor(ctx),
    };
  },
});

export const readSheet = internalQuery({
  args: { interactionId: v.string() },
  handler: async (ctx, { interactionId }) => {
    const row = await rowByCode(ctx, interactCode(interactionId));
    if (row === null) return null;
    const parsed = JSON.parse(row.text) as { ownerId: string };
    const user = await ctx.db.get(parsed.ownerId as Id<"users">);
    return {
      story: user === null ? null : await storyFor(ctx, user._id),
    };
  },
});

export const finishInteract = internalMutation({
  args: {
    interactionId: v.string(),
    narration: v.string(),
    spokenLine: v.string(),
    spokenAudioUrl: v.union(v.string(), v.null()),
    clipUrl: v.union(v.string(), v.null()),
    change: changeValidator,
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await rowByCode(ctx, interactCode(args.interactionId));
    if (row === null) return null;
    const parsed = JSON.parse(row.text) as InteractionRow;
    if (parsed.status === "ready") return null;
    const next: InteractionRow = {
      ...parsed,
      status: "ready",
      narration: args.narration,
      spokenLine: args.spokenLine,
      spokenAudioUrl: args.spokenAudioUrl,
      clipUrl: args.clipUrl,
      change: args.change,
      error: args.error,
    };
    await writeJson(ctx, interactCode(args.interactionId), "world-interact", next);
    const world = await loadWorld(ctx, parsed.ownerId);
    world.notes = [...world.notes, args.narration].filter((note) => note !== "").slice(-8);
    await saveWorld(ctx, parsed.ownerId, world);
    await releaseFlight(ctx, parsed.ownerId, args.interactionId);
    return null;
  },
});

export const generate = internalAction({
  args: { interactionId: v.string() },
  returns: v.null(),
  handler: async (ctx, { interactionId }) => {
    const loaded = await ctx.runQuery(readInteractRef, { interactionId });
    if (loaded === null || loaded.screenshotStorageId === null) return null;
    const storyRow = await ctx.runQuery(readSheetRef, { interactionId });
    let narration = "";
    let spokenLine = "";
    let spokenAudioUrl: string | null = null;
    let clipUrl: string | null = null;
    let change: Change = defaultChange(loaded.slot);
    let error: string | undefined;
    try {
      const continuation = await askContinuation({
        name: loaded.name,
        description: loaded.description,
        timeOfDay: loaded.timeOfDay,
        weather: loaded.weather,
        mood: loaded.mood,
        castLook: `${loaded.world.castName}, ${loaded.world.castLook}`,
        notes: loaded.world.notes,
        story: storyRow?.story ?? null,
        slot: loaded.slot,
      });
      narration = continuation.narration;
      spokenLine = continuation.spokenLine;
      change = continuation.change;
      const prompt = worldClipPrompt({
        name: loaded.name,
        description: loaded.description,
        action: continuation.action,
        timeOfDay: loaded.timeOfDay,
        weather: loaded.weather,
        castName: loaded.world.castName,
        castLook: loaded.world.castLook,
      });
      const screenshot = await ctx.storage.get(loaded.screenshotStorageId as Id<"_storage">);
      if (screenshot === null) throw new Error("that screenshot is no longer in storage");
      const screenshotUrl = await dataUriFromBlob(screenshot);
      const job = await submitWorldClip({
        prompt,
        seed: clipSeed(loaded.world.seed, loaded.thingId),
        characterSheetUrl: loaded.sheetUrl,
        screenshotUrl,
      });
      const mp4Url = await waitForClip(job.jobId);
      try {
        const bytes = await fetchClipBytes(mp4Url);
        const stored = await ctx.storage.store(bytes);
        clipUrl = await ctx.storage.getUrl(stored);
      } catch (mirrorError) {
        error = mirrorError instanceof Error ? mirrorError.message : String(mirrorError);
        clipUrl = mp4Url.includes("/v1/videos/") ? heldClipUrl() : mp4Url;
      }
      if (spokenLine !== "" && openaiConfigured()) {
        try {
          const audio = await synthesize({
            text: spokenLine,
            voice: "marin",
            instructions: `You are ${loaded.world.castName}. ${loaded.world.castVoice} Say one short line plainly.`,
          });
          const audioId = await ctx.storage.store(audio);
          spokenAudioUrl = await ctx.storage.getUrl(audioId);
        } catch {
          spokenAudioUrl = null;
        }
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
      narration = narration === "" ? "The shore keeps the path open." : narration;
      clipUrl = clipUrl ?? heldClipUrl();
    }
    await ctx.runMutation(finishInteractRef, {
      interactionId,
      narration,
      spokenLine,
      spokenAudioUrl,
      clipUrl,
      change,
      error,
    });
    return null;
  },
});

export const direct = action({
  args: {
    deviceToken: v.string(),
    state: stateValidator,
    event: v.union(v.literal("enter"), v.literal("interact"), v.literal("tick")),
  },
  returns: v.object({
    configure: configureValidator,
    transitionMs: v.number(),
    narration: v.string(),
    reason: v.string(),
  }),
  handler: async (ctx, args) => {
    await ctx.runMutation(ensureGuestRef, { deviceToken: args.deviceToken });
    const loaded = await ctx.runQuery(readDirectRef, { deviceToken: args.deviceToken });
    const client = clientFrom(args.state, loaded.world);
    const absorbed = absorb(loaded.world, {
      ...client,
      position: args.state.position,
      lastThingId: args.state.lastThingId,
    });
    const decision = await askDirect({
      current: client,
      day: client.day,
      event: args.event,
      landmarks: absorbed.landmarks,
      notes: absorbed.notes,
      lastWeatherChangeAt: absorbed.lastWeatherChangeAt,
      now: Date.now(),
    });
    const saved: StoredWorld = {
      ...absorbed,
      timeOfDay: decision.configure.timeOfDay,
      day: decision.day,
      weather: decision.configure.weather,
      palette:
        paletteOrNull(decision.configure.palette) ??
        (Object.keys(decision.configure.palette).length === 0 ? null : absorbed.palette),
      mood: decision.configure.mood,
      landmarks: decision.configure.landmarks,
      lastWeatherChangeAt: decision.weatherChanged ? Date.now() : absorbed.lastWeatherChangeAt,
    };
    await ctx.runMutation(writeDirectRef, { deviceToken: args.deviceToken, world: saved });
    return {
      configure: decision.configure,
      transitionMs: decision.transitionMs,
      narration: decision.narration,
      reason: decision.reason,
    };
  },
});

const ensureGuestRef = makeFunctionReference<"mutation", { deviceToken: string }, null>("world:ensureGuest");
const readDirectRef = makeFunctionReference<"query", { deviceToken: string }>("world:readDirect");
const writeDirectRef = makeFunctionReference<"mutation", { deviceToken: string; world: StoredWorld }>("world:writeDirect");
const writeDescribeRef = makeFunctionReference<"mutation", { deviceToken: string; described: DescribeResult }>(
  "world:writeDescribe",
);

export const ensureGuest = internalMutation({
  args: { deviceToken: v.string() },
  returns: v.null(),
  handler: async (ctx, { deviceToken }) => {
    await ensureDeviceUser(ctx, deviceToken);
    return null;
  },
});

export const readDirect = internalQuery({
  args: { deviceToken: v.string() },
  handler: async (ctx, { deviceToken }) => {
    const user = await requireDeviceUser(ctx, deviceToken);
    return { world: await loadWorld(ctx, user._id) };
  },
});

export const writeDirect = internalMutation({
  args: { deviceToken: v.string(), world: v.any() },
  returns: v.null(),
  handler: async (ctx, { deviceToken, world }) => {
    const user = await requireDeviceUser(ctx, deviceToken);
    await saveWorld(ctx, user._id, asWorld(world));
    return null;
  },
});

export const describe = action({
  args: { deviceToken: v.string(), prompt: v.string() },
  returns: v.object({
    seed: v.number(),
    timeOfDay: v.number(),
    palette: v.object({
      sky: v.string(),
      fog: v.string(),
      ground: v.string(),
      water: v.string(),
      accentLight: v.string(),
    }),
    weather: weatherValidator,
    landmarks: v.array(landmarkValidator),
    mood: v.string(),
    message: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, { deviceToken, prompt }) => {
    await ctx.runQuery(readDirectRef, { deviceToken });
    const described = await askDescribe(prompt);
    await ctx.runMutation(writeDescribeRef, { deviceToken, described });
    return {
      seed: described.seed,
      timeOfDay: described.timeOfDay,
      palette: described.palette,
      weather: described.weather,
      landmarks: described.landmarks,
      mood: described.mood,
      message: described.message,
    };
  },
});

export const writeDescribe = internalMutation({
  args: { deviceToken: v.string(), described: v.any() },
  returns: v.null(),
  handler: async (ctx, { deviceToken, described }) => {
    const user = await requireDeviceUser(ctx, deviceToken);
    const dream = described as DescribeResult;
    const current = await loadWorld(ctx, user._id);
    await saveWorld(ctx, user._id, {
      ...current,
      seed: dream.seed,
      timeOfDay: dream.timeOfDay,
      weather: dream.weather,
      palette: dream.palette,
      mood: dream.mood,
      landmarks: dream.landmarks,
      described: true,
      castName: dream.castName,
      castLook: dream.castLook,
      castVoice: dream.castVoice,
    });
    return null;
  },
});


