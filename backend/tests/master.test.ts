/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { CASE_ONE } from "../convex/lib/case";
import { readFileSync } from "node:fs";

const rawModules = import.meta.glob("../convex/**/*.*s");
const modules = Object.fromEntries(Object.entries(rawModules).map(([path, loader]) => [path.replace("../convex/", "./"), loader]));
const originalKey = process.env.OPENAI_API_KEY;
beforeEach(() => { process.env.OPENAI_API_KEY = "test-only"; });
afterEach(() => {
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
  vi.restoreAllMocks();
});

describe("the public game-master page and token route", () => {
  test("serves the exact merged page and handles CORS without a token request", async () => {
    const t = convexTest(schema, modules);
    const page = await t.fetch("/master");
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(await page.text()).toBe(readFileSync(new URL("../../master/index.html", import.meta.url), "utf8"));
    const options = await t.fetch("/master/token", { method: "OPTIONS" });
    expect(options.status).toBe(204);
    expect(options.headers.get("access-control-allow-origin")).toBe("*");
  });

  test("refuses missing and unowned runs before minting a secret", async () => {
    const t = convexTest(schema, modules);
    const fetch = vi.spyOn(globalThis, "fetch");
    const missing = await t.fetch("/master/token", { method: "POST", body: "{}" });
    expect(missing.status).toBe(400);
    const wrong = await t.fetch("/master/token", { method: "POST", body: JSON.stringify({ run: "not-a-run", device: "wrong-device" }) });
    expect(wrong.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  test("mints with server-owned case context rather than client-supplied clues", async () => {
    const t = convexTest(schema, modules);
    const device = "master-test-device";
    const userId = await t.mutation(api.session.signInAnonymously, { deviceToken: device });
    const caseId = await t.mutation(internal.cases.prepare, {});
    const run = await t.run(async (ctx) => {
      const bundle = await ctx.db.get(caseId);
      return await ctx.db.insert("runs", {
        userId, episodeId: bundle!.episodeId, caseId, caseClues: ["keys"], status: "active",
        path: [], optionPath: [], beatsSeen: 1,
        state: { items: [], trust: 0, clues: [], beats_left: 4 }, startedAt: Date.now(),
      });
    });
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ value: "test-client-secret", expires_at: 123 }), { status: 200 }));
    const response = await t.fetch("/master/token", {
      method: "POST", body: JSON.stringify({ run, device, question: "client spoof", clues: ["client-only clue"], movesLeft: 99 }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ value: "test-client-secret", expires_at: 123 });
    expect(fetch.mock.calls[0][0]).toContain("/realtime/client_secrets");
    const request = JSON.parse(fetch.mock.calls[0][1]!.body as string);
    expect(request.session.model).toBe("gpt-realtime-2.1-mini");
    expect(request.session.instructions).toContain(CASE_ONE.question);
    expect(request.session.instructions).toContain("Moves left: 4");
    expect(request.session.instructions).not.toContain("client spoof");
    expect(request.session.instructions).not.toContain("client-only clue");
  });
});
