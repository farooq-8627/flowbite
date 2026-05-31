import type { Metadata } from "next";
import { APP_CONFIG } from "@/config/app-config";
import { HomeView } from "@/core/landing/views/HomeView";

/**
 * `/[locale]` — the public marketing landing page (auth-aware via HomeView).
 *
 * Thin wrapper (per the `app/` rule): exports SEO metadata and renders the
 * single view from `core/landing`. Signed-in users are routed on to their
 * workspace inside HomeView.
 */
export const metadata: Metadata = {
	title: `${APP_CONFIG.name} — Talk to your CRM`,
	description:
		"The AI-native CRM that drafts your follow-ups, manages your pipeline, and tells you what to do next — all through conversation. Free Pro for early users. BYOK on every plan.",
	keywords: [
		"ai crm",
		"talk to your crm",
		"ai-powered crm for small business",
		"crm with ai assistant",
		"ai sales assistant",
		"custom crm development",
		"custom website development",
	],
	alternates: { canonical: APP_CONFIG.url },
	openGraph: {
		type: "website",
		url: APP_CONFIG.url,
		siteName: APP_CONFIG.name,
		title: `${APP_CONFIG.name} — Talk to your CRM`,
		description:
			"The AI-native CRM where you manage your pipeline through conversation. The AI proposes, you approve, the work is done.",
	},
	twitter: {
		card: "summary_large_image",
		title: `${APP_CONFIG.name} — Talk to your CRM`,
		description:
			"The AI-native CRM where you manage your pipeline through conversation. Free Pro for early users.",
	},
};

export default async function Page({
	searchParams,
}: {
	searchParams: Promise<{ continue?: string }>;
}) {
	const sp = await searchParams;
	return <HomeView autoRedirect={sp?.continue === "1"} />;
}
