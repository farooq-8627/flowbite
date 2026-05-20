"use client";

import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { type EntityLabels, mergeEntityLabelDefaults } from "./entity-labels-types";
import { OrgEntityLabelsContext } from "./org-entity-labels-context";

/**
 * OrgContext — single source of truth for *every per-org identity / RBAC
 * subscription* for the current dashboard route.
 *
 * Why this exists
 * ───────────────
 * Before this provider, every entity view, drawer, panel, and card called
 * `useQuery` independently for the same handful of session-scoped queries:
 *
 *   - `orgs.listMyOrgs`     (resolve orgSlug → orgId)
 *   - `orgs.getMyMembership` (current user's permissions)
 *   - `orgs.listMembers`    (members for assignee/avatar lookup)
 *   - `orgs.getEntityLabels`(white-labelled entity names)
 *   - `featureFlags.getForOrg` (module / feature toggles)
 *
 * Convex deduplicates network round-trips for identical args, so the
 * client doesn't actually re-fetch — but each `useQuery` call still
 * registers as a server function execution (visible as 100+ calls/min on
 * the Function Calls dashboard during normal use). Worse, every component
 * re-renders independently on each subscription update, exploding the
 * React render tree.
 *
 * Now: this provider mounts once at the dashboard layout level, fires the
 * subscriptions ONCE, and exposes the result via React context. All
 * descendants read via these hooks instead of per-component `useQuery`:
 *
 *   - `useCurrentOrg()`        → { orgSlug, orgId, org, isLoading,
 *                                  membership, members, ... }
 *   - `useOrgPermissions()`    → permissions[]
 *   - `useOrgMembers()`        → members[]
 *   - `useOrgMemberMap()`      → Map<userId, member>
 *   - `useOrgMemberNameMap()`  → Map<userId, name>
 *   - `useEntityLabels()`      → EntityLabels (auto-detects via context)
 *   - `useFeatureFlags()`      → Record<string, boolean> | undefined
 *
 * Locked architectural decision (2026-05-18). Per AGENTS.md rule:
 * components MUST NOT call these queries via `useQuery` directly. Use the
 * context hooks.
 */

type MemberWithUser = NonNullable<FunctionReturnType<typeof api.orgs.queries.listMembers>>[number];

type Membership = NonNullable<FunctionReturnType<typeof api.orgs.queries.getMyMembership>>;

type Me = NonNullable<FunctionReturnType<typeof api.users.queries.me>>;

/**
 * The full `OrgEntry` returned by `listMyOrgs` — `org` field plus the
 * member-row metadata. Exposed as-is so views that need access to
 * `org.settings.modules` (visibility), `org.settings.fileUpload`
 * (upload limits), etc. don't need their own subscription.
 */
type FullOrgEntry = NonNullable<FunctionReturnType<typeof api.orgs.queries.listMyOrgs>>[number];

type OrgEntry = {
	name: string;
	slug: string;
	plan: string;
};

type OrgContextValue = {
	orgSlug: string;
	orgId: Id<"orgs"> | undefined;
	org: OrgEntry | undefined;
	/**
	 * Full org doc + member-row metadata as returned by `listMyOrgs`.
	 * Exposed for views that need to read `org.settings.modules`,
	 * `org.settings.fileUpload`, etc. without a separate subscription.
	 * Most callers should use the trimmed `org` field above instead.
	 */
	fullOrgEntry: FullOrgEntry | undefined;
	/** ALL orgs the current user belongs to (for switcher / multi-org views). */
	allOrgs: ReadonlyArray<FullOrgEntry> | undefined;
	isLoading: boolean;

	/** Current authenticated user (`api.users.queries.me`). Undefined while loading. */
	me: Me | undefined;

	/** Current user's membership row in this org (with permissions resolved). */
	membership: Membership | null | undefined;
	/** All members of the org (each with `user` populated). Undefined while loading. */
	members: ReadonlyArray<MemberWithUser> | undefined;
	/** Pre-built `Map<userId, MemberWithUser>` for O(1) avatar / assignee lookups. */
	memberMap: Map<string, MemberWithUser>;
	/** Pre-built `Map<userId, displayName>` for O(1) label lookups. */
	memberNameMap: Map<string, string>;
	/** Entity labels (with defaults merged). */
	entityLabels: EntityLabels;
	/**
	 * Feature flag map (`{ [flagKey]: boolean }`). `undefined` while loading.
	 * Use `useFeatureFlags()` or `useModuleEnabled(key)` to read; never call
	 * `useQuery(api.featureFlags.queries.getForOrg)` directly inside the shell.
	 */
	featureFlags: Record<string, boolean> | undefined;
};

const OrgContext = createContext<OrgContextValue | null>(null);

const EMPTY_PERMISSIONS: ReadonlyArray<string> = Object.freeze([]);

