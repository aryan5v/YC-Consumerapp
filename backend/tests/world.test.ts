/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import {
  NO_CHANGE_REASON,
  clockMove,
  decideDirect,
  worldClipPrompt,
} from "../convex/lib/world";
import { DEFAULT_LANDMARKS } from "../convex/lib/world";

const rawModules = import.meta.glob("../convex/**/*.*s");
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([path, loader]) => [path.replace("../convex/", "./"), loader]),
);

const HERMETIC_ENV = ["OPENAI_API_KEY", "DEEPSEEK_API_KEY", "DIRECTOR_API_KEY", "FASTH3_URLS", "FASTH3_URL", "FASTH3_API_KEY"];
for (const name of HERMETIC_ENV) delete process.env[name];

function newBackend() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof newBackend>;

const ONE = "world-phone-one";
const TWO = "world-phone-two";
const THING = "8741:0:lantern";

const interactUploadUrl = makeFunctionReference<
  "mutation",
  { deviceToken: string; thingId: string },
  string
>("world:interactUploadUrl");
const interact = makeFunctionReference<
  "mutation",
  {
    deviceToken: string;
    thingId: string;
    name: string;
    description: string;
    screenshotStorageId: string;
    timeOfDay: number;
    day: number;
    state?: {
      timeOfDay: number;
      day: number;
      weather: "clear" | "cloudy" | "mist" | "rain" | "snow" | "fair";
      position: { x: number; y: number; z: number };
      lastThingId: string | null;
      palette?: { sky?: string; fog?: string; ground?: string; water?: string; accentLight?: string };
      mood?: string;
    };
  },
  { interactionId: string; configure: { weather: string; mood: string; timeOfDay: number }; transitionMs: number }
>("world:interact");
const watch = makeFunctionReference<
  "query",
  { deviceToken: string; interactionId: string },
  {
    clipUrl: string | null;
    narration: string;
    spokenLine: string;
    spokenAudioUrl: string | null;
    outcome: { thingId: string; change: { lit?: boolean } };
    configure: { weather: string; mood: string; timeOfDay: number; palette: object; landmarks: unknown[] };
    transitionMs: number;
  }
>("world:watch");
const describeWorld = makeFunctionReference<
  "action",
  { deviceToken: string; prompt: string },
  {
    seed: number;
    timeOfDay: number;
    weather: string;
    mood: string;
    message: string | null;
    palette: { sky: string; fog: string; ground: string; water: string; accentLight: string };
    landmarks: { slot: string; name: string }[];
  }
>("world:describe");
const direct = makeFunctionReference<
  "action",
  {
    deviceToken: string;
    state: {
      timeOfDay: number;
      day: number;
      weather: "clear" | "rain" | "snow" | "mist" | "cloudy";
      position: { x: number; y: number; z: number };
      lastThingId: string | null;
      palette?: object;
      mood?: string;
    };
    event: "enter" | "interact" | "tick";
  },
  {
    configure: { timeOfDay: number; weather: string; mood: string; palette: object; landmarks: unknown[]; transitionMs: number };
    transitionMs: number;
    narration: string;
    reason: string;
  }
>("world:direct");

beforeEach(() => {
  vi.useFakeTimers();
  process.env.MOCK_LATENCY_MS = "0";
  process.env.TRAY_POLL_MS = "0";
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete process.env.FASTH3_URLS;
  delete process.env.FASTH3_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.DIRECTOR_API_KEY;
  delete process.env.MOCK_LATENCY_MS;
  delete process.env.TRAY_POLL_MS;
});

async function sign(t: Backend, deviceToken: string) {
  await t.mutation(api.session.signInAnonymously, { deviceToken });
}

async function screenshot(t: Backend) {
  return await t.run(async (ctx) => {
    return await ctx.storage.store(new Blob([new Uint8Array(2048)], { type: "image/jpeg" }));
  });
}

async function tap(t: Backend, deviceToken: string, thingId = THING, weather: "clear" | "rain" = "clear") {
  await t.mutation(interactUploadUrl, { deviceToken, thingId });
  const screenshotStorageId = await screenshot(t);
  return await t.mutation(interact, {
    deviceToken,
    thingId,
    name: "Lantern",
    description: "A lantern on a post, swinging a little in the wind.",
    screenshotStorageId,
    timeOfDay: 18.5,
    day: 1,
    state: {
      timeOfDay: 18.5,
      day: 1,
      weather,
      position: { x: 1, y: 0, z: 2 },
      lastThingId: thingId,
      palette: {},
      mood: "still water",
    },
  });
}

