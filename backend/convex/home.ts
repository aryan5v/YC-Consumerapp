import { query } from "./_generated/server";
import { homeValidator } from "./lib/validators";
import { readActiveUser } from "./lib/session";
import { pacificDate } from "./lib/pacific";

export const today = query({
  args: {},
  returns: homeValidator,
  handler: async (ctx) => {
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
    const user = await readActiveUser(ctx);
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
    const run = await ctx.db
      .query("runs")
      .withIndex("by_user_episode", (q) => q.eq("userId", user._id).eq("episodeId", episode._id))
      .order("desc")
      .first();
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
