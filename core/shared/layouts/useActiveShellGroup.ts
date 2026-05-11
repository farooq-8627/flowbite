"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";

/**
 * useActiveShellGroup — remembers the active group of a shell layout in the URL's
 * `?group=` query parameter, so deep-linking, tab sharing, and back/forward
 * navigation all work out of the box.
 *
 * The default value is used only on first render when no query param is present.
 *
 * Shared by /settings and /profile/[personCode] — any shell-style view should use
 * this hook.
 */
export function useActiveShellGroup<TId extends string = string>(defaultGroup: TId): {
	activeGroup: TId;
	setActiveGroup: (group: TId) => void;
} {
	const searchParams = useSearchParams();
	const router = useRouter();

	const [activeGroup, setActiveGroupState] = useState<TId>(
		(searchParams.get("group") as TId) ?? defaultGroup,
	);

	const setActiveGroup = useCallback(
		(group: TId) => {
			setActiveGroupState(group);
			const params = new URLSearchParams(searchParams.toString());
			params.set("group", group);
			router.replace(`?${params.toString()}`, { scroll: false });
		},
		[searchParams, router],
	);

	return { activeGroup, setActiveGroup };
}
