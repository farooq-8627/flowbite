import type { ReactNode } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { DashboardError } from "@/components/errors/DashboardError";
import { OnboardingGuard } from "@/core/shell/components/OnboardingGuard";
import { DashboardLayout } from "@/core/shell/layouts/DashboardLayout";

export default async function Layout({
	children,
	params,
}: Readonly<{
	children: ReactNode;
	params: Promise<{ orgSlug: string }>;
}>) {
	const { orgSlug } = await params;

	return (
		<ErrorBoundary fallback={<DashboardError />}>
			<OnboardingGuard>
				<DashboardLayout orgSlug={orgSlug}>{children}</DashboardLayout>
			</OnboardingGuard>
		</ErrorBoundary>
	);
}
