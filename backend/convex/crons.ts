import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("create the next days of episodes", { hours: 1 }, internal.episodes.ensureAhead, {});

export default crons;
