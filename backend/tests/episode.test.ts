/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { checkAnswer } from "../convex/lib/story";
import { DirectorPuzzleStop, validateBeat } from "../convex/lib/director";
import { fixtureBeat } from "../convex/lib/fixture";
import { addDays, pacificDate } from "../convex/lib/pacific";
import { STOCK_MP4S } from "../convex/lib/stock";
import { matchSpokenOption } from "../convex/lib/speech";
import { extractCode } from "../convex/keiki";
import { KEIKI_SECRET, MOCK_LINE, keikiTool } from "./keiki-fixture";

const HERMETIC_ENV = [
  "KEIKI_API_KEY",
  "KEIKI_AGENT_ID",
  "KEIKI_AGENT_NAME",
  "KEIKI_LINE",
  "KEIKI_OUTBOUND",
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
];
for (const name of HERMETIC_ENV) delete process.env[name];

const rawModules = import.meta.glob("../convex/**/*.*s");
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([path, loader]) => [path.replace("../convex/", "./"), loader]),
);

function newBackend() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof newBackend>;

const WRONG_ANSWER = "9999";
const TOKEN = "judge-phone-one";
const OTHER_TOKEN = "judge-phone-two";

function withBeat(beatId: string) {
  return { deviceToken: TOKEN, expectedBeatId: beatId as never };
}

async function startRun(t: Backend) {
  await t.mutation(api.episodes.seed, { days: 1 });
  const runId = await t.mutation(api.runs.startToday, { deviceToken: TOKEN });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  return runId;
}

