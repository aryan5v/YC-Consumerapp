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

export async function deviceUser(ctx: QueryCtx, raw: string): Promise<Doc<"users"> | null> {
  const key = deviceKey(raw);
  const direct = await ctx.db
    .query("users")
    .withIndex("by_device_key", (q) => q.eq("deviceKey", key))
    .first();
  if (direct !== null) return direct;
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (session === null) return null;
  return await ctx.db.get(session.userId);
}

export async function requireDeviceUser(ctx: QueryCtx, raw: string): Promise<Doc<"users">> {
  const user = await deviceUser(ctx, raw);
  if (user === null) {
    throw new Error("this device has no player on it yet: call session.signInAnonymously first");
  }
  return user;
}

export async function ensureDeviceUser(ctx: MutationCtx, raw: string): Promise<Doc<"users">> {
  const key = deviceKey(raw);
  const user = await deviceUser(ctx, key);
  if (user !== null) {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (session === null) await ctx.db.insert("sessions", { key, userId: user._id });
    return user;
  }
  const userId = await ctx.db.insert("users", {
    kind: "anonymous",
    deviceKey: key,
    createdAt: Date.now(),
  });
  await ctx.db.insert("sessions", { key, userId });
  const created = await ctx.db.get(userId);
  if (created === null) throw new Error("could not create a player for this device");
  return created;
}

export async function runOwnedBy(
  ctx: QueryCtx,
  runId: Id<"runs">,
  deviceToken: string,
): Promise<{ user: Doc<"users">; run: Doc<"runs"> }> {
  const user = await requireDeviceUser(ctx, deviceToken);
  const run = await ctx.db.get(runId);
  if (run === null) throw new Error("run not found");
  if (run.userId !== user._id) throw new Error("this run belongs to another device");
  return { user, run };
}
