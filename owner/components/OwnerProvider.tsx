"use client";

/**
 * Owner-panel React context — exposes the owner's profile to nested
 * components without each one re-querying. Mounted at the layout level by
 * passing the server-fetched profile down once.
 *
 * Parallel to `core/shell/shared/hooks/useCurrentOrg.tsx` for the
 * dashboard, but VERY thin: the owner panel has no orgId, no permissions
 * map, no member list. Just the user identity.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §3.1, §7 (OwnerProvider row).
 */
import { createContext, type ReactNode, useContext, useMemo } from "react";

export type OwnerProfile = {
	userId: string;
	email: string;
	name: string | null;
	avatarUrl: string | null;
};

type OwnerContextValue = {
	profile: OwnerProfile;
};

const OwnerContext = createContext<OwnerContextValue | null>(null);

export function OwnerProvider({
	profile,
	children,
}: {
	profile: OwnerProfile;
	children: ReactNode;
}) {
	const value = useMemo(() => ({ profile }), [profile]);
	return <OwnerContext.Provider value={value}>{children}</OwnerContext.Provider>;
}

/**
 * Read the owner profile inside any descendant of `<OwnerProvider>`.
 * Throws if used outside — fail-fast catches mis-mounting bugs.
 */
export function useOwnerProfile(): OwnerProfile {
	const ctx = useContext(OwnerContext);
	if (!ctx) {
		throw new Error("useOwnerProfile must be used inside <OwnerProvider>.");
	}
	return ctx.profile;
}
