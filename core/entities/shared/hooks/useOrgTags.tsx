"use client";

/**
 * Org-scoped tag context — single subscription to `tags.listByOrg` shared
 * across all consumers on a page. See AGENTS.md "Per-row data on a list
 * view comes from one batched query" + the parent OrgProvider pattern.
 *
 * Why a separate provider (not OrgProvider)
 * ─────────────────────────────────────────
 * Tags can be a few hundred rows. Fetching them on every dashboard mount
 * is wasteful when the user is just looking at the inbox or settings. So
 * this provider uses a **subscribe-on-demand** model: the underlying
 * `useQuery` only activates when at least one descendant calls
 * `useOrgTags()`. Subsequent consumers on the same render piggyback on
 * the active subscription. When the last consumer unmounts, the provider
 * automatically pauses the subscription on the next render.
 *
 * Same shape as `useFeatureFlags` inside `OrgProvider`, but lifted out
 * so the tags fetch isn't tied to dashboard mount.
 */

import { useQuery } from "convex/react";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";

type Tag = Doc<"tags">;

type CrmDataContextValue = {
	/** Register interest in the tags subscription (paired with unsubscribe). */
	subscribeTags: () => void;
	/** Release interest (paired 1:1 with subscribeTags). */
	unsubscribeTags: () => void;
	/** Current tag list. `undefined` while loading or before any subscriber. */
	tags: ReadonlyArray<Tag> | undefined;
};

const CrmDataContext = createContext<CrmDataContextValue | null>(null);

/**
 * `<CrmDataProvider>` — mount inside the dashboard layout (between
 * OrgProvider and the routed content). Subscribes lazily: there's
 * literally zero network cost if no descendant calls `useOrgTags()` on
 * the active page.
 */
export function CrmDataProvider({ children }: { children: ReactNode }) {
	const { orgId } = useCurrentOrg();
	const [tagSubscriberCount, setTagSubscriberCount] = useState(0);

	const subscribeTags = useCallback(() => setTagSubscriberCount((n) => n + 1), []);
	const unsubscribeTags = useCallback(
		() => setTagSubscriberCount((n) => Math.max(0, n - 1)),
		[],
	);

	const tagsArgs = orgId && tagSubscriberCount > 0 ? { orgId } : "skip";
	const tags = useQuery(api.crm.shared.tags.queries.listByOrg, tagsArgs);

	const value = useMemo<CrmDataContextValue>(
		() => ({ subscribeTags, unsubscribeTags, tags }),
		[subscribeTags, unsubscribeTags, tags],
	);

	return <CrmDataContext.Provider value={value}>{children}</CrmDataContext.Provider>;
}

/**
 * `useOrgTags()` — read the org's tag list. Activates the shared
 * subscription via reference-counted `useEffect`.
 *
 * Pass `undefined` for `orgId` (or while the consumer hasn't decided it
 * needs tags yet) to abstain from the count — the subscription only
 * activates when at least one consumer passes a real id. This lets a
 * popover-only consumer (`TagsCell`) gate its interest on `open ? orgId
 * : undefined` so unopened cards pay zero.
 *
 * Returns:
 *   - `undefined` while loading or while `orgId` is unset
 *   - `Tag[]` once available
 *
 * Outside `<CrmDataProvider>` (auth pages, onboarding, super-admin) it
 * falls back to its own `useQuery` so legacy callsites keep working.
 */
export function useOrgTags(orgId: Id<"orgs"> | undefined): ReadonlyArray<Tag> | undefined {
	const ctx = useContext(CrmDataContext);

	// Subscribe on mount, unsubscribe on unmount. Re-runs when `orgId`
	// transitions undefined ↔ defined, so an opt-in consumer (popover)
	// adds/removes interest as it opens/closes.
	useEffect(() => {
		if (!ctx) return;
		if (!orgId) return;
		ctx.subscribeTags();
		return () => ctx.unsubscribeTags();
	}, [ctx, orgId]);

	// Fallback path — outside the provider, fall back to a per-component
	// subscription so legacy/edge callers still work. Hook order is stable:
	// the call always happens; the args are `"skip"` when ctx is present.
	const fallback = useQuery(
		api.crm.shared.tags.queries.listByOrg,
		!ctx && orgId ? { orgId } : "skip",
	);

	if (!ctx) return fallback;
	if (!orgId) return undefined;
	return ctx.tags;
}
