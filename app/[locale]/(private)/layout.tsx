"use client";

import type { ReactNode } from "react";
import { useConvexAuth } from "convex/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * Auth guard for all private routes.
 * Redirects to /signin if not authenticated.
 * Matches the existing client-side auth pattern used in the app.
 */
export default function PrivateLayout({ children }: { children: ReactNode }) {
	const { isAuthenticated, isLoading } = useConvexAuth();
	const router = useRouter();
	const pathname = usePathname();

	useEffect(() => {
		if (!isLoading && !isAuthenticated) {
			// Extract locale from pathname (first segment)
			const locale = pathname.split("/")[1] ?? "en";
			router.replace(`/${locale}/signin`);
		}
	}, [isAuthenticated, isLoading, router, pathname]);

	if (isLoading) return null;
	if (!isAuthenticated) return null;

	return <>{children}</>;
}
