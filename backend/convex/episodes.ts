import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { ensureEpisode } from "./lib/episodes";
import { Doc } from "./_generated/dataModel";
import { addDays, pacificDate } from "./lib/pacific";

const DAYS_AHEAD = 8;

export const ensureToday = mutation({
  args: {},
  returns: v.id("episodes"),
  handler: async (ctx) => {
    const episode = await ensureEpisode(ctx, pacificDate());
    return episode._id;
  },
});

export const seed = mutation({
  args: { days: v.optional(v.number()) },
  returns: v.array(v.id("episodes")),
  handler: async (ctx, { days }) => {
    const today = pacificDate();
    const ahead = Math.max(0, Math.min(60, days ?? DAYS_AHEAD));
    const created: Doc<"episodes">["_id"][] = [];
    for (let offset = 0; offset <= ahead; offset += 1) {
      const episode = await ensureEpisode(ctx, addDays(today, offset));
      created.push(episode._id);
    }
    return created;
  },
});

export const ensureAhead = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const today = pacificDate();
    for (let offset = 0; offset <= DAYS_AHEAD; offset += 1) {
      await ensureEpisode(ctx, addDays(today, offset));
    }
    return null;
  },
});
