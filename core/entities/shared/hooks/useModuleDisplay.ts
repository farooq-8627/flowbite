"use client";

/**
 * useModuleDisplay — reads cardFields / listColumns / boardGroupBy for a slot.
 *
 * Precedence: DB value (`orgs.settings.modules[slot].*`) → fallback defaults.
 * Admin changes in Settings → Workspace → Module Display update the DB;
 * Convex reactivity re-renders all consumers instantly.
 */

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import {
	DEFAULT_BOARD_GROUP_BY,
	DEFAULT_CARD_FIELDS,
	DEFAULT_LIST_COLUMNS,
} from "../config/defaults";
import type { EntitySlot } from "../types";

export function useModuleDisplay(slot: EntitySlot) {
	const params = useParams();
	const orgSlug = params?.orgSlug as string | undefined;
	const orgs = useQuery(api.orgs.queries.listMyOrgs);
	const orgEntry = orgs?.find((o) => o.org.slug === orgSlug);
	const modules = orgEntry?.org.settings?.modules;

	return useMemo(() => {
		const mod = modules?.find((m) => m.slot === slot);
		return {
			cardFields:
				((mod as Record<string, unknown>)?.cardFields as string[] | undefined) ??
				DEFAULT_CARD_FIELDS[slot],
			listColumns:
				((mod as Record<string, unknown>)?.listColumns as string[] | undefined) ??
				DEFAULT_LIST_COLUMNS[slot],
			boardGroupBy:
				((mod as Record<string, unknown>)?.boardGroupBy as string | undefined) ??
				DEFAULT_BOARD_GROUP_BY[slot],
		} as const;
	}, [modules, slot]);
}
