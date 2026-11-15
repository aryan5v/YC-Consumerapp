import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { ensureActiveUser, readActiveUser } from "./lib/session";
import { normalizePhone } from "./lib/keiki";

export const setPhone = mutation({
  args: { phone: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { phone }) => {
    const userId = await ensureActiveUser(ctx);
    const normalized = normalizePhone(phone);
    await ctx.db.patch(userId, { phone: normalized ?? undefined });
    return normalized;
  },
});

export const me = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      id: v.id("users"),
      name: v.union(v.string(), v.null()),
      phone: v.union(v.string(), v.null()),
      anonymous: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const user = await readActiveUser(ctx);
    if (user === null) return null;
    return {
      id: user._id,
      name: user.name ?? null,
      phone: user.phone ?? null,
      anonymous: user.kind === "anonymous",
    };
  },
});
