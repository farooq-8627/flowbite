import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import { routing } from "@/i18n/routing";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { PostHogProvider } from "@/components/providers/PostHogProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

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
 *
 * Sources:
 * - https://github.com/pacocoursey/next-themes/blob/main/README.md — suppressHydrationWarning
 * - https://github.com/posthog/posthog-js/blob/main/packages/next/README.md — PostHogProvider
 * - https://github.com/StevanFreeborn/conve-x/blob/main/src/providers/index.tsx — provider nesting
 */

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

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
			<html lang={locale} suppressHydrationWarning>
				<body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
					<PostHogProvider>
						<ThemeProvider>
							<ConvexClientProvider>
								<NextIntlClientProvider locale={locale}>
									<TooltipProvider>
										{children}
										<Toaster />
									</TooltipProvider>
								</NextIntlClientProvider>
							</ConvexClientProvider>
						</ThemeProvider>
					</PostHogProvider>
				</body>
			</html>
		</ConvexAuthNextjsServerProvider>
	);
}
