"use client";

import { useConvexAuth } from "convex/react";
import { redirect, usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Auth guard for all private routes.
 * Redirects to /signin if not authenticated.
 * Uses render-time redirect() for instant navigation — no useEffect delay.
 */
export default function PrivateLayout({ children }: { children: ReactNode }) {
	const { isAuthenticated, isLoading } = useConvexAuth();
	const pathname = usePathname();

	if (isLoading) return null;

	if (!isAuthenticated) {
		const locale = pathname.split("/")[1] ?? "en";
		redirect(`/${locale}/signin`);
	}

	return <>{children}</>;
}
