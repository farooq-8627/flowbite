/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _functions_admin from "../_functions/admin.js";
import type * as _functions_authenticated from "../_functions/authenticated.js";
import type * as _shared_constants from "../_shared/constants.js";
import type * as _shared_errors from "../_shared/errors.js";
import type * as _shared_permissions from "../_shared/permissions.js";
import type * as _shared_types from "../_shared/types.js";
import type * as _shared_validators from "../_shared/validators.js";
import type * as activityLogs_helpers from "../activityLogs/helpers.js";
import type * as auth from "../auth.js";
import type * as http from "../http.js";
import type * as invitations_index from "../invitations/index.js";
import type * as invitations_mutations from "../invitations/mutations.js";
import type * as invitations_queries from "../invitations/queries.js";
import type * as notifications_helpers from "../notifications/helpers.js";
import type * as orgRoles_index from "../orgRoles/index.js";
import type * as orgRoles_mutations from "../orgRoles/mutations.js";
import type * as orgRoles_queries from "../orgRoles/queries.js";
import type * as orgs_helpers from "../orgs/helpers.js";
import type * as orgs_mutations from "../orgs/mutations.js";
import type * as orgs_queries from "../orgs/queries.js";
import type * as users_helpers from "../users/helpers.js";
import type * as users_mutations from "../users/mutations.js";
import type * as users_queries from "../users/queries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_functions/admin": typeof _functions_admin;
  "_functions/authenticated": typeof _functions_authenticated;
  "_shared/constants": typeof _shared_constants;
  "_shared/errors": typeof _shared_errors;
  "_shared/permissions": typeof _shared_permissions;
  "_shared/types": typeof _shared_types;
  "_shared/validators": typeof _shared_validators;
  "activityLogs/helpers": typeof activityLogs_helpers;
  auth: typeof auth;
  http: typeof http;
  "invitations/index": typeof invitations_index;
  "invitations/mutations": typeof invitations_mutations;
  "invitations/queries": typeof invitations_queries;
  "notifications/helpers": typeof notifications_helpers;
  "orgRoles/index": typeof orgRoles_index;
  "orgRoles/mutations": typeof orgRoles_mutations;
  "orgRoles/queries": typeof orgRoles_queries;
  "orgs/helpers": typeof orgs_helpers;
  "orgs/mutations": typeof orgs_mutations;
  "orgs/queries": typeof orgs_queries;
  "users/helpers": typeof users_helpers;
  "users/mutations": typeof users_mutations;
  "users/queries": typeof users_queries;
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
