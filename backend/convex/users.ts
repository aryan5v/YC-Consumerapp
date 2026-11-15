import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { deviceUser, ensureDeviceUser } from "./lib/session";
import { normalizePhone } from "./lib/keiki";

export const setPhone = mutation({
  args: { phone: v.string(), deviceToken: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { phone, deviceToken }) => {
    const userId = (await ensureDeviceUser(ctx, deviceToken))._id;
    const normalized = normalizePhone(phone);
    await ctx.db.patch(userId, { phone: normalized ?? undefined });
    return normalized;
  },
});

export const me = query({
  args: { deviceToken: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      id: v.id("users"),
      name: v.union(v.string(), v.null()),
      phone: v.union(v.string(), v.null()),
      anonymous: v.boolean(),
    }),
  ),
  handler: async (ctx, { deviceToken }) => {
    const user = await deviceUser(ctx, deviceToken);
    if (user === null) return null;
    return {
      id: user._id,
      name: user.name ?? null,
      phone: user.phone ?? null,
      anonymous: user.kind === "anonymous",
    };
  },
});
