/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as beats from "../beats.js";
import type * as cases from "../cases.js";
import type * as clips from "../clips.js";
import type * as crons from "../crons.js";
import type * as custom from "../custom.js";
import type * as director from "../director.js";
import type * as episodes from "../episodes.js";
import type * as home from "../home.js";
import type * as http from "../http.js";
import type * as keiki from "../keiki.js";
import type * as lib_advance from "../lib/advance.js";
import type * as lib_case from "../lib/case.js";
import type * as lib_caseRuntime from "../lib/caseRuntime.js";
import type * as lib_config from "../lib/config.js";
import type * as lib_custom from "../lib/custom.js";
import type * as lib_deepseek from "../lib/deepseek.js";
import type * as lib_director from "../lib/director.js";
import type * as lib_env from "../lib/env.js";
import type * as lib_episodes from "../lib/episodes.js";
import type * as lib_fixture from "../lib/fixture.js";
import type * as lib_h3 from "../lib/h3.js";
import type * as lib_keiki from "../lib/keiki.js";
import type * as lib_openai from "../lib/openai.js";
import type * as lib_openings from "../lib/openings.js";
import type * as lib_orchestration from "../lib/orchestration.js";
import type * as lib_pacific from "../lib/pacific.js";
import type * as lib_segment from "../lib/segment.js";
import type * as lib_session from "../lib/session.js";
import type * as lib_speech from "../lib/speech.js";
import type * as lib_stock from "../lib/stock.js";
import type * as lib_story from "../lib/story.js";
import type * as lib_streak from "../lib/streak.js";
import type * as lib_style from "../lib/style.js";
import type * as lib_tray from "../lib/tray.js";
import type * as lib_trayUniserve from "../lib/trayUniserve.js";
import type * as lib_validators from "../lib/validators.js";
import type * as lib_view from "../lib/view.js";
import type * as lib_world from "../lib/world.js";
import type * as openings from "../openings.js";
import type * as runs from "../runs.js";
import type * as session from "../session.js";
import type * as speech from "../speech.js";
import type * as tray from "../tray.js";
import type * as users from "../users.js";
import type * as world from "../world.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  beats: typeof beats;
  cases: typeof cases;
  clips: typeof clips;
  crons: typeof crons;
  custom: typeof custom;
  director: typeof director;
  episodes: typeof episodes;
  home: typeof home;
  http: typeof http;
  keiki: typeof keiki;
  "lib/advance": typeof lib_advance;
  "lib/case": typeof lib_case;
  "lib/caseRuntime": typeof lib_caseRuntime;
  "lib/config": typeof lib_config;
  "lib/custom": typeof lib_custom;
  "lib/deepseek": typeof lib_deepseek;
  "lib/director": typeof lib_director;
  "lib/env": typeof lib_env;
  "lib/episodes": typeof lib_episodes;
  "lib/fixture": typeof lib_fixture;
  "lib/h3": typeof lib_h3;
  "lib/keiki": typeof lib_keiki;
  "lib/openai": typeof lib_openai;
  "lib/openings": typeof lib_openings;
  "lib/orchestration": typeof lib_orchestration;
  "lib/pacific": typeof lib_pacific;
  "lib/segment": typeof lib_segment;
  "lib/session": typeof lib_session;
  "lib/speech": typeof lib_speech;
  "lib/stock": typeof lib_stock;
  "lib/story": typeof lib_story;
  "lib/streak": typeof lib_streak;
  "lib/style": typeof lib_style;
  "lib/tray": typeof lib_tray;
  "lib/trayUniserve": typeof lib_trayUniserve;
  "lib/validators": typeof lib_validators;
  "lib/view": typeof lib_view;
  "lib/world": typeof lib_world;
  openings: typeof openings;
  runs: typeof runs;
  session: typeof session;
  speech: typeof speech;
  tray: typeof tray;
  users: typeof users;
  world: typeof world;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