describe("world clock", () => {
  test("time may move forward or back by half an hour, and no further", () => {
    expect(clockMove({ day: 1, timeOfDay: 18.5 }, { day: 1, timeOfDay: 19.25 })).toBe("forward");
    expect(clockMove({ day: 1, timeOfDay: 18.5 }, { day: 1, timeOfDay: 18.2 })).toBe("rewind");
    expect(clockMove({ day: 1, timeOfDay: 18.5 }, { day: 1, timeOfDay: 17 })).toBe("back");
    expect(clockMove({ day: 1, timeOfDay: 23.8 }, { day: 2, timeOfDay: 0.2 })).toBe("forward");
  });

  test("a failed or backward proposal keeps the given mood, weather and clock", () => {
    const current = {
      day: 1,
      timeOfDay: 18.5,
      weather: "clear" as const,
      palette: null,
      mood: "still water",
    };
    const held = decideDirect({
      failed: true,
      now: 1_000_000,
      lastWeatherChangeAt: 1_000_000,
      current,
      landmarks: DEFAULT_LANDMARKS,
      proposal: { weather: "rain", timeOfDay: 10, mood: "a storm I invented" },
    });
    expect(held.reason).toBe(NO_CHANGE_REASON);
    expect(held.transitionMs).toBe(0);
    expect(held.configure.weather).toBe("clear");
    expect(held.configure.timeOfDay).toBe(18.5);
    expect(held.configure.mood).toBe("still water");
    expect(held.configure.palette).toEqual({});
    expect(held.configure.landmarks).toHaveLength(7);

    const rejected = decideDirect({
      failed: false,
      now: 1_000_000,
      lastWeatherChangeAt: 900_000,
      current,
      landmarks: DEFAULT_LANDMARKS,
      proposal: { weather: "rain", timeOfDay: 10, mood: "invented fog", narration: "Night.", reason: "because" },
    });
    expect(rejected.configure.timeOfDay).toBe(18.5);
    expect(rejected.configure.weather).toBe("clear");
    expect(rejected.configure.mood).toBe("still water");

    const allowed = decideDirect({
      failed: false,
      now: 1_000_000,
      lastWeatherChangeAt: null,
      current,
      landmarks: DEFAULT_LANDMARKS,
      proposal: { timeOfDay: 19.4, weather: "mist", mood: "invented", narration: "Dusk arrives.", reason: "she has stood long enough" },
    });
    expect(allowed.configure.timeOfDay).toBe(19.4);
    expect(allowed.configure.weather).toBe("mist");
    expect(allowed.configure.mood).toBe("still water");
    expect(allowed.transitionMs).toBeGreaterThan(0);
  });
});

describe("world clip prompt", () => {
  test("a landmark tap is a cut, and rain is visible and audible", () => {
    const prompt = worldClipPrompt({
      name: "Lantern",
      description: "A lantern on a post.",
      action: "She lifts the lantern",
      timeOfDay: 18.5,
      weather: "rain",
      castName: "Mira",
      castLook: "a woman in her thirties, lean build, dark hair tied back, a faded blue wool coat and grey boots, a thin scar through her left eyebrow",
    });
    expect(prompt.startsWith("integrated_multimodal_description:")).toBe(true);
    expect(prompt).toContain("non_diegetic_music: N/A");
    expect(prompt).not.toContain("at 0.00 seconds");
    expect(prompt).not.toContain("fully referenced");
    expect(prompt).toContain("Rain is falling and visible");
    expect(prompt).toContain("rain on stone and on cloth");
    expect(prompt).toContain("Mira, a woman in her thirties");
  });
});

describe("world.interact first visit", () => {
  test("a new device can tap without signing in, and still cannot watch another device", async () => {
    const t = newBackend();
    const fresh = "wander-new-device";
    const started = await tap(t, fresh);
    const mine = await t.query(watch, { deviceToken: fresh, interactionId: started.interactionId });
    expect(mine.outcome.thingId).toBe(THING);
    await sign(t, TWO);
    await expect(t.query(watch, { deviceToken: TWO, interactionId: started.interactionId })).rejects.toThrow(
      /another device/,
    );
  });
});

describe("world.interact ownership", () => {
  test("another device cannot watch the interaction or spend the screenshot", async () => {
    const t = newBackend();
    await sign(t, ONE);
    await sign(t, TWO);
    const started = await tap(t, ONE);
    await expect(t.query(watch, { deviceToken: TWO, interactionId: started.interactionId })).rejects.toThrow(
      /another device/,
    );
    const stolen = await screenshot(t);
    await expect(
      t.mutation(interact, {
        deviceToken: TWO,
        thingId: THING,
        name: "Lantern",
        description: "A lantern on a post.",
        screenshotStorageId: stolen,
        timeOfDay: 18.5,
        day: 1,
      }),
    ).rejects.toThrow(/does not belong/);
    const mine = await t.query(watch, { deviceToken: ONE, interactionId: started.interactionId });
    expect(mine.outcome.thingId).toBe(THING);
    expect(mine.configure.mood).toBe("still water");
    expect(mine.configure.weather).toBe("clear");
  });
});

