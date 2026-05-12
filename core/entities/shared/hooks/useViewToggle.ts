"use client";

/**
 * useViewToggle — manages the current view (list/board) for an entity slot.
 *
 * Precedence chain:
 *   URL ?view= → user pref → workspace default → fallback constant
 *
 * Clicking the toggle updates URL only (ephemeral). Persistent changes
 * happen in Settings (workspace or user appearance).
 */

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { DEFAULT_VIEW } from "../config/defaults";
import type { EntitySlot, ViewKind } from "../types";

const VIEW_OPTIONS = ["list", "board"] as const;

export function useViewToggle(slot: EntitySlot): [ViewKind, (v: ViewKind) => void] {
	const params = useParams();
	const orgSlug = params?.orgSlug as string | undefined;

	// URL state
	const [urlView, setUrlView] = useQueryState(
		"view",
		parseAsStringLiteral(VIEW_OPTIONS).withOptions({ history: "replace", shallow: true }),
	);

	// User preference
	const orgs = useQuery(api.orgs.queries.listMyOrgs);
	const orgEntry = orgs?.find((o) => o.org.slug === orgSlug);

	// Workspace default from modules config
	const workspaceDefault = useMemo(() => {
		const mod = orgEntry?.org.settings?.modules?.find((m) => m.slot === slot);
		return (mod as Record<string, unknown>)?.defaultView as ViewKind | undefined;
	}, [orgEntry, slot]);

	// Resolved view following precedence chain
	const view: ViewKind = urlView ?? workspaceDefault ?? DEFAULT_VIEW[slot];

	return [view, setUrlView as (v: ViewKind) => void];
}
