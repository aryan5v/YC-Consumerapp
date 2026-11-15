/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";
import { checkAnswer } from "../convex/lib/story";
import { fixtureBeat } from "../convex/lib/fixture";
import type { DirectorPuzzleStop, DirectorStop } from "../convex/lib/director";

const rawModules = import.meta.glob("../convex/**/*.*s");
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([path, loader]) => [path.replace("../convex/", "./"), loader]),
);
const env = { ...process.env };
const live = Boolean(process.env.DEEPSEEK_API_KEY?.trim());

beforeAll(() => {
  vi.useFakeTimers();
  for (const key of ["FASTH3_URL", "FASTH3_URLS", "FASTH3_API_KEY", "OPENAI_API_KEY", "KEIKI_API_KEY", "KEIKI_AGENT_ID"]) delete process.env[key];
  process.env.MOCK_LATENCY_MS = "0";
  process.env.TRAY_POLL_MS = "0";
});

afterAll(() => {
  vi.useRealTimers();
  for (const key of ["FASTH3_URL", "FASTH3_URLS", "FASTH3_API_KEY", "OPENAI_API_KEY", "KEIKI_API_KEY", "KEIKI_AGENT_ID", "MOCK_LATENCY_MS", "TRAY_POLL_MS", "EPISODE_BEATS"]) {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  }
});

const words = (s: string) => s.toLowerCase().match(/[a-z0-9]+/g) ?? [];
const nonempty = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0;

function sameAnswers(puzzle: DirectorPuzzleStop): boolean {
  const answers = puzzle.answers;
  if (!Array.isArray(answers) || answers.length === 0 || !answers.every(nonempty)) return false;
  if (puzzle.answer_type === "number") {
    const digits = answers.map((answer) => answer.replace(/\D/g, ""));
    return digits.every((value) => value !== "" && value === digits[0]);
  }
  if (puzzle.answer_type === "pick") {
    const normalize = (value: string) => words(value).join(" ");
    return answers.every((answer) => normalize(answer) === normalize(answers[0]) &&
      puzzle.choices?.some((choice) => normalize(choice) === normalize(answer)));
  }
  if (puzzle.answer_type !== "text") return false;
  const sets = answers.map((answer) => new Set(words(answer).filter((word) => !["a", "an", "the"].includes(word))));
  return sets.every((set, index) => sets.slice(index + 1).every((other) => {
    const overlap = [...set].filter((word) => other.has(word)).length;
    return overlap > 0 && overlap / Math.max(set.size, other.size) >= 0.8;
  }));
}

