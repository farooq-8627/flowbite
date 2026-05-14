"use client";

/**
 * useModuleDisplay — reads boardGroupBy + (future) defaultView from settings
 * for a given slot. Card fields and list columns are no longer here — they're
 * driven by `fieldDefinitions` order + `hidden` flag (see useEntityFields).
 */

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { DEFAULT_BOARD_GROUP_BY } from "../config/defaults";
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
			boardGroupBy:
				((mod as Record<string, unknown>)?.boardGroupBy as string | undefined) ??
				DEFAULT_BOARD_GROUP_BY[slot],
		} as const;
	}, [modules, slot]);
}
