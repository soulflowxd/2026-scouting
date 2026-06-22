/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as events from "../events.js";
import type * as http from "../http.js";
import type * as imports from "../imports.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_env from "../lib/env.js";
import type * as matchScouting from "../matchScouting.js";
import type * as members from "../members.js";
import type * as nexus from "../nexus.js";
import type * as pickLists from "../pickLists.js";
import type * as pit from "../pit.js";
import type * as teams from "../teams.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  events: typeof events;
  http: typeof http;
  imports: typeof imports;
  "lib/authz": typeof lib_authz;
  "lib/env": typeof lib_env;
  matchScouting: typeof matchScouting;
  members: typeof members;
  nexus: typeof nexus;
  pickLists: typeof pickLists;
  pit: typeof pit;
  teams: typeof teams;
  validators: typeof validators;
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
