"use client";

/**
 * useModuleDisplay — reads boardGroupBy + (future) defaultView from settings
 * for a given slot. Card fields and list columns are no longer here — they're
 * driven by `fieldDefinitions` order + `hidden` flag (see useEntityFields).
 *
 * Reads org settings from the shared `OrgProvider` context. Does NOT fire
 * its own `listMyOrgs` subscription — that would multiply by the number of
 * board cells on screen.
 */

import { useMemo } from "react";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import { DEFAULT_BOARD_GROUP_BY } from "../config/defaults";
import type { EntitySlot } from "../types";

export function useModuleDisplay(slot: EntitySlot) {
	const { fullOrgEntry } = useCurrentOrg();
	const modules = fullOrgEntry?.org.settings?.modules;

	return useMemo(() => {
		const mod = modules?.find((m) => m.slot === slot);
		return {
			boardGroupBy:
				((mod as Record<string, unknown>)?.boardGroupBy as string | undefined) ??
				DEFAULT_BOARD_GROUP_BY[slot],
		} as const;
	}, [modules, slot]);
}
