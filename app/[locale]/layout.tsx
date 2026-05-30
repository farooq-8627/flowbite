import type { Metadata } from "next";
import "./globals.css";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { PostHogProvider } from "@/components/providers/PostHogProvider";
import { PreferencesInitializer } from "@/components/providers/PreferencesInitializer";
import { ThemeBootScript } from "@/components/scripts/theme-boot";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_CONFIG } from "@/config/app-config";
import { routing } from "@/i18n/routing";
import { fontVars } from "@/lib/fonts/registry";
import { PREFERENCE_DEFAULTS } from "@/lib/preferences/preferences-config";
import { PreferencesProvider } from "@/stores/preferences/preferences-provider";

/**
 * Root layout with all providers in correct nesting order.
 *
 * Font strategy (matches next-shadcn-admin-dashboard reference):
 * - `fontVars` (all next/font `.variable` classes) goes on <body> → registers
 *   CSS variables like --font-nunito-sans, --font-inter on the body element.
 * - ThemeBootScript in <head> reads cookie and sets `data-font` on <html> BEFORE hydration.
 * - CSS in globals.css uses `html[data-font="X"] body { --app-font: var(--font-X) }`
 *   — override lands on <body> (where variables live), not <html>.
 * - Result: zero FOUC + instant font switching on preference change.
 *
 * Provider order (outermost → innermost):
 * 1. ConvexAuthNextjsServerProvider — server-side auth token handling
 * 2. html + body — DOM root with suppressHydrationWarning for theme-boot
 * 3. PostHogProvider — analytics, feature flags
 * 4. PreferencesProvider — Zustand store hydration
 * 5. ConvexClientProvider — Convex React client + auth
 * 6. NextIntlClientProvider — i18n translations
 * 7. TooltipProvider — shadcn tooltip context
 */

export const metadata: Metadata = {
	title: APP_CONFIG.name,
	description: APP_CONFIG.description,
	icons: { icon: "/convex.svg" },
};

export function generateStaticParams() {
	return routing.locales.map((locale) => ({ locale }));
}

export default async function RootLayout({
	children,
	params,
}: Readonly<{
	children: React.ReactNode;
	params: Promise<{ locale: string }>;
}>) {
	const { locale } = await params;
	if (!hasLocale(routing.locales, locale)) {
		notFound();
	}
	setRequestLocale(locale);

	return (
		<ConvexAuthNextjsServerProvider>
			<html
				lang={locale}
				dir={locale === "ar" ? "rtl" : "ltr"}
				data-theme-mode={PREFERENCE_DEFAULTS.theme_mode}
				data-theme-preset={PREFERENCE_DEFAULTS.theme_preset}
				data-font={PREFERENCE_DEFAULTS.font}
				data-content-layout={PREFERENCE_DEFAULTS.content_layout}
				data-navbar-style={PREFERENCE_DEFAULTS.navbar_style}
				data-sidebar-variant={PREFERENCE_DEFAULTS.sidebar_variant}
				data-sidebar-collapsible={PREFERENCE_DEFAULTS.sidebar_collapsible}
				suppressHydrationWarning
			>
				<head>
					<ThemeBootScript />
				</head>
				<body className={`${fontVars} min-h-screen antialiased`}>
					<PostHogProvider>
						<PreferencesProvider>
							<PreferencesInitializer />
							<ConvexClientProvider>
								<NextIntlClientProvider locale={locale}>
									<NuqsAdapter>
										<TooltipProvider>
											{children}
											<Toaster />
										</TooltipProvider>
									</NuqsAdapter>
								</NextIntlClientProvider>
							</ConvexClientProvider>
						</PreferencesProvider>
					</PostHogProvider>
				</body>
			</html>
		</ConvexAuthNextjsServerProvider>
	);
}
