/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { ApiFromModules, FilterApi, FunctionReference } from "convex/server";
import type * as beats from "../beats.js";
import type * as clips from "../clips.js";
import type * as crons from "../crons.js";
import type * as director from "../director.js";
import type * as episodes from "../episodes.js";
import type * as home from "../home.js";
import type * as lib_director from "../lib/director.js";
import type * as lib_episodes from "../lib/episodes.js";
import type * as lib_orchestration from "../lib/orchestration.js";
import type * as lib_session from "../lib/session.js";
import type * as lib_story from "../lib/story.js";
import type * as lib_streak from "../lib/streak.js";
import type * as lib_view from "../lib/view.js";
import type * as runs from "../runs.js";
import type * as schema from "../schema.js";
import type * as session from "../session.js";
import type * as tray from "../tray.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  beats: typeof beats;
  clips: typeof clips;
  crons: typeof crons;
  director: typeof director;
  episodes: typeof episodes;
  home: typeof home;
  "lib/director": typeof lib_director;
  "lib/episodes": typeof lib_episodes;
  "lib/orchestration": typeof lib_orchestration;
  "lib/session": typeof lib_session;
  "lib/story": typeof lib_story;
  "lib/streak": typeof lib_streak;
  "lib/view": typeof lib_view;
  runs: typeof runs;
  schema: typeof schema;
  session: typeof session;
  tray: typeof tray;
}>;
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;
export declare const components: Record<string, unknown>;
