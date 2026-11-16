import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

const DEVICE_TOKEN = /^[A-Za-z0-9_.:-]{6,128}$/;

export function deviceKey(raw: string): string {
  const trimmed = raw.trim();
  if (!DEVICE_TOKEN.test(trimmed)) {
    throw new Error(
      "deviceToken must be 6 to 128 characters of letters, digits, dot, colon, underscore, or dash",
    );
  }
  return trimmed;
}

/**
 * The signed-in Clerk account behind this call, or null for a guest.
 * Convex has already checked the token's signature and issuer (auth.config.ts)
 * by the time `ctx.auth` answers, so `subject` is Clerk's user id and is not
 * something the client can make up.
 */
export type Caller = { clerkUserId: string; name: string | null };

export async function caller(ctx: QueryCtx | MutationCtx): Promise<Caller | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) return null;
  const clerkUserId = identity.subject.trim();
  if (clerkUserId === "") return null;
  const name = (identity.name ?? "").trim();
  return { clerkUserId, name: name === "" ? null : name.slice(0, 60) };
}

async function rowForSession(ctx: QueryCtx, key: string): Promise<Doc<"users"> | null> {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (session === null) return null;
  return await ctx.db.get(session.userId);
}

async function rowForDeviceKey(ctx: QueryCtx, key: string): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_device_key", (q) => q.eq("deviceKey", key))
    .first();
}

async function rowForClerkUser(ctx: QueryCtx, clerkUserId: string): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", clerkUserId))
    .first();
}

/**
 * The player this device reaches right now, or null when it has none.
 *
 * A guest only ever reaches an unclaimed player, so signing out can never leave
 * the next person on this device reading the account's story: a Clerk account's
 * player is readable only by a call that carries that account's verified token.
 */
export async function playerFor(ctx: QueryCtx, raw: string): Promise<Doc<"users"> | null> {
  const key = deviceKey(raw);
  const session = await rowForSession(ctx, key);
  const device = session ?? (await rowForDeviceKey(ctx, key));
  const who = await caller(ctx);
  if (who === null) {
    return device !== null && device.clerkUserId === undefined ? device : null;
  }
  if (device !== null && device.clerkUserId === who.clerkUserId) return device;
  const account = await rowForClerkUser(ctx, who.clerkUserId);
  if (account !== null) return account;
  return device !== null && device.clerkUserId === undefined ? device : null;
}

export async function requirePlayer(ctx: QueryCtx, raw: string): Promise<Doc<"users">> {
  const user = await playerFor(ctx, raw);
  if (user === null) {
    throw new Error(
      (await caller(ctx)) === null
        ? "this device has no player on it yet: call session.signInAnonymously first"
        : "this account has no player on it yet: call session.signInAnonymously to create one",
    );
  }
  return user;
}

async function refetch(ctx: MutationCtx, userId: Id<"users">): Promise<Doc<"users">> {
  const user = await ctx.db.get(userId);
  if (user === null) throw new Error("could not create a player");
  return user;
}

async function bindSession(ctx: MutationCtx, key: string, userId: Id<"users">): Promise<void> {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (session === null) {
    await ctx.db.insert("sessions", { key, userId });
    return;
  }
  if (session.userId !== userId) await ctx.db.patch(session._id, { userId });
}

async function insertGuest(ctx: MutationCtx, key: string): Promise<Doc<"users">> {
  // A device that already has a claimed player keeps that row's device key, so
  // the key never points at two players.
  const byDeviceKey = await rowForDeviceKey(ctx, key);
  const userId = await ctx.db.insert("users", {
    kind: "anonymous",
    deviceKey: byDeviceKey === null ? key : undefined,
    createdAt: Date.now(),
  });
  await bindSession(ctx, key, userId);
  return await refetch(ctx, userId);
}

/**
 * The player a mutation by this device writes to, creating it when this is the
 * first call. A signed-in caller whose account has no player yet adopts the
 * guest player already on this device, so a streak and a live run follow the
 * player into the account instead of being stranded on the install.
 */
export async function ensurePlayer(ctx: MutationCtx, raw: string): Promise<Doc<"users">> {
  const key = deviceKey(raw);
  const who = await caller(ctx);
  const device = (await rowForSession(ctx, key)) ?? (await rowForDeviceKey(ctx, key));
  if (who === null) {
    if (device === null) return await insertGuest(ctx, key);
    if (device.clerkUserId !== undefined) {
      throw new Error(
        "this device's player belongs to a signed-in account: sign in again, or call session.signInAnonymously to play as a guest",
      );
    }
    return device;
  }
  if (device !== null && device.clerkUserId === who.clerkUserId) {
    await bindSession(ctx, key, device._id);
    return device;
  }
  const account = await rowForClerkUser(ctx, who.clerkUserId);
  if (account !== null) {
    await bindSession(ctx, key, account._id);
    return account;
  }
  if (device !== null && device.clerkUserId === undefined) {
    await ctx.db.patch(device._id, {
      clerkUserId: who.clerkUserId,
      kind: "clerk",
      name: device.name ?? who.name ?? undefined,
    });
    await bindSession(ctx, key, device._id);
    return await refetch(ctx, device._id);
  }
  const userId = await ctx.db.insert("users", {
    kind: "clerk",
    clerkUserId: who.clerkUserId,
    name: who.name ?? undefined,
    createdAt: Date.now(),
  });
  await bindSession(ctx, key, userId);
  return await refetch(ctx, userId);
}

/**
 * The player `session.signInAnonymously` settles this device on: the signed-in
 * account when the call carries one, otherwise a guest player of its own.
 */
export async function localPlayer(ctx: MutationCtx, raw: string): Promise<Doc<"users">> {
  if ((await caller(ctx)) !== null) return await ensurePlayer(ctx, raw);
  return await guestPlayer(ctx, raw);
}

/**
 * Puts this device back on a guest player of its own, for signing out and for
 * signing in anonymously. The account keeps its streak and its runs; the device
 * starts over, which is what a guest player is.
 */
export async function guestPlayer(ctx: MutationCtx, raw: string): Promise<Doc<"users">> {
  const key = deviceKey(raw);
  const device = (await rowForSession(ctx, key)) ?? (await rowForDeviceKey(ctx, key));
  if (device !== null && device.clerkUserId === undefined) {
    await bindSession(ctx, key, device._id);
    return device;
  }
  return await insertGuest(ctx, key);
}

export async function runOwnedBy(
  ctx: QueryCtx,
  runId: Id<"runs">,
  deviceToken: string,
): Promise<{ user: Doc<"users">; run: Doc<"runs"> }> {
  const user = await requirePlayer(ctx, deviceToken);
  const run = await ctx.db.get(runId);
  if (run === null) throw new Error("run not found");
  if (run.userId !== user._id) throw new Error("this run belongs to another device");
  return { user, run };
}
