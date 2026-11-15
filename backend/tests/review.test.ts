/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { STOCK_MP4S } from "../convex/lib/stock";

const rawModules = import.meta.glob("../convex/**/*.*s");
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([path, loader]) => [path.replace("../convex/", "./"), loader]),
);

const HERMETIC_ENV = ["OPENAI_API_KEY", "DEEPSEEK_API_KEY", "FASTH3_URLS", "FASTH3_URL", "FASTH3_API_KEY"];
for (const name of HERMETIC_ENV) delete process.env[name];

function newBackend() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof newBackend>;

const JUDGE_ONE = "judge-phone-one";
const JUDGE_TWO = "judge-phone-two";

async function startRun(t: Backend, deviceToken: string) {
  await t.mutation(api.episodes.seed, { days: 1 });
  const runId = await t.mutation(api.runs.startToday, { deviceToken });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return runId;
}

async function viewFor(t: Backend, runId: never, deviceToken: string) {
  return await t.query(api.runs.view, { runId, deviceToken });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete process.env.FASTH3_URLS;
  delete process.env.FASTH3_API_KEY;
});

describe("CONS-7 finding 1: two phones at the demo table", () => {
  test("a second device gets its own run and cannot read or advance the first device's run", async () => {
    const t = newBackend();
    const mine = await startRun(t, JUDGE_ONE);
    const theirs = await t.mutation(api.runs.startToday, { deviceToken: JUDGE_TWO });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(theirs).not.toBe(mine);
    const myView = await viewFor(t, mine as never, JUDGE_ONE);
    const theirView = await viewFor(t, theirs as never, JUDGE_TWO);
    expect(theirView.beatIndex).toBe(0);
    expect(theirView.current.beatId).not.toBe(myView.current.beatId);

    await expect(t.query(api.runs.view, { runId: mine, deviceToken: JUDGE_TWO })).rejects.toThrow(
      /another device/,
    );
    await expect(
      t.mutation(api.runs.choose, {
        runId: mine,
        optionId: "a",
        expectedBeatId: myView.current.beatId,
        deviceToken: JUDGE_TWO,
      }),
    ).rejects.toThrow(/another device/);
    await expect(
      t.mutation(api.runs.answer, {
        runId: mine,
        answer: "4187",
        expectedBeatId: myView.current.beatId,
        deviceToken: JUDGE_TWO,
      }),
    ).rejects.toThrow(/another device/);

    const untouched = await viewFor(t, mine as never, JUDGE_ONE);
    expect(untouched.current.beatId).toBe(myView.current.beatId);
    expect(untouched.beatIndex).toBe(0);

    const homeOne = await t.query(api.home.today, { deviceToken: JUDGE_ONE });
    const homeTwo = await t.query(api.home.today, { deviceToken: JUDGE_TWO });
    expect(homeOne.run?.id).toBe(mine);
    expect(homeTwo.run?.id).toBe(theirs);
  });
});

