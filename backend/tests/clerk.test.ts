/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "../convex/_generated/api";
import schema from "../convex/schema";

const rawModules = import.meta.glob("../convex/**/*.*s");
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([path, loader]) => [path.replace("../convex/", "./"), loader]),
);

function newBackend() {
  return convexTest(schema, modules);
}

type Backend = ReturnType<typeof newBackend>;

const HERMETIC_ENV = [
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "DIRECTOR_API_KEY",
  "FASTH3_URL",
  "FASTH3_URLS",
  "FASTH3_API_KEY",
];
for (const name of HERMETIC_ENV) delete process.env[name];

const DEVICE = "clerk-phone-one";
const SPARE_DEVICE = "clerk-phone-two";
const ISSUER = "https://verb-noun-00.clerk.accounts.dev";

function clerk(subject: string, name?: string) {
  return {
    subject,
    issuer: ISSUER,
    tokenIdentifier: `${ISSUER}|${subject}`,
    ...(name === undefined ? {} : { name }),
  };
}

const MEERA = clerk("user_2meera", "Meera");
const DEV = clerk("user_2dev", "Dev");

async function seated(t: Backend) {
  await t.mutation(api.episodes.seed, { days: 1 });
}

describe("Clerk accounts", () => {
  test("one account is one player, whichever device it signs in on", async () => {
    const t = newBackend();
    const meera = t.withIdentity(MEERA);
    const here = await meera.mutation(api.session.signInAnonymously, { deviceToken: DEVICE });
    const elsewhere = await meera.mutation(api.session.signInAnonymously, { deviceToken: SPARE_DEVICE });
    expect(elsewhere).toBe(here);
    expect(await meera.query(api.session.whoami, { deviceToken: SPARE_DEVICE })).toEqual({
      userId: here,
      name: "Meera",
      anonymous: false,
    });
    const rows = await t.run(async (ctx) => await ctx.db.query("users").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].clerkUserId).toBe("user_2meera");
    expect(rows[0].kind).toBe("clerk");
  });

  test("signing in adopts the guest player, so the streak and the live run come along", async () => {
    const t = newBackend();
    await seated(t);
    const guest = await t.mutation(api.session.signInAnonymously, { deviceToken: DEVICE });
    const runId = await t.mutation(api.runs.startToday, { deviceToken: DEVICE });
    const meera = t.withIdentity(MEERA);
    expect(await meera.mutation(api.session.signInAs, { name: "Meera", deviceToken: DEVICE })).toBe(guest);
    expect(await meera.query(api.users.me, { deviceToken: DEVICE })).toEqual({
      id: guest,
      name: "Meera",
      phone: null,
      anonymous: false,
    });
    expect((await meera.query(api.runs.view, { runId, deviceToken: DEVICE })).status).toBe("active");
    const rows = await t.run(async (ctx) => await ctx.db.query("users").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].deviceKey).toBe(DEVICE);
  });

  test("a signed-in player keeps the account when the story name changes", async () => {
    const t = newBackend();
    const meera = t.withIdentity(MEERA);
    const account = await meera.mutation(api.session.signInAnonymously, { deviceToken: DEVICE });
    await meera.mutation(api.session.signInAs, { name: "Seagull", deviceToken: DEVICE });
    expect(await meera.query(api.users.me, { deviceToken: DEVICE })).toEqual({
      id: account,
      name: "Seagull",
      phone: null,
      anonymous: false,
    });
    const rows = await t.run(async (ctx) => await ctx.db.query("users").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].clerkUserId).toBe("user_2meera");
  });

  test("a guest call on a signed-in device reads nothing and writes nothing until it says it is a guest", async () => {
    const t = newBackend();
    await seated(t);
    const guest = await t.mutation(api.session.signInAnonymously, { deviceToken: DEVICE });
    const meera = t.withIdentity(MEERA);
    await meera.mutation(api.session.signInAnonymously, { deviceToken: DEVICE });
    await meera.mutation(api.runs.startToday, { deviceToken: DEVICE });
    expect(await t.query(api.users.me, { deviceToken: DEVICE })).toBeNull();
    await expect(t.mutation(api.runs.startToday, { deviceToken: DEVICE })).rejects.toThrow(
      /sign in again/,
    );
    expect(await t.run(async (ctx) => await ctx.db.query("runs").collect())).toHaveLength(1);

    const fresh = await t.mutation(api.session.signInAnonymously, { deviceToken: DEVICE });
    expect(fresh).not.toBe(guest);
    expect(await t.query(api.users.me, { deviceToken: DEVICE })).toEqual({
      id: fresh,
      name: null,
      phone: null,
      anonymous: true,
    });
  });

  test("a second account on the same device gets its own player and cannot reach the first account's run", async () => {
    const t = newBackend();
    await seated(t);
    await t.mutation(api.session.signInAnonymously, { deviceToken: DEVICE });
    const meera = t.withIdentity(MEERA);
    const dev = t.withIdentity(DEV);
    const meeraId = await meera.mutation(api.session.signInAnonymously, { deviceToken: DEVICE });
    const runId = await meera.mutation(api.runs.startToday, { deviceToken: DEVICE });
    const devId = await dev.mutation(api.session.signInAnonymously, { deviceToken: DEVICE });
    expect(devId).not.toBe(meeraId);
    expect((await dev.query(api.users.me, { deviceToken: DEVICE }))?.id).toBe(devId);
    expect((await meera.query(api.users.me, { deviceToken: DEVICE }))?.id).toBe(meeraId);
    await expect(dev.query(api.runs.view, { runId, deviceToken: DEVICE })).rejects.toThrow(
      /another device/,
    );
    expect((await meera.query(api.runs.view, { runId, deviceToken: DEVICE })).status).toBe("active");
  });

  test("signing out settles the device on a guest player and leaves the account alone", async () => {
    const t = newBackend();
    const meera = t.withIdentity(MEERA);
    const account = await meera.mutation(api.session.signInAnonymously, { deviceToken: DEVICE });
    const guestId = await t.mutation(api.session.signOut, { deviceToken: DEVICE });
    expect(guestId).not.toBe(account);
    expect(await t.query(api.session.whoami, { deviceToken: DEVICE })).toEqual({
      userId: guestId,
      name: null,
      anonymous: true,
    });
    expect((await meera.query(api.session.whoami, { deviceToken: DEVICE }))?.userId).toBe(account);
    const rows = await t.run(async (ctx) => await ctx.db.query("users").collect());
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.clerkUserId === "user_2meera")).toHaveLength(1);
  });
});

describe("auth.config.ts", () => {
  test("takes Clerk tokens from the configured issuer", async () => {
    const previous = process.env.CLERK_JWT_ISSUER_DOMAIN;
    process.env.CLERK_JWT_ISSUER_DOMAIN = ISSUER;
    vi.resetModules();
    const config = (await import("../convex/auth.config")).default;
    expect(config.providers).toEqual([{ domain: ISSUER, applicationID: "convex" }]);
    if (previous === undefined) delete process.env.CLERK_JWT_ISSUER_DOMAIN;
    else process.env.CLERK_JWT_ISSUER_DOMAIN = previous;
  });

  test("takes no tokens on a deployment with no issuer, so guests keep playing", async () => {
    const previous = process.env.CLERK_JWT_ISSUER_DOMAIN;
    delete process.env.CLERK_JWT_ISSUER_DOMAIN;
    vi.resetModules();
    const config = (await import("../convex/auth.config")).default;
    expect(config.providers).toEqual([]);
    if (previous !== undefined) process.env.CLERK_JWT_ISSUER_DOMAIN = previous;
  });
});
