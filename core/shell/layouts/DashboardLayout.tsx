import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { SIDEBAR_COLLAPSIBLE_MODES, SIDEBAR_VARIANTS } from "@/lib/preferences/layout";
import { getPreference } from "@/lib/preferences/preferences-storage";
import { DashboardLayoutClient } from "./DashboardLayoutClient";

/**
 * DashboardLayout - Server component that loads initial preferences and renders client layout
 * @param children - Page content to render inside the dashboard
 * @param orgSlug - Organization slug for routing and data fetching
 */
export async function DashboardLayout({
	children,
	orgSlug,
}: Readonly<{
	children: ReactNode;
	orgSlug: string;
}>) {
	const cookieStore = await cookies();
	const sidebarOpen = cookieStore.get("sidebar_state")?.value !== "false";
	const chatPanelOpen = cookieStore.get("chat_panel_state")?.value === "true";

	const [variant, collapsible] = await Promise.all([
		getPreference("sidebar_variant", SIDEBAR_VARIANTS, "inset"),
		getPreference("sidebar_collapsible", SIDEBAR_COLLAPSIBLE_MODES, "icon"),
	]);

	return (
		<DashboardLayoutClient
			orgSlug={orgSlug}
			variant={variant}
			collapsible={collapsible}
			initialSidebarOpen={sidebarOpen}
			initialChatOpen={chatPanelOpen}
		>
			{children}
		</DashboardLayoutClient>
	);
}
