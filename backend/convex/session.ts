import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureAnonymousUser, readActiveUser, setActiveUser } from "./lib/session";

export const whoami = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      userId: v.id("users"),
      name: v.union(v.string(), v.null()),
      anonymous: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const user = await readActiveUser(ctx);
    if (user === null) return null;
    return { userId: user._id, name: user.name ?? null, anonymous: user.kind === "anonymous" };
  },
});

export const signInAnonymously = mutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const userId = await ensureAnonymousUser(ctx);
    await setActiveUser(ctx, userId);
    return userId;
  },
});

export const signInAs = mutation({
  args: { name: v.string() },
  returns: v.id("users"),
  handler: async (ctx, { name }) => {
    const trimmed = name.trim().slice(0, 60);
    if (trimmed === "") throw new Error("a name is required");
    const existing = await ctx.db
      .query("users")
      .withIndex("by_name", (q) => q.eq("name", trimmed))
      .first();
    const userId = existing?._id ?? (await ctx.db.insert("users", { name: trimmed, kind: "named", createdAt: Date.now() }));
    await setActiveUser(ctx, userId);
    return userId;
  },
});

export const signOut = mutation({
  args: {},
  returns: v.id("users"),
  handler: async (ctx) => {
    const userId = await ensureAnonymousUser(ctx);
    await setActiveUser(ctx, userId);
    return userId;
  },
});
