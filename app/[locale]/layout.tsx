import type { Metadata } from "next";
import "./globals.css";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { routing } from "@/i18n/routing";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { PostHogProvider } from "@/components/providers/PostHogProvider";
import { PreferencesInitializer } from "@/components/providers/PreferencesInitializer";
import { PreferencesProvider } from "@/stores/preferences/preferences-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ALL_FONT_CLASSES } from "@/lib/fonts/registry";
import { WebVitalsMonitor } from "@/components/monitoring/WebVitalsMonitor";
import { PreferencesAnalytics } from "@/components/monitoring/PreferencesAnalytics";

/**
 * Root layout with all providers in correct nesting order.
 *
 * Provider order (outermost → innermost):
 * 1. ConvexAuthNextjsServerProvider — server-side auth token handling
 * 2. html + body — DOM root with suppressHydrationWarning for next-themes
 * 3. PostHogProvider — analytics, feature flags, pageview tracking
 * 4. ThemeProvider — dark/light/system theme via next-themes
 * 5. ConvexClientProvider — Convex React client + auth
 * 6. NextIntlClientProvider — i18n translations
 * 7. TooltipProvider — shadcn tooltip context
 * 8. Toaster — shadcn sonner toast notifications
 */

export const metadata: Metadata = {
	title: "FlowBite",
	description: "B2B SaaS Platform",
	icons: {
		icon: "/convex.svg",
	},
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
			<html lang={locale} dir={locale === "ar" ? "rtl" : "ltr"} suppressHydrationWarning>
				<body className={`${ALL_FONT_CLASSES.map((f) => f.className).join(" ")} antialiased`}>
					<PostHogProvider>
						<ThemeProvider>
							<PreferencesProvider>
								<PreferencesInitializer />
								<WebVitalsMonitor />
								<PreferencesAnalytics />
								<ConvexClientProvider>
									<NextIntlClientProvider locale={locale}>
										<TooltipProvider>
											{children}
											<Toaster />
										</TooltipProvider>
									</NextIntlClientProvider>
								</ConvexClientProvider>
							</PreferencesProvider>
						</ThemeProvider>
					</PostHogProvider>
				</body>
			</html>
		</ConvexAuthNextjsServerProvider>
	);
}
