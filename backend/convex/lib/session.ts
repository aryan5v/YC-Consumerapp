import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

export const ACTIVE_SESSION_KEY = "active";

export async function readSessionUserId(ctx: QueryCtx): Promise<Id<"users"> | null> {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_key", (q) => q.eq("key", ACTIVE_SESSION_KEY))
    .unique();
  return session?.userId ?? null;
}

export async function readAnonymousUser(ctx: QueryCtx): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_kind", (q) => q.eq("kind", "anonymous"))
    .first();
}

export async function readActiveUser(ctx: QueryCtx): Promise<Doc<"users"> | null> {
  const userId = await readSessionUserId(ctx);
  if (userId !== null) {
    const user = await ctx.db.get(userId);
    if (user !== null) return user;
  }
  return await readAnonymousUser(ctx);
}

export async function ensureAnonymousUser(ctx: MutationCtx): Promise<Id<"users">> {
  const existing = await readAnonymousUser(ctx);
  if (existing !== null) return existing._id;
  return await ctx.db.insert("users", { kind: "anonymous", createdAt: Date.now() });
}

export async function setActiveUser(ctx: MutationCtx, userId: Id<"users">): Promise<void> {
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_key", (q) => q.eq("key", ACTIVE_SESSION_KEY))
    .unique();
  if (session === null) {
    await ctx.db.insert("sessions", { key: ACTIVE_SESSION_KEY, userId });
    return;
  }
  await ctx.db.patch(session._id, { userId });
}

export async function ensureActiveUser(ctx: MutationCtx): Promise<Id<"users">> {
  const userId = await readSessionUserId(ctx);
  if (userId !== null) {
    const user = await ctx.db.get(userId);
    if (user !== null) return user._id;
  }
  const anonymous = await ensureAnonymousUser(ctx);
  await setActiveUser(ctx, anonymous);
  return anonymous;
}
