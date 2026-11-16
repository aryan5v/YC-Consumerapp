/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { CASE_ONE, caseScenes, checkCaseLogic } from "../convex/lib/case";

const rawModules = import.meta.glob("../convex/**/*.*s");
const modules = Object.fromEntries(Object.entries(rawModules).map(([path, loader]) => [path.replace("../convex/", "./"), loader]));
const token = "case-player-one";

async function readyCase() {
  const t = convexTest(schema, modules);
  const caseId = await t.mutation(internal.cases.prepare, {});
  const storageId = await t.run(async (ctx) => await ctx.storage.store(new Blob(["case clip"], { type: "video/mp4" })));
  const audioStorageId = await t.run(async (ctx) => await ctx.storage.store(new Blob(["clue voice"], { type: "audio/mpeg" })));
  for (const scene of caseScenes(CASE_ONE)) {
    await t.mutation(internal.cases.saveClip, { caseId, key: scene.key, storageId, audioStorageId });
  }
  await t.mutation(internal.cases.publish, { caseId });
  return { t, caseId };
}

describe("the fixed daily case", () => {
  test("the authored clues eliminate exactly the two wrong answers", () => {
    expect(checkCaseLogic(CASE_ONE)).toBe(true);
    const threeClues = ["keys", "gloves", "bootprints"].map((id) => CASE_ONE.clues.find((clue) => clue.id === id)!);
    const eliminated = threeClues.flatMap((clue) => clue.rules_out === null ? [] : [clue.rules_out]);
    expect(CASE_ONE.answers.filter((answer) => !eliminated.includes(answer))).toEqual([CASE_ONE.answers[CASE_ONE.solution]]);
    expect(caseScenes(CASE_ONE)).toHaveLength(9);
    expect(CASE_ONE.clues.filter((clue) => clue.rules_out === null).length).toBeGreaterThan(0);
  });

  test("publication refuses an incomplete case", async () => {
    const t = convexTest(schema, modules);
    const caseId = await t.mutation(internal.cases.prepare, {});
    await expect(t.mutation(internal.cases.publish, { caseId })).rejects.toThrow("not ready");
    const bundle = await t.run(async (ctx) => await ctx.db.get(caseId));
    expect(bundle?.publishedAt).toBeUndefined();
    const episode = await t.run(async (ctx) => await ctx.db.get(bundle!.episodeId));
    expect(episode?.activeCaseId).toBeUndefined();
  });

  test("three clue taps and a correct solve use only stored clips and bump the streak once", async () => {
    const { t } = await readyCase();
    const runId = await t.mutation(api.runs.startToday, { deviceToken: token });
    let view = await t.query(api.runs.view, { runId, deviceToken: token });
    expect(view.case).toEqual({
      question: CASE_ONE.question, movesLeft: 5, movesTotal: 5,
      solveChoices: CASE_ONE.answers.map((label, index) => ({ id: String(index), label })),
    });
    for (const [i, id] of ["keys", "gloves", "bootprints"].entries()) {
      expect(view.current.status).toBe("ready");
      if (view.stop?.kind !== "choice") throw new Error("expected clue choices");
      expect(view.stop.options.find((option) => option.id === id)?.actions[0].childStatus).toBe("ready");
      await t.mutation(api.runs.choose, { runId, optionId: id, actionId: `${id}1`, expectedBeatId: view.current.beatId, deviceToken: token });
      view = await t.query(api.runs.view, { runId, deviceToken: token });
      expect(view.case?.movesLeft).toBe(4 - i);
      if (view.stop?.kind !== "choice") throw new Error("expected remaining clues");
      expect(view.stop.options.some((option) => option.id === id)).toBe(false);
    }
    const solved = await t.mutation(api.runs.solve, { runId, answerId: "2", expectedBeatId: view.current.beatId, deviceToken: token });
    expect(solved).toEqual({ solved: true });
    view = await t.query(api.runs.view, { runId, deviceToken: token });
    expect(view.status).toBe("ended");
    expect(view.current.status).toBe("ready");
    expect(view.ending?.result).toEqual({ solved: true, movesUsed: 3, movesTotal: 5 });
    expect(view.ending?.streak).toBe(1);
    expect(view.ending?.shareText).toContain("Synqui · Case 1 · solved in 3 of 5");
    expect(await t.mutation(api.runs.startToday, { deviceToken: token })).toBe(runId);
    await expect(t.mutation(api.runs.solve, { runId, answerId: "2", expectedBeatId: view.current.beatId, deviceToken: token })).rejects.toThrow("one solve attempt");
    expect(await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect())).toHaveLength(0);
  });

  test("a wrong answer uses the failed ending and cannot be retried by restarting", async () => {
    const { t, caseId } = await readyCase();
    const runId = await t.mutation(api.runs.startToday, { deviceToken: token });
    let view = await t.query(api.runs.view, { runId, deviceToken: token });
    await t.mutation(api.runs.choose, { runId, optionId: "radio", expectedBeatId: view.current.beatId, deviceToken: token });
    view = await t.query(api.runs.view, { runId, deviceToken: token });
    await t.mutation(api.runs.solve, { runId, answerId: "0", expectedBeatId: view.current.beatId, deviceToken: token });
    view = await t.query(api.runs.view, { runId, deviceToken: token });
    const bundle = await t.run(async (ctx) => await ctx.db.get(caseId));
    expect(view.current.clipUrl).toBe(bundle!.clips.find((clip) => clip.key === "failed")!.url);
    expect(view.ending?.result).toEqual({ solved: false, movesUsed: 1, movesTotal: 5 });
    expect(view.ending?.streak).toBe(0);
    expect(view.stop).toBeNull();
    expect(await t.mutation(api.runs.startToday, { deviceToken: token })).toBe(runId);
    await expect(t.mutation(api.runs.choose, { runId, optionId: "keys", expectedBeatId: view.current.beatId, deviceToken: token })).rejects.toThrow("ended");
  });

  test("five moves is a hard cap, stale taps do not spend another move, and solving still works", async () => {
    const { t } = await readyCase();
    const runId = await t.mutation(api.runs.startToday, { deviceToken: token });
    let view = await t.query(api.runs.view, { runId, deviceToken: token });
    const firstBeat = view.current.beatId;
    for (const clue of CASE_ONE.clues.slice(0, 5)) {
      await t.mutation(api.runs.choose, { runId, optionId: clue.id, expectedBeatId: view.current.beatId, deviceToken: token });
      view = await t.query(api.runs.view, { runId, deviceToken: token });
    }
    expect(view.case?.movesLeft).toBe(0);
    expect(view.stop?.kind === "choice" && view.stop.options).toEqual([]);
    await t.mutation(api.runs.choose, { runId, optionId: "radio", expectedBeatId: firstBeat, deviceToken: token });
    await expect(t.mutation(api.runs.choose, { runId, optionId: "radio", expectedBeatId: view.current.beatId, deviceToken: token })).rejects.toThrow("no moves left");
    await expect(t.mutation(api.runs.solve, { runId, answerId: "2", expectedBeatId: firstBeat, deviceToken: token })).rejects.toThrow("scene changed");
    await expect(t.mutation(api.runs.solve, { runId, answerId: "9", expectedBeatId: view.current.beatId, deviceToken: token })).rejects.toThrow("unknown answer");
    await t.mutation(api.runs.solve, { runId, answerId: "2", expectedBeatId: view.current.beatId, deviceToken: token });
    view = await t.query(api.runs.view, { runId, deviceToken: token });
    expect(view.ending?.result?.movesUsed).toBe(5);
  });

  test("device ownership and case progress survive idle expiry", async () => {
    const { t } = await readyCase();
    const runId = await t.mutation(api.runs.startToday, { deviceToken: token });
    let view = await t.query(api.runs.view, { runId, deviceToken: token });
    await t.mutation(api.session.signInAnonymously, { deviceToken: "another-case-player" });
    await expect(t.mutation(api.runs.choose, { runId, optionId: "keys", expectedBeatId: view.current.beatId, deviceToken: "another-case-player" })).rejects.toThrow("another device");
    await t.mutation(api.runs.choose, { runId, optionId: "keys", expectedBeatId: view.current.beatId, deviceToken: token });
    await t.run(async (ctx) => await ctx.db.patch(runId, { lastActivityAt: Date.now() - 11 * 60_000 }));
    await t.mutation(internal.runs.sweep, {});
    expect(await t.mutation(api.runs.startToday, { deviceToken: token })).toBe(runId);
    view = await t.query(api.runs.view, { runId, deviceToken: token });
    expect(view.case?.movesLeft).toBe(4);
    await expect(t.mutation(api.runs.choose, { runId, optionId: "keys", expectedBeatId: view.current.beatId, deviceToken: token })).rejects.toThrow("already inspected");
  });

  test("publishing a case keeps old-shape runs readable while a new start enters the case", async () => {
    const { t, caseId } = await readyCase();
    const userId = await t.mutation(api.session.signInAnonymously, { deviceToken: token });
    const oldRunId = await t.run(async (ctx) => {
      const bundle = await ctx.db.get(caseId);
      const runId = await ctx.db.insert("runs", {
        userId, episodeId: bundle!.episodeId, status: "active", path: [], optionPath: [], beatsSeen: 0,
        state: { items: [], trust: 0, clues: [], beats_left: 7 }, startedAt: Date.now(),
      });
      const beatId = await ctx.db.insert("beats", {
        runId, depth: 0, status: "ready", clipPrompt: "the old scene", directorAttempts: 0, createdAt: Date.now(),
        stop: { kind: "choice", options: [{ id: "a", label: "the mailbox" }] },
      });
      await ctx.db.patch(runId, { currentBeatId: beatId });
      return runId;
    });
    const before = await t.query(api.runs.view, { runId: oldRunId, deviceToken: token });
    expect(before.case).toBeUndefined();
    expect(before.stop?.kind === "choice" && before.stop.options[0].actions[0].id).toBe("a1");
    const caseRunId = await t.mutation(api.runs.startToday, { deviceToken: token });
    expect(caseRunId).not.toBe(oldRunId);
    expect((await t.query(api.runs.view, { runId: caseRunId, deviceToken: token })).case?.question).toBe(CASE_ONE.question);
    const after = await t.query(api.runs.view, { runId: oldRunId, deviceToken: token });
    expect(after).toEqual(before);
  });
});