test("plays twenty episodes and reports director quality", async () => {
  const checks = Array.from({ length: 6 }, () => ({ pass: 0, total: 0 }));
  const offenders: { episode: number; depth: number; text: string; severity: number }[] = [];
  const lengths: number[] = [];
  const taken = new Set<string>();
  const offered = new Set<string>();
  let wrongAnswers = 0;
  let beatsPlayed = 0;
  let fixtureMatches = 0;
  let episodesPlayed = 0;
  let failure: string | null = null;
  const record = (index: number, ok: boolean, episode: number, depth: number, text: string, severity = 1) => {
    checks[index].total++;
    if (ok) checks[index].pass++;
    else offenders.push({ episode, depth, text, severity });
  };

  try {
    for (let episode = 1; episode <= 20; episode++) {
      const budget = 6 + ((episode - 1) % 3);
      process.env.EPISODE_BEATS = String(budget);
      const t = convexTest(schema, modules);
      const runId = await t.mutation(api.runs.startToday, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      let view = await t.query(api.runs.view, { runId });
      let played = 0;
      while (played <= budget) {
        const beat = await t.run(async (ctx) => ctx.db.get(view.current.beatId));
        if (!beat) throw new Error(`Episode ${episode}: missing current beat`);
        const depth = beat.depth;
        const fixture = fixtureBeat({ depth, beatsTotal: budget, state: { items: [], trust: 0, clues: [], beats_left: budget - depth }, pathLabels: [] });
        if (beat.director?.clip_prompt === fixture.clip_prompt) fixtureMatches++;
        const stop = beat.stop as DirectorStop | null | undefined;
        const ending = view.status === "ended" && view.ending !== null;
        played++;
        beatsPlayed++;
        const expected = depth === budget - 1 ? "ending" : depth % 3 === 2 ? "puzzle" : "choice";
        const actual = ending && !stop ? "ending" : stop?.kind ?? "none";
        record(2, actual === expected && (expected !== "ending" || view.stop === null), episode, depth, `expected ${expected}, got ${actual}`);
        const line = beat.spokenLine ?? "";
        const length = line.trim() ? line.trim().split(/\s+/).length : 0;
        lengths.push(length);
        record(5, length <= 14, episode, depth, line, length - 14);
        if (ending) break;

        const wellFormed = stop?.kind === "choice"
          ? Array.isArray(stop.options) && stop.options.length === 3 && stop.options.every((option) => nonempty(option.id) && nonempty(option.label) && nonempty(option.target))
          : stop?.kind === "puzzle" && nonempty(stop.question) && ["number", "text", "pick"].includes(stop.answer_type) && Array.isArray(stop.answers) && stop.answers.length > 0 && stop.answers.every(nonempty) && Boolean(stop.success && stop.failure);
        record(0, Boolean(wellFormed), episode, depth, JSON.stringify(stop));
        if (stop?.kind === "choice") {
          const promptWords = new Set(words(beat.clipPrompt));
          for (const option of stop.options) {
            offered.add(option.id);
            const targetWords = words(option.target);
            const missing = targetWords.filter((word) => !promptWords.has(word));
            record(3, targetWords.length > 0 && missing.length === 0, episode, depth, `target: ${option.target} (missing: ${missing.join(", ")})`, missing.length);
          }
          const option = stop.options[(episode - 1) % stop.options.length];
          if (!option) throw new Error(`Episode ${episode}, depth ${depth}: no playable option`);
          taken.add(option.id);
          await t.mutation(api.runs.choose, { runId, optionId: option.id });
        } else if (stop?.kind === "puzzle") {
          record(4, sameAnswers(stop), episode, depth, `answers: ${JSON.stringify(stop.answers)}; question: ${stop.question}`);
          const wrong = episode % 2 === 0;
          let answer = stop.answers[0];
          if (wrong) {
            answer = "999999999999";
            while (checkAnswer(stop, answer)) answer += "9";
          }
          const result = await t.mutation(api.runs.answer, { runId, answer });
          if (wrong && !result.correct) wrongAnswers++;
        } else {
          throw new Error(`Episode ${episode}, depth ${depth}: no playable stop`);
        }
        await t.finishAllScheduledFunctions(vi.runAllTimers);
        view = await t.query(api.runs.view, { runId });
      }
      record(1, view.status === "ended" && view.ending !== null && played === budget && view.beatIndex === budget - 1, episode, view.beatIndex, `played ${played}/${budget} beats; status ${view.status}`);
      episodesPlayed++;
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }

  lengths.sort((a, b) => a - b);
  const median = lengths.length % 2 ? lengths[Math.floor(lengths.length / 2)] : (lengths[lengths.length / 2 - 1] + lengths[lengths.length / 2]) / 2;
  const names = ["Well-formed stops", "Ending on budget", "Choice/choice/puzzle rhythm", "Targets present in prompt", "Unambiguous answers", "Spoken lines <= 14 words"];
  const unique = [...new Map(offenders.sort((a, b) => b.severity - a.severity).map((item) => [item.text, item])).values()].slice(0, 3);
  console.log([
    `Director quality: ${live ? "live DeepSeek configured (individual calls may fall back to the written fixture)" : "fixture mode: hand-written episode from fixture.ts (no DeepSeek key)"}`,
    `Episodes: ${episodesPlayed}/20; beats played: ${beatsPlayed}; fixture-matching director prompts: ${fixtureMatches}/${beatsPlayed}; option ids taken: ${[...taken].sort().join(", ")}; deliberately wrong answers: ${wrongAnswers}`,
    ...checks.map((check, index) => `${names[index]}: ${check.pass}/${check.total} (${check.total ? (100 * check.pass / check.total).toFixed(1) : "0.0"}%)`),
    `Spoken word distribution: min ${lengths[0] ?? 0}, median ${Number.isFinite(median) ? median : 0}, max ${lengths.at(-1) ?? 0}`,
    "Worst three distinct offenders:",
    ...(unique.length ? unique.map((item) => `  Episode ${item.episode}, depth ${item.depth}: ${item.text}`) : ["  None"]),
    ...(failure ? [`Playthrough error: ${failure}`] : []),
  ].join("\n"));

  expect(failure).toBeNull();
  expect(episodesPlayed).toBe(20);
  expect(wrongAnswers).toBeGreaterThan(0);
  expect(taken.size).toBeGreaterThanOrEqual(3);
  expect([...taken].sort()).toEqual([...offered].sort());
  for (const index of [0, 1, 2, 4, 5]) expect(checks[index].pass).toBe(checks[index].total);
  expect(checks[3].total).toBeGreaterThan(0);
  expect(checks[4].total).toBeGreaterThan(0);
}, 120000);
