import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { deviceUser, ensureDeviceUser } from "./lib/session";

export const whoami = query({
  args: { deviceToken: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      userId: v.id("users"),
      name: v.union(v.string(), v.null()),
      anonymous: v.boolean(),
    }),
  ),
  handler: async (ctx, { deviceToken }) => {
    const user = await deviceUser(ctx, deviceToken);
    if (user === null) return null;
    return { userId: user._id, name: user.name ?? null, anonymous: user.kind === "anonymous" };
  },
});

export const signInAnonymously = mutation({
  args: { deviceToken: v.string() },
  returns: v.id("users"),
  handler: async (ctx, { deviceToken }) => {
    return (await ensureDeviceUser(ctx, deviceToken))._id;
  },
});

export const signInAs = mutation({
  args: { name: v.string(), deviceToken: v.string() },
  returns: v.id("users"),
  handler: async (ctx, { name, deviceToken }) => {
    const trimmed = name.trim().slice(0, 60);
    if (trimmed === "") throw new Error("a name is required");
    const user = await ensureDeviceUser(ctx, deviceToken);
    if (user.name !== trimmed || user.kind !== "named") {
      await ctx.db.patch(user._id, { name: trimmed, kind: "named" });
    }
    return user._id;
  },
});

export const signOut = mutation({
  args: { deviceToken: v.string() },
  returns: v.id("users"),
  handler: async (ctx, { deviceToken }) => {
    const user = await ensureDeviceUser(ctx, deviceToken);
    if (user.name !== undefined || user.kind !== "anonymous") {
      await ctx.db.patch(user._id, { name: undefined, kind: "anonymous" });
    }
    return user._id;
  },
});
