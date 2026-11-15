import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("create the next days of episodes", { hours: 1 }, internal.episodes.ensureAhead, {});

// Today's opening is kept rendered ahead of the first player, and re-checked often because the
// Pacific midnight rollover hands out a new episode whose opening nobody has rendered yet.
crons.interval("pre-generate today's opening", { minutes: 15 }, internal.openings.ensureToday, {});

// Every few minutes: end runs nobody is playing and restart any clip whose poll chain died.
crons.interval("sweep abandoned runs and stuck clips", { minutes: 3 }, internal.runs.sweep, {});

export default crons;