describe("CONS-7 finding 4: a request that arrives after the beat has moved on", () => {
  test("a replayed tap for the old beat does not advance the new beat", async () => {
    const t = newBackend();
    const runId = await startRun(t, JUDGE_ONE);
    const first = await viewFor(t, runId as never, JUDGE_ONE);
    if (first.stop?.kind !== "choice") throw new Error("the first beat should be a choice");
    const staleBeatId = first.current.beatId;
    const optionId = first.stop.options[0].id;

    await t.mutation(api.runs.choose, {
      runId,
      optionId,
      expectedBeatId: staleBeatId,
      deviceToken: JUDGE_ONE,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const second = await viewFor(t, runId as never, JUDGE_ONE);
    expect(second.current.beatId).not.toBe(staleBeatId);
    if (second.stop?.kind !== "choice") throw new Error("the second beat should be a choice");
    expect(second.stop.options.some((option) => option.id === optionId)).toBe(true);

    await t.mutation(api.runs.choose, {
      runId,
      optionId,
      expectedBeatId: staleBeatId,
      deviceToken: JUDGE_ONE,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const third = await viewFor(t, runId as never, JUDGE_ONE);
    expect(third.current.beatId).toBe(second.current.beatId);
    expect(third.beatIndex).toBe(second.beatIndex);
    const run = await t.run(async (ctx) => await ctx.db.get(runId));
    expect(run?.optionPath).toHaveLength(1);
  });

  test("a replayed answer for the old beat cannot move the new beat", async () => {
    const t = newBackend();
    const runId = await startRun(t, JUDGE_ONE);
    let view = await viewFor(t, runId as never, JUDGE_ONE);
    const staleBeatId = view.current.beatId;
    while (view.stop !== null && view.stop.kind === "choice") {
      await t.mutation(api.runs.choose, {
        runId,
        optionId: view.stop.options[0].id,
        expectedBeatId: view.current.beatId,
        deviceToken: JUDGE_ONE,
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      view = await viewFor(t, runId as never, JUDGE_ONE);
    }
    if (view.stop?.kind !== "puzzle") throw new Error("the third beat should be a puzzle");
    const puzzleBeat = view.current.beatId;
    const run = await t.run(async (ctx) => await ctx.db.get(runId));
    const before = run?.optionPath.length ?? 0;

    const stale = await t.mutation(api.runs.answer, {
      runId,
      answer: "0000",
      expectedBeatId: staleBeatId,
      deviceToken: JUDGE_ONE,
    });
    expect(stale.correct).toBe(false);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const after = await viewFor(t, runId as never, JUDGE_ONE);
    expect(after.current.beatId).toBe(puzzleBeat);
    const runAfter = await t.run(async (ctx) => await ctx.db.get(runId));
    expect(runAfter?.optionPath.length).toBe(before);
  });
});

describe("CONS-7 findings 2 and 3: submissions and the jobs they leave behind", () => {
  test("two submissions for the same shot produce one remote job", async () => {
    const t = newBackend();
    const built = await queuedClip(t);
    installTrayFetch();
    await Promise.all([
      t.action(internal.tray.startClip, { beatId: built.beatId }),
      t.action(internal.tray.startClip, { beatId: built.beatId }),
    ]);
    expect(posted().length).toBe(1);
    const clip = await t.run(async (ctx) => await ctx.db.get(built.clipId));
    expect(clip?.status).toBe("generating");
    expect(clip?.attempts).toBe(1);
    expect(clip?.jobId).toBe(`${posted()[0].jobId}@http://tray-one:8000`);
  });

  test("a shot cancelled while its submission is in flight has its remote job cancelled", async () => {
    const t = newBackend();
    const built = await queuedClip(t);
    const gate = deferred<void>();
    installTrayFetch({ hold: gate.promise });
    const running = t.action(internal.tray.startClip, { beatId: built.beatId });
    await waitFor(() => posted().length === 1);
    await t.run(async (ctx) => {
      await ctx.db.patch(built.clipId, { status: "cancelled" });
      await ctx.db.patch(built.beatId, { status: "cancelled" });
    });
    gate.resolve();
    await running;
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(cancelled()).toEqual([posted()[0].jobId.replace("@http://tray-one:8000", "")]);
    const clip = await t.run(async (ctx) => await ctx.db.get(built.clipId));
    expect(clip?.status).toBe("cancelled");
  });

  test("a poll that gives up cancels the remote job instead of leaking it", async () => {
    const t = newBackend();
    const built = await queuedClip(t);
    process.env.FASTH3_URLS = "http://tray-one:8000";
    installTrayFetch({ neverFinishes: true });
    await t.action(internal.tray.startClip, { beatId: built.beatId });
    const clip = await t.run(async (ctx) => await ctx.db.get(built.clipId));
    const jobId = clip?.jobId ?? "";
    const token = clip?.attemptToken ?? "";
    expect(jobId).not.toBe("");

    await t.action(internal.tray.pollClip, {
      beatId: built.beatId,
      attempt: 100000,
      attemptToken: token,
    });
    expect(cancelled()).toEqual([jobId.replace("@http://tray-one:8000", "")]);
    const after = await t.run(async (ctx) => await ctx.db.get(built.clipId));
    expect(after?.status).toBe("ready");
    expect(after?.error).toContain("held clip");
    expect(after?.url).toBeTruthy();
  });
});

describe("CONS-7 finding 5: the last shot of the episode", () => {
  test("an exhausted final clip still ends the run with a held frame and the ending", async () => {
    const t = newBackend();
    await t.mutation(api.episodes.seed, { days: 1 });
    const userId = await t.mutation(api.session.signInAnonymously, { deviceToken: JUDGE_ONE });
    const built = await t.run(async (ctx) => {
      const episode = await ctx.db.query("episodes").first();
      if (episode === null) throw new Error("no episode seeded");
      const runId = await ctx.db.insert("runs", {
        userId,
        episodeId: episode._id,
        status: "active",
        path: ["a", "b", "c"],
        optionPath: ["a", "a", "success"],
        beatsSeen: 6,
        state: { items: [], trust: 1, clues: [], beats_left: 1 },
        startedAt: Date.now(),
      });
      const parentBeatId = await ctx.db.insert("beats", {
        runId,
        depth: episode.beatsTotal - 2,
        status: "ready",
        narration: "One more turn.",
        clipPrompt: "a wet street at night",
        directorAttempts: 1,
        createdAt: Date.now(),
      });
      const parentClipId = await ctx.db.insert("clips", {
        runId,
        beatId: parentBeatId,
        status: "ready",
        url: STOCK_MP4S[0],
        prompt: "a wet street at night",
        seed: 1,
        aspect: episode.aspect,
        seconds: 5,
        attempts: 1,
        createdAt: Date.now(),
      });
      const beatId = await ctx.db.insert("beats", {
        runId,
        parentBeatId,
        optionId: "success",
        depth: episode.beatsTotal - 1,
        status: "generating",
        narration: "The last shot of the night.",
        clipPrompt: "the last shot of the night",
        directorAttempts: 1,
        ending: { title: "The Humming Parcel", summary: "The parcel hums once more." },
        state: { items: [], trust: 1, clues: [], beats_left: 1 },
        createdAt: Date.now(),
      });
      await ctx.db.patch(runId, { currentBeatId: beatId });
      const clipId = await ctx.db.insert("clips", {
        runId,
        beatId,
        status: "generating",
        prompt: "the last shot of the night",
        seed: 2,
        aspect: episode.aspect,
        seconds: 5,
        attempts: 5,
        jobId: "job-final",
        createdAt: Date.now(),
      });
      return { runId, beatId, clipId, parentClipId };
    });

    await t.mutation(internal.clips.markFailed, {
      beatId: built.beatId,
      error: "tray job job-final failed three times",
      retryable: true,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const run = await t.run(async (ctx) => await ctx.db.get(built.runId));
    expect(run?.status).toBe("ended");
    expect(run?.ending?.title).toBe("The Humming Parcel");

    const view = await viewFor(t, built.runId as never, JUDGE_ONE);
    expect(view.status).toBe("ended");
    expect(view.current.status).toBe("ready");
    expect(view.current.clipUrl).toBe(STOCK_MP4S[0]);
    expect(view.ending?.text?.prompt.length).toBeGreaterThan(0);

    const home = await t.query(api.home.today, { deviceToken: JUDGE_ONE });
    expect(home.streak).toBe(1);
  });
});

async function queuedClip(t: Backend) {
  await t.mutation(api.episodes.seed, { days: 1 });
  const userId = await t.mutation(api.session.signInAnonymously, { deviceToken: JUDGE_ONE });
  process.env.FASTH3_URLS = "http://tray-one:8000";
  process.env.FASTH3_API_KEY = "test-tray-key";
  return await t.run(async (ctx) => {
    const episode = await ctx.db.query("episodes").first();
    if (episode === null) throw new Error("no episode seeded");
    const runId = await ctx.db.insert("runs", {
      userId,
      episodeId: episode._id,
      status: "active",
      path: [],
      optionPath: [],
      beatsSeen: 0,
      state: { items: [], trust: 0, clues: [], beats_left: episode.beatsTotal },
      startedAt: Date.now(),
    });
    const beatId = await ctx.db.insert("beats", {
      runId,
      depth: 0,
      status: "generating",
      clipPrompt: "a wet street at night",
      directorAttempts: 1,
      createdAt: Date.now(),
    });
    await ctx.db.patch(runId, { currentBeatId: beatId });
    const clipId = await ctx.db.insert("clips", {
      runId,
      beatId,
      status: "queued",
      prompt: "a wet street at night",
      seed: 3,
      aspect: episode.aspect,
      seconds: 5,
      attempts: 0,
      createdAt: Date.now(),
    });
    return { runId, beatId, clipId };
  });
}

type TrayCall = { jobId: string; body: Record<string, unknown> };

let postedJobs: TrayCall[] = [];
let cancelledJobs: string[] = [];
let counter = 0;

function posted() {
  return postedJobs;
}

function cancelled() {
  return cancelledJobs;
}

function deferred<T>() {
  let resolve!: (value: T | void) => void;
  const promise = new Promise<T | void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function waitFor(check: () => boolean, rounds = 200) {
  for (let round = 0; round < rounds; round += 1) {
    if (check()) return;
    await vi.advanceTimersByTimeAsync(5);
  }
  throw new Error("the tray was never called");
}

function installTrayFetch(options: { hold?: Promise<void>; neverFinishes?: boolean } = {}) {
  postedJobs = [];
  cancelledJobs = [];
  counter = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("/v1/videos") && method === "POST") {
        counter += 1;
        const jobId = `video_test_${counter}`;
        postedJobs.push({ jobId, body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
        if (options.hold !== undefined) await options.hold;
        return jsonResponse({ id: jobId, status: "queued", phase: "queued", completed_steps: 0, total_steps: 8 });
      }
      if (url.includes("/v1/videos/") && method === "DELETE") {
        cancelledJobs.push(decodeURIComponent(url.split("/v1/videos/")[1].split("/")[0]));
        return jsonResponse({ id: "deleted", status: "cancelled" });
      }
      if (url.includes("/v1/videos/") && method === "GET") {
        if (options.neverFinishes === true) {
          return jsonResponse({
            id: url.split("/v1/videos/")[1],
            status: "in_progress",
            phase: "denoising",
            completed_steps: 1,
            total_steps: 8,
          });
        }
        return jsonResponse({ id: "x", status: "completed" });
      }
      return new Response(new Uint8Array(2048), { status: 200, headers: { "content-type": "image/png" } });
    }),
  );
}

function jsonResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