describe("world.interact cap", () => {
  test("a fourth look at the same thing in a minute is refused", async () => {
    const t = newBackend();
    await sign(t, ONE);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array(2048), { status: 200, headers: { "content-type": "video/mp4" } })),
    );
    await tap(t, ONE);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await tap(t, ONE);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await tap(t, ONE);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    await expect(tap(t, ONE)).rejects.toThrow(/three looks/);
  });
});

describe("world director failures", () => {
  test("a failed continuation still leaves a playable clip and the given weather in the prompt", async () => {
    const t = newBackend();
    await sign(t, ONE);
    process.env.DEEPSEEK_API_KEY = "test-director";
    process.env.FASTH3_URLS = "http://tray-one:8000";
    process.env.FASTH3_API_KEY = "test-tray-key";
    const posted: { body: Record<string, unknown>; headers: Record<string, string> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const method = (init?.method ?? "GET").toUpperCase();
        if (url.includes("/chat/completions")) {
          return new Response("no", { status: 500 });
        }
        if (url.includes("/v1/videos") && method === "POST") {
          posted.push({
            body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
            headers: (init?.headers ?? {}) as Record<string, string>,
          });
          return json({ id: "video_world_1", status: "queued" });
        }
        if (url.includes("/content")) {
          return new Response(new Uint8Array(4096), { status: 200, headers: { "content-type": "video/mp4" } });
        }
        if (url.includes("/v1/videos/") && method === "GET") {
          return json({ id: "video_world_1", status: "completed" });
        }
        return new Response(new Uint8Array(2048), { status: 200, headers: { "content-type": "image/png" } });
      }),
    );
    const started = await tap(t, ONE, THING, "rain");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const viewed = await t.query(watch, { deviceToken: ONE, interactionId: started.interactionId });
    expect(viewed.narration).toContain("holds still");
    expect(viewed.clipUrl).toBeTruthy();
    expect(viewed.clipUrl).not.toContain("tray-one");
    expect(viewed.clipUrl).not.toContain("/v1/videos/");
    expect(viewed.configure.weather).toBe("rain");
    expect(viewed.configure.mood).toBe("still water");
    expect(posted).toHaveLength(1);
    const conditions = posted[0].body.conditions as { role: string; frame_index?: number }[];
    expect(conditions.every((entry) => entry.role === "reference")).toBe(true);
    expect(conditions.some((entry) => entry.role === "keyframe" || entry.frame_index !== undefined)).toBe(false);
    const prompt = String(posted[0].body.prompt);
    expect(prompt).toContain("Rain is falling and visible");
    expect(prompt).not.toContain("at 0.00 seconds");
    expect(prompt).not.toContain("visual style");
  });

  test("a failed director call returns the world unchanged", async () => {
    const t = newBackend();
    await sign(t, ONE);
    process.env.DEEPSEEK_API_KEY = "test-director";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    const result = await t.action(direct, {
      deviceToken: ONE,
      event: "tick",
      state: {
        timeOfDay: 18.5,
        day: 1,
        weather: "clear",
        position: { x: 0, y: 0, z: 0 },
        lastThingId: null,
        palette: {},
        mood: "still water",
      },
    });
    expect(result.reason).toBe(NO_CHANGE_REASON);
    expect(result.transitionMs).toBe(0);
    expect(result.narration).toBe("");
    expect(result.configure.weather).toBe("clear");
    expect(result.configure.timeOfDay).toBe(18.5);
    expect(result.configure.mood).toBe("still water");
    expect(result.configure.palette).toEqual({});
    expect(result.configure.landmarks).toHaveLength(7);
    expect(result.configure.transitionMs).toBe(0);
  });
});

describe("world.describe", () => {
  test("an unsafe prompt is softened and a failed director falls back to a full coast", async () => {
    const t = newBackend();
    await sign(t, ONE);
    const softened = await t.action(describeWorld, { deviceToken: ONE, prompt: "a nude shore with gore" });
    expect(softened.message).toMatch(/gentle/);
    expect(softened.mood).toBe("");
    expect(softened.landmarks).toHaveLength(7);
    expect(softened.palette.sky).toMatch(/^#[0-9a-f]{6}$/);

    process.env.DEEPSEEK_API_KEY = "test-director";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not json", { status: 500 })));
    const fallen = await t.action(describeWorld, { deviceToken: ONE, prompt: "a quiet cabin by the well" });
    expect(fallen.message).toBeNull();
    expect(fallen.mood).toBe("a quiet cabin by the well");
    expect(fallen.weather).toBe("mist");
    expect(fallen.landmarks.map((entry) => entry.slot).sort()).toEqual(
      ["arch", "boat", "cabin", "lantern", "lighthouse", "stranger", "well"],
    );
  });
});

function json(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}
