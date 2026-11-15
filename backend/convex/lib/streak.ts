import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import { addDays } from "./pacific";

export async function bumpStreak(ctx: MutationCtx, userId: Id<"users">, date: string): Promise<void> {
  const existing = await ctx.db
    .query("streaks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
  if (existing !== null && existing.lastDate === date) return;
  const yesterday = addDays(date, -1);
  const current = existing === null ? 1 : existing.lastDate === yesterday ? existing.current + 1 : 1;
  const longest = Math.max(current, existing?.longest ?? 0);
  const updatedAt = Date.now();
  if (existing === null) {
    await ctx.db.insert("streaks", { userId, current, longest, lastDate: date, updatedAt });
    return;
  }
  await ctx.db.patch(existing._id, { current, longest, lastDate: date, updatedAt });
}
