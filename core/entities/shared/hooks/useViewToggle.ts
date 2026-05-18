"use client";

/**
 * useViewToggle — manages the current view (list/board) for an entity slot.
 *
 * Precedence chain:
 *   URL ?view= → user pref → workspace default → fallback constant
 *
 * Clicking the toggle updates URL only (ephemeral). Persistent changes
 * happen in Settings (workspace or user appearance).
 *
 * Reads org settings from the shared `OrgProvider` context — no per-render
 * `listMyOrgs` subscription.
 */

import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useMemo } from "react";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import { DEFAULT_VIEW } from "../config/defaults";
import type { EntitySlot, ViewKind } from "../types";

const VIEW_OPTIONS = ["list", "board"] as const;

export function useViewToggle(slot: EntitySlot): [ViewKind, (v: ViewKind) => void] {
	// URL state
	const [urlView, setUrlView] = useQueryState(
		"view",
		parseAsStringLiteral(VIEW_OPTIONS).withOptions({ history: "replace", shallow: true }),
	);

	// Workspace default from modules config (resolved via shared org context).
	const { fullOrgEntry } = useCurrentOrg();
	const workspaceDefault = useMemo(() => {
		const mod = fullOrgEntry?.org.settings?.modules?.find((m) => m.slot === slot);
		return (mod as Record<string, unknown>)?.defaultView as ViewKind | undefined;
	}, [fullOrgEntry, slot]);

	// Resolved view following precedence chain
	const view: ViewKind = urlView ?? workspaceDefault ?? DEFAULT_VIEW[slot];

	return [view, setUrlView as (v: ViewKind) => void];
}