async function playEpisode(t: Backend, options: { wrongAnswers?: number } = {}) {
  const wrongAnswers = options.wrongAnswers ?? 0;
  const runId = await startRun(t);
  const transcript: string[] = [];
  let wrongUsed = 0;
  let view = await t.query(api.runs.view, { runId, deviceToken: TOKEN });
  let guard = 0;

  while (view.status === "active") {
    guard += 1;
    if (guard > 30) throw new Error("the episode never reached an ending");
    const stop = view.stop;
    const line = `beat ${view.beatIndex} of ${view.beatsTotal} [${view.current.status}] "${view.current.narration}"`;
    transcript.push(line);

    if (stop === null) throw new Error(`beat ${view.beatIndex} is active with no stop: ${JSON.stringify(view)}`);
    expect(view.current.status).toBe("ready");
    expect(view.current.clipUrl).toMatch(/^https:\/\//);

    expect(stop.spokenLine.length).toBeGreaterThan(0);
    expect(stop.spokenAudioUrl).toBeNull();
    if (stop.kind === "choice") {
      expect(stop.options).toHaveLength(3);
      for (const option of stop.options) {
        expect(option.childStatus).toBe("ready");
        expect(option.childClipUrl).toMatch(/^https:\/\//);
        expect(option.box).toBeNull();
      }
      transcript.push(`  choice: ${stop.options.map((option) => option.label).join(" | ")}`);
      await t.mutation(api.runs.choose, {
        runId,
        optionId: stop.options[0].id,
        ...withBeat(view.current.beatId),
      });
    } else {
      expect(stop.outcomes.success.status).toBe("ready");
      expect(stop.outcomes.failure.status).toBe("ready");
      expect(stop.outcomes.success.clipUrl).toMatch(/^https:\/\//);
      const wrong = wrongUsed < wrongAnswers;
      if (wrong) wrongUsed += 1;
      const answer = wrong ? WRONG_ANSWER : expectedAnswer(stop);
      transcript.push(`  puzzle: ${stop.question} -> ${answer} (${wrong ? "deliberately wrong" : "right"})`);
      const result = await t.mutation(api.runs.answer, {
        runId,
        answer,
        ...withBeat(view.current.beatId),
      });
      expect(result.correct).toBe(!wrong);
    }

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    view = await t.query(api.runs.view, { runId, deviceToken: TOKEN });
  }

  return { runId, view, transcript, wrongUsed };
}

const FIXTURE_ANSWERS: Record<string, string> = {
  "The receipt shows four digits out of order. What is the code?": "4187",
  "The man asks: which door did you come out of?": "The red door",
};

function expectedAnswer(stop: { kind: "puzzle"; question: string; choices: string[] | null }): string {
  const known = FIXTURE_ANSWERS[stop.question];
  if (known !== undefined) return known;
  if (stop.choices !== null && stop.choices.length > 0) return stop.choices[0];
  throw new Error(`the test does not know the answer to "${stop.question}"`);
}

beforeAll(() => {
  vi.useFakeTimers();
  delete process.env.FASTH3_URL;
  delete process.env.FASTH3_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  process.env.MOCK_LATENCY_MS = "0";
  process.env.TRAY_POLL_MS = "0";
  process.env.EPISODE_BEATS = "7";
  process.env.KEIKI_TOOL_SECRET = KEIKI_SECRET;
  delete process.env.KEIKI_API_KEY;
  delete process.env.KEIKI_AGENT_ID;
  delete process.env.OPENAI_API_KEY;
});

describe("mock mode wiring", () => {
  test("reports mock mode when FASTH3_URL is unset", async () => {
    const mode = await newBackend().action(internal.tray.mode, {});
    expect(mode).toBe("mock");
  });
});

describe("a full episode in mock mode", () => {
  test("plays choice and puzzle stops from the first beat to an ending", async () => {
    const t = newBackend();
    const { view, transcript, runId } = await playEpisode(t);
    console.log(transcript.join("\n"));

    expect(view.status).toBe("ended");
    expect(view.ending).not.toBeNull();
    expect(view.ending?.title).toBe("The Humming Parcel");
    expect(view.ending?.path).toHaveLength(6);
    expect(view.beatIndex).toBe(6);
    expect(view.beatsTotal).toBe(7);

    const home = await t.query(api.home.today, { deviceToken: TOKEN });
    expect(home.streak).toBe(1);
    expect(home.run).toEqual({ id: runId, status: "ended" });
  });

  test("keeps prefetch one level deep and cancels the shots the player did not take", async () => {
    const t = newBackend();
    const runId = await startRun(t);
    const first = await t.query(api.runs.view, { runId, deviceToken: TOKEN });
    expect(first.stop?.kind).toBe("choice");
    const taken = first.stop?.kind === "choice" ? first.stop.options[1] : null;
    expect(taken).not.toBeNull();
    await t.mutation(api.runs.choose, {
      runId,
      optionId: taken!.id,
      ...withBeat(first.current.beatId),
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const counts = await t.run(async (ctx) => {
      const beats = await ctx.db.query("beats").collect();
      const clips = await ctx.db.query("clips").collect();
      return {
        beats: beats.length,
        clips: clips.length,
        cancelledBeats: beats.filter((beat) => beat.status === "cancelled").length,
        cancelledSiblingClips: clips.filter(
          (clip) => clip.status === "cancelled" || clip.status === "ready",
        ).length,
        danglingGenerating: clips.filter((clip) => clip.status === "generating" && clip.beatId !== undefined)
          .length,
        depths: beats.map((beat) => beat.depth).sort(),
      };
    });

    expect(counts.depths).toEqual([0, 1, 1, 1, 2, 2, 2]);
    expect(counts.cancelledBeats).toBe(2);
    expect(counts.danglingGenerating).toBe(0);
    expect(counts.beats).toBe(counts.clips);
  });

  test("a wrong answer promotes the failure shot instead of the success shot", async () => {
    const t = newBackend();
    const runId = await startRun(t);
    let view = await t.query(api.runs.view, { runId, deviceToken: TOKEN });
    while (view.stop !== null && view.stop.kind === "choice") {
      await t.mutation(api.runs.choose, {
        runId,
        optionId: view.stop.options[0].id,
        ...withBeat(view.current.beatId),
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      view = await t.query(api.runs.view, { runId, deviceToken: TOKEN });
    }
    expect(view.stop?.kind).toBe("puzzle");
    const before = await t.query(api.runs.view, { runId, deviceToken: TOKEN });
    expect(before.stop?.kind === "puzzle" && before.stop.outcomes.failure.status).toBe("ready");

    const result = await t.mutation(api.runs.answer, {
      runId,
      answer: WRONG_ANSWER,
      ...withBeat(before.current.beatId),
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(result.correct).toBe(false);
    const run = await t.run(async (ctx) => await ctx.db.get(runId));
    expect(run?.path).toContain("The register locks");
    expect(run?.path).not.toContain("The drawer opens");
    const after = await t.query(api.runs.view, { runId, deviceToken: TOKEN });
    expect(after.stop?.kind === "puzzle" && after.stop.outcomes.failure.status).toBeDefined();
  });

  test("startToday resumes an active run rather than starting a second one", async () => {
    const t = newBackend();
    const first = await startRun(t);
    const second = await t.mutation(api.runs.startToday, { deviceToken: TOKEN });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(second).toBe(first);
    const runs = await t.run(async (ctx) => await ctx.db.query("runs").collect());
    expect(runs).toHaveLength(1);
  });
});

describe("streaks", () => {
  test("counts consecutive days", async () => {
    const t = newBackend();
    const today = pacificDate();
    const userId = await t.mutation(api.session.signInAnonymously, { deviceToken: TOKEN });
    await t.run(async (ctx) => {
      await ctx.db.insert("streaks", {
        userId,
        current: 4,
        longest: 4,
        lastDate: addDays(today, -1),
        updatedAt: Date.now(),
      });
    });
    await playEpisode(t);
    const home = await t.query(api.home.today, { deviceToken: TOKEN });
    expect(home.streak).toBe(5);
    const streak = await t.run(async (ctx) => await ctx.db.query("streaks").first());
    expect(streak?.longest).toBe(5);
  });

  test("resets after a missed day", async () => {
    const t = newBackend();
    const today = pacificDate();
    const userId = await t.mutation(api.session.signInAnonymously, { deviceToken: TOKEN });
    await t.run(async (ctx) => {
      await ctx.db.insert("streaks", {
        userId,
        current: 4,
        longest: 9,
        lastDate: addDays(today, -5),
        updatedAt: Date.now(),
      });
    });
    await playEpisode(t);
    const home = await t.query(api.home.today, { deviceToken: TOKEN });
    expect(home.streak).toBe(1);
    const streak = await t.run(async (ctx) => await ctx.db.query("streaks").first());
    expect(streak?.longest).toBe(9);
  });
});

describe("the director contract", () => {
  test("accepts the fixture beats it is written against", () => {
    for (let depth = 0; depth < 7; depth += 1) {
      const expectedKind = depth >= 6 ? "ending" : depth % 3 === 2 ? "puzzle" : "choice";
      const result = validateBeat(fixtureBeat({ depth, beatsTotal: 7, state: { items: [], trust: 0, clues: [], beats_left: 7 - depth }, pathLabels: [] }), {
        expectedKind,
        beatsLeft: 7 - depth,
        beatIndex: depth,
      });
      expect(result.ok, `fixture beat ${depth}`).toBe(true);
    }
  });

  test("rejects a wrong stop kind, a missing ending and a two-option choice", () => {
    const base = { beat_id: "b1", clip_prompt: "a shot", narration: "a line", state: { items: [], trust: 0, clues: [], beats_left: 3 }, ending: null };
    expect(validateBeat({ ...base, stop: { kind: "puzzle", question: "q", answer_type: "number", answers: ["1"], success: { leads_to: "a" }, failure: { leads_to: "b" } } }, { expectedKind: "choice", beatsLeft: 3, beatIndex: 1 }).ok).toBe(false);
    expect(validateBeat({ ...base, stop: null }, { expectedKind: "choice", beatsLeft: 3, beatIndex: 1 }).ok).toBe(false);
    expect(validateBeat(base, { expectedKind: "ending", beatsLeft: 1, beatIndex: 5 }).ok).toBe(false);
    expect(
      validateBeat(
        { ...base, stop: { kind: "choice", options: [{ id: "a", label: "A", target: "t", leads_to: "x" }, { id: "b", label: "B", target: "t", leads_to: "y" }] } },
        { expectedKind: "choice", beatsLeft: 3, beatIndex: 1 },
      ).ok,
    ).toBe(false);
  });

  test("grades answers deterministically", () => {
    const puzzle: DirectorPuzzleStop = {
      kind: "puzzle",
      question: "code?",
      answer_type: "number",
      choices: null,
      answers: ["4187"],
      success: { id: "success", label: "s", leads_to: "a", spoken_line: "s" },
      failure: { id: "failure", label: "f", leads_to: "b", spoken_line: "f" },
    };
    expect(checkAnswer(puzzle, "4187")).toBe(true);
    expect(checkAnswer(puzzle, " 4 1 8 7 ")).toBe(true);
    expect(checkAnswer(puzzle, "4188")).toBe(false);
    const pick: DirectorPuzzleStop = { ...puzzle, answer_type: "pick", choices: ["The red door", "The long street"], answers: ["The red door"] };
    expect(checkAnswer(pick, "the red door")).toBe(true);
    expect(checkAnswer(pick, "The long street")).toBe(false);
    const text: DirectorPuzzleStop = { ...puzzle, answer_type: "text", choices: null, answers: ["the humming parcel"] };
    expect(checkAnswer(text, "Humming parcel")).toBe(true);
    expect(checkAnswer(text, "a completely different thing")).toBe(false);
  });
});

describe("clip failures", () => {
  test("regenerates a failed clip once before giving up", async () => {
    const t = newBackend();
    const runId = await startRun(t);
    void runId;
    const root = await t.run(async (ctx) => await ctx.db.query("clips").first());
    expect(root).not.toBeNull();
    await t.run(async (ctx) => {
      await ctx.db.patch(root!._id, { status: "generating", jobId: "job-1", attempts: 0 });
    });
    await t.mutation(internal.clips.markFailed, { beatId: root!.beatId, error: "boom", retryable: true });
    const requeued = await t.run(async (ctx) => await ctx.db.get(root!._id));
    expect(requeued?.status).toBe("queued");
    expect(requeued?.jobId).toBeUndefined();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const recovered = await t.run(async (ctx) => await ctx.db.get(root!._id));
    expect(recovered?.status).toBe("ready");
    expect(recovered?.url).toMatch(/^https:\/\//);
  });

  test("a clip that cannot be recovered holds the frame and the run keeps playing", async () => {
    const t = newBackend();
    await t.mutation(api.episodes.seed, { days: 1 });
    const userId = await t.mutation(api.session.signInAnonymously, { deviceToken: TOKEN });
    const built = await t.run(async (ctx) => {
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
      await ctx.db.patch(beatId, {
        stopKind: "choice",
        stop: {
          kind: "choice",
          options: [
            { id: "a", label: "Go in", target: "the door", leads_to: "open the door" },
            { id: "b", label: "Walk on", target: "the street", leads_to: "walk on down the street" },
            { id: "c", label: "Talk", target: "the man", leads_to: "talk to the man" },
          ],
        },
        state: { items: [], trust: 0, clues: [], beats_left: episode.beatsTotal },
      });
      const clipId = await ctx.db.insert("clips", {
        runId,
        beatId,
        status: "generating",
        prompt: "a wet street at night",
        seed: 1,
        aspect: episode.aspect,
        seconds: 5,
        attempts: 5,
        jobId: "job-1",
        createdAt: Date.now(),
      });
      return { runId, beatId, clipId };
    });

    await t.mutation(internal.clips.markFailed, { beatId: built.beatId, error: "boom", retryable: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const clip = await t.run(async (ctx) => await ctx.db.get(built.clipId));
    expect(clip?.status).toBe("ready");
    expect(clip?.url).toBe(STOCK_MP4S[0]);
    expect(clip?.error).toContain("held clip");
    const view = await t.query(api.runs.view, { runId: built.runId, deviceToken: TOKEN });
    expect(view.current.status).toBe("ready");
    expect(view.current.clipUrl).toBe(STOCK_MP4S[0]);
    expect(view.stop?.kind).toBe("choice");
    if (view.stop?.kind === "choice") {
      expect(view.stop.options).toHaveLength(3);
      for (const option of view.stop.options) {
        expect(option.childStatus).toBe("ready");
        expect(option.childClipUrl).toMatch(/^https:\/\//);
        expect(option.box).toBeNull();
      }
    }
    expect(view.current.beatId).toBe(built.beatId);
  });
});

describe("the ending hands off to Keiki", () => {
  test("the ending carries the character, the line to text and a five-letter code", async () => {
    const t = newBackend();
    const { view, runId } = await playEpisode(t);
    const text = view.ending?.text;
    expect(text).toBeDefined();
    expect(text?.character).toBe("the man in the grey coat");
    expect(text?.number).toBe(MOCK_LINE);
    expect(text?.prompt).toMatch(/Text [A-Z0-9]{5} to \+15551234567/);

    const code = text?.prompt.match(/Text ([A-Z0-9]{5})/)?.[1] ?? "";
    expect(extractCode(text?.prompt ?? "")).toBe(code);

    const messages = await t.run(async (ctx) => await ctx.db.query("storyMessages").collect());
    const outbound = messages.filter((message) => message.direction === "outbound");
    expect(outbound).toHaveLength(1);
    expect(outbound[0].code).toBe(code);
    expect(outbound[0].character).toBe("the man in the grey coat");
    expect(outbound[0].delivery).toBe("fallback");
    expect(outbound[0].text).toContain("I have been thinking about it all night");
    expect(outbound[0].runId).toBe(runId);
  });

  test("the tool endpoints match a player by phone and record what they said", async () => {
    const t = newBackend();
    await t.mutation(api.users.setPhone, { phone: "(415) 555-0142", deviceToken: TOKEN });
    await playEpisode(t);

    const story = await keikiTool(t, "/keiki/story", { phone: "+14155550142" });
    expect(story.status).toBe(200);
    const payload = (await story.json()) as Record<string, unknown>;
    expect(payload.matched_by).toBe("phone");
    expect((payload.character as { name: string }).name).toBe("the man in the grey coat");
    expect((payload.story as { path: string[] }).path).toHaveLength(6);
    expect(String(payload.instruction)).toContain("You are the man in the grey coat");

    const reply = await keikiTool(t, "/keiki/reply", {
      phone: "+14155550142",
      text: "I came out of the red door, and I never opened it.",
    });
    const replyPayload = (await reply.json()) as Record<string, unknown>;
    expect(replyPayload.ok).toBe(true);
    expect(replyPayload.matched_by).toBe("phone");

    const after = await t.run(async (ctx) => await ctx.db.query("storyMessages").collect());
    const inbound = after.filter((message) => message.direction === "inbound");
    expect(inbound).toHaveLength(1);
    expect(inbound[0].text).toContain("red door");

    const second = await keikiTool(t, "/keiki/story", { phone: "+14155550142" });
    const secondPayload = (await second.json()) as Record<string, unknown>;
    expect(secondPayload.last_reply).toContain("red door");
  });

  test("a stranger can be matched by the code on their ending card", async () => {
    const t = newBackend();
    const { view, runId } = await playEpisode(t);
    const code = view.ending?.text?.prompt.match(/Text ([A-Z0-9]{5})/)?.[1] ?? "";

    const unknown = await keikiTool(t, "/keiki/story", { phone: "+19998887777" });
    const unknownPayload = (await unknown.json()) as Record<string, unknown>;
    expect(unknownPayload.matched_by).toBe("none");
    expect(String(unknownPayload.instruction)).toContain("five-letter code");

    const claimed = await keikiTool(t, "/keiki/story", {
      phone: "+19998887777",
      text: `hi this is me ${code}`,
    });
    const claimedPayload = (await claimed.json()) as Record<string, unknown>;
    expect(claimedPayload.matched_by).toBe("code");
    expect((claimedPayload.player as { id: string }).id).toBeDefined();

    const reply = await keikiTool(t, "/keiki/reply", {
      phone: "+19998887777",
      text: `my code is ${code}, I took the long street`,
    });
    expect(((await reply.json()) as Record<string, unknown>).ok).toBe(true);

    const run = await t.run(async (ctx) => await ctx.db.get(runId));
    expect(run).not.toBeNull();
    const users = await t.run(async (ctx) => await ctx.db.query("users").collect());
    expect(users.some((user) => user.phone === "+19998887777")).toBe(true);
  });

  test("the tools refuse a caller without the shared secret", async () => {
    const t = newBackend();
    await playEpisode(t);
    const noHeader = await t.fetch("/keiki/story", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone: "+14155550142" }),
    });
    expect(noHeader.status).toBe(401);
    const wrong = await t.fetch("/keiki/story", {
      method: "POST",
      headers: { "content-type": "application/json", "x-keiki-secret": "nope" },
      body: JSON.stringify({ phone: "+14155550142" }),
    });
    expect(wrong.status).toBe(401);
    const health = await t.fetch("/keiki/health", { method: "GET" });
    expect(health.status).toBe(200);
    expect(((await health.json()) as Record<string, unknown>).tools).toBe("ready");
  });

  test("what the player texted opens the next episode", async () => {
    const t = newBackend();
    await t.mutation(api.users.setPhone, { phone: "+14155550142", deviceToken: TOKEN });
    const { runId } = await playEpisode(t);
    await keikiTool(t, "/keiki/reply", { phone: "+14155550142", text: "I still have the parcel" });

    const second = await t.mutation(api.runs.startToday, { deviceToken: TOKEN });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(second).not.toBe(runId);

    const beatId = await t.run(async (ctx) => (await ctx.db.get(second))?.currentBeatId);
    const context = await t.query(internal.beats.context, { beatId: beatId! });
    expect(context?.lastPlayerText).toBe("I still have the parcel");

    const fresh = await t.query(api.runs.view, { runId: second, deviceToken: TOKEN });
    expect(fresh.beatIndex).toBe(0);
    expect(fresh.stop?.spokenLine.length).toBeGreaterThan(0);
  });
});

describe("speaking back", () => {
  test("voice is off cleanly without an OpenAI key", async () => {
    const t = newBackend();
    await startRun(t);
    const runId = await startRun(t);
    const view = await t.query(api.runs.view, { runId, deviceToken: TOKEN });
    await expect(
      t.mutation(api.runs.speakUploadUrl, { runId, ...withBeat(view.current.beatId) }),
    ).rejects.toThrow(/OPENAI_API_KEY/);
  });

  test("maps what the player said onto an existing option and never invents one", () => {
    const options = [
      { id: "a", label: "Go into the store", target: "red store door", spokenLine: "You went in the red door." },
      { id: "b", label: "Walk down the street", target: "street ahead", spokenLine: "Down the street then." },
      { id: "c", label: "Talk to the man", target: "man in grey coat", spokenLine: "Come here." },
    ];
    expect(matchSpokenOption(options, "I go into the store").optionId).toBe("a");
    expect(matchSpokenOption(options, "the red door").optionId).toBe("a");
    expect(matchSpokenOption(options, "talk to the man").optionId).toBe("c");
    expect(matchSpokenOption(options, "the second one").optionId).toBe("b");
    expect(matchSpokenOption(options, "walk down the street").optionId).toBe("b");
    expect(matchSpokenOption(options, "I would like a sandwich please").optionId).toBeNull();
    expect(matchSpokenOption(options, "").optionId).toBeNull();
    expect(matchSpokenOption(options, "um").optionId).toBeNull();
    const ambiguous = matchSpokenOption(
      [
        { id: "a", label: "Open the door", target: "red door", spokenLine: "" },
        { id: "b", label: "Open the door", target: "blue door", spokenLine: "" },
      ],
      "open the door",
    );
    expect(ambiguous.optionId).toBeNull();
  });
});
