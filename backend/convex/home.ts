import { v } from "convex/values";
import { query } from "./_generated/server";
import { homeValidator } from "./lib/validators";
import { deviceUser } from "./lib/session";
import { pacificDate } from "./lib/pacific";
import { runIsReadable } from "./lib/view";

export const today = query({
  args: { deviceToken: v.string() },
  returns: homeValidator,
  handler: async (ctx, { deviceToken }) => {
    const date = pacificDate();
    const episode = await ctx.db
      .query("episodes")
      .withIndex("by_date", (q) => q.eq("date", date))
      .unique();
    if (episode === null) {
      throw new Error(
        `no episode exists for ${date}. Run \`npx convex run episodes:ensureToday\` to create it.`,
      );
    }
    const user = await deviceUser(ctx, deviceToken);
    if (user === null) {
      return {
        episode: {
          id: episode._id,
          date: episode.date,
          title: episode.title,
          tagline: episode.tagline,
          posterUrl: episode.posterUrl,
        },
        streak: 0,
        run: null,
      };
    }
    const streak = await ctx.db
      .query("streaks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .unique();
    const candidate = await ctx.db
      .query("runs")
      .withIndex("by_user_episode", (q) => q.eq("userId", user._id).eq("episodeId", episode._id))
      .order("desc")
      .first();
    const run =
      candidate === null || candidate.status !== "active" || (await runIsReadable(ctx, candidate))
        ? candidate
        : null;
    return {
      episode: {
        id: episode._id,
        date: episode.date,
        title: episode.title,
        tagline: episode.tagline,
        posterUrl: episode.posterUrl,
      },
      streak: streak?.current ?? 0,
      run: run === null ? null : { id: run._id, status: run.status },
    };
  },
});