export function OrgProvider({ orgSlug, children }: { orgSlug: string; children: ReactNode }) {
	// Step 1 — resolve orgSlug → orgId via listMyOrgs (one subscription).
	const orgs = useQuery(api.orgs.queries.listMyOrgs);
	const resolvedOrgId = useMemo<Id<"orgs"> | undefined>(() => {
		return orgs?.find((o) => o.org.slug === orgSlug)?.org._id;
	}, [orgs, orgSlug]);

	// Step 1b — current authenticated user (one subscription, not per-component).
	// Was being called from 9 separate components (ThreadHeader, NoteCard,
	// SavedViewsMenu, NotesView, …). All migrated to read `useMe()` instead.
	const me = useQuery(api.users.queries.me);

	// Step 2 — fan out the per-org subscriptions ONCE.
	const membership = useQuery(
		api.orgs.queries.getMyMembership,
		resolvedOrgId ? { orgId: resolvedOrgId } : "skip",
	);
	const members = useQuery(
		api.orgs.queries.listMembers,
		resolvedOrgId ? { orgId: resolvedOrgId } : "skip",
	);
	// Entity labels are derived from `listMyOrgs` (which already includes the
	// full org doc) — NOT fetched via a separate `getEntityLabels` query.
	// 2026-05-20 fix:
	//   The old code subscribed to `getEntityLabels` independently. That
	//   subscription resolved AFTER `listMyOrgs`, so for a brief window the
	//   provider had `org` defined while `entityLabelsRaw === undefined`.
	//   `useEntityLabels()` then returned the merged-default shape — fine
	//   for orgs on default slugs, but a 404-trigger for orgs that have
	//   renamed an entity (e.g. `lead.slug = "inquiry"`). When the user
	//   visited `/inquiry`, `EntitySlugView` couldn't find the slot in
	//   the default-only map and fired `notFound()`.
	//   Reading from `entry.org.entityLabels` removes that race entirely:
	//   labels arrive in the same Convex round-trip as the orgId itself.

	// Feature flags are session-scoped — hoisted here so `useModuleEnabled`
	// and `<ModuleGuard>` read from context instead of each mounting their
	// own `featureFlags.queries.getForOrg` subscription. Server-side this
	// query already resolves the user's defaultOrgId, so it's safe to fire
	// before `resolvedOrgId` is known. We don't gate on `resolvedOrgId`
	// because the flags don't depend on the current route's orgId — they
	// depend on the authenticated user's default org.
	const featureFlags = useQuery(api.featureFlags.queries.getForOrg);

	const value = useMemo<OrgContextValue>(() => {
		const entry = orgs?.find((o) => o.org.slug === orgSlug);
		const memberMap = new Map<string, MemberWithUser>();
		const memberNameMap = new Map<string, string>();
		for (const m of members ?? []) {
			memberMap.set(String(m.userId), m);
			memberNameMap.set(String(m.userId), m.user?.name ?? m.user?.email ?? "Member");
		}
		return {
			orgSlug,
			orgId: entry?.org._id,
			org: entry?.org
				? { name: entry.org.name, slug: entry.org.slug, plan: entry.org.plan }
				: undefined,
			fullOrgEntry: entry,
			allOrgs: orgs,
			isLoading: orgs === undefined,
			me: me ?? undefined,
			membership,
			members,
			memberMap,
			memberNameMap,
			// Read straight from the org doc returned by listMyOrgs — single
			// subscription, no cross-query race.
			entityLabels: mergeEntityLabelDefaults(entry?.org.entityLabels),
			featureFlags,
		};
	}, [orgs, orgSlug, me, membership, members, featureFlags]);

	return (
		<OrgContext.Provider value={value}>
			{/*
			 * Mount the entity-labels context too so `useEntityLabels()`
			 * inside the dashboard tree reads from the shared subscription
			 * instead of firing its own. The leaf-module split (see
			 * `org-entity-labels-context.ts`) prevents a circular import
			 * with `useEntityLabels`.
			 */}
			<OrgEntityLabelsContext.Provider value={value.entityLabels}>
				{children}
			</OrgEntityLabelsContext.Provider>
		</OrgContext.Provider>
	);
}

/**
 * Returns the current org context. Must be used inside `<OrgProvider>`.
 */
export function useCurrentOrg(): OrgContextValue {
	const ctx = useContext(OrgContext);
	if (!ctx) throw new Error("useCurrentOrg must be used inside <OrgProvider>");
	return ctx;
}

/**
 * Returns the authenticated user (`api.users.queries.me`). Single subscription
 * mounted by `<OrgProvider>` — components MUST NOT call `useQuery(api.users.me)`
 * directly. Returns `undefined` while loading or for unauthenticated routes.
 */
export function useMe(): Me | undefined {
	const ctx = useContext(OrgContext);
	return ctx?.me;
}

/**
 * Returns the membership permissions for the current user.
 *
 * Returns an empty frozen array while loading or if the user isn't a
 * member. Callers that must distinguish "loading" vs "definitely no
 * permissions" should read `membership` from `useCurrentOrg()` directly
 * (`membership === undefined` means loading; `membership === null` means
 * not a member).
 */
export function useOrgPermissions(): ReadonlyArray<string> {
	const { membership } = useCurrentOrg();
	return membership?.permissions ?? EMPTY_PERMISSIONS;
}

/** Returns the full member list. `undefined` while loading. */
export function useOrgMembers(): ReadonlyArray<MemberWithUser> | undefined {
	return useCurrentOrg().members;
}

/** Returns a `Map<userId, member>` for O(1) lookups. Always defined. */
export function useOrgMemberMap(): Map<string, MemberWithUser> {
	return useCurrentOrg().memberMap;
}

/** Returns a `Map<userId, displayName>` for O(1) name lookups. Always defined. */
export function useOrgMemberNameMap(): Map<string, string> {
	return useCurrentOrg().memberNameMap;
}

/**
 * Returns the feature-flag map (`{ [flagKey]: boolean }`) for the current
 * user's default org. `undefined` while loading. Single subscription
 * mounted by `<OrgProvider>` — components MUST NOT call
 * `useQuery(api.featureFlags.queries.getForOrg)` directly.
 *
 * Outside the dashboard shell (no `<OrgProvider>`) this returns `undefined`
 * and `useModuleEnabled` falls back to its own subscription via
 * `useQuery(...)` so legacy callsites keep working.
 */
export function useFeatureFlags(): Record<string, boolean> | undefined {
	const ctx = useContext(OrgContext);
	return ctx?.featureFlags;
}

// Keep types exported for callers that need to type props.
export type { Membership, MemberWithUser };
