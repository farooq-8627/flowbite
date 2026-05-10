"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useCallback } from "react";
import { DEFAULT_GROUP, type SettingsGroupId } from "../config/settings-nav";

export function useActiveGroup() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const [activeGroup, setActiveGroupState] = useState<SettingsGroupId>(
		(searchParams.get("group") as SettingsGroupId) ?? DEFAULT_GROUP,
	);

	const setActiveGroup = useCallback(
		(group: SettingsGroupId) => {
			setActiveGroupState(group);
			const params = new URLSearchParams(searchParams.toString());
			params.set("group", group);
			router.replace(`?${params.toString()}`, { scroll: false });
		},
		[searchParams, router],
	);

	return { activeGroup, setActiveGroup };
}
