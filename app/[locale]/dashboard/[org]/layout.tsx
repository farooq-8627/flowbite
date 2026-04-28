import type { ReactNode } from "react";

import { DashboardLayout } from "@/core/shell/layouts/DashboardLayout";

export default async function Layout({
	children,
	params,
}: Readonly<{
	children: ReactNode;
	params: Promise<{ org: string }>;
}>) {
	const { org } = await params;

	return <DashboardLayout orgSlug={org}>{children}</DashboardLayout>;
}
