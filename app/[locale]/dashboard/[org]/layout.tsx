import type { ReactNode } from "react";

import { DashboardLayout } from "@/core/shell/layouts/DashboardLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DashboardError } from "@/components/errors/DashboardError";

export default async function Layout({
	children,
	params,
}: Readonly<{
	children: ReactNode;
	params: Promise<{ org: string }>;
}>) {
	const { org } = await params;

	return (
		<ErrorBoundary fallback={<DashboardError />}>
			<DashboardLayout orgSlug={org}>{children}</DashboardLayout>
		</ErrorBoundary>
	);
}
