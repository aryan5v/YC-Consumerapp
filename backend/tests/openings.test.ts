/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

const rawModules = import.meta.glob("../convex/**/*.*s");
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([path, loader]) => [path.replace("../convex/", "./"), loader]),
);

for (const name of ["OPENAI_API_KEY", "DEEPSEEK_API_KEY", "FASTH3_URLS", "FASTH3_URL", "FASTH3_API_KEY"]) {
  delete process.env[name];
}

const DEVICE = "opening-phone";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("pre-generation: today's opening is rendered ahead of the first player", () => {
  test("a fresh run replays the stored opening with no generation in flight", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.episodes.seed, { days: 1 });
    await t.action(internal.openings.ensureToday, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const stored = await t.run(async (ctx) => await ctx.db.query("openings").collect());
    expect(stored.length).toBe(1);
    const opening = stored[0];
    expect(opening.clipUrl).toMatch(/^https?:/);
    expect(opening.children.length).toBeGreaterThan(0);
    for (const child of opening.children) {
      expect(child.url).toMatch(/^https?:/);
      expect(child.clipPrompt.length).toBeGreaterThan(0);
    }

    const runId = await t.mutation(api.runs.startToday, { deviceToken: DEVICE });
    const view = await t.query(api.runs.view, { runId, deviceToken: DEVICE });
    expect(view.status).toBe("active");
    expect(view.current.status).toBe("ready");
    expect(view.current.clipUrl).toBe(opening.clipUrl);
    const stop = view.stop;
    expect(stop?.kind).toBe("choice");
    if (stop?.kind !== "choice") throw new Error("expected a choice opening");
    expect(stop.options.length).toBeGreaterThan(0);
    for (const option of stop.options) {
      expect(option.actions.length).toBeGreaterThan(0);
      for (const action of option.actions) {
        expect(action.childStatus).toBe("ready");
        expect(action.childClipUrl).toMatch(/^https?:/);
      }
    }

    // A replayed opening schedules no director work for its own first beat.
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const after = await t.query(api.runs.view, { runId, deviceToken: DEVICE });
    expect(after.current.clipUrl).toBe(opening.clipUrl);
  });

  test("the opening is captured once and reused by every later device", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.episodes.seed, { days: 1 });
    await t.action(internal.openings.ensureToday, {});
    await t.action(internal.openings.ensureToday, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run(async (ctx) => await ctx.db.query("openings").collect())).length).toBe(1);

    const first = await t.mutation(api.runs.startToday, { deviceToken: "phone-one" });
    const second = await t.mutation(api.runs.startToday, { deviceToken: "phone-two" });
    const one = await t.query(api.runs.view, { runId: first, deviceToken: "phone-one" });
    const two = await t.query(api.runs.view, { runId: second, deviceToken: "phone-two" });
    expect(one.current.clipUrl).toBe(two.current.clipUrl);
  });
});
