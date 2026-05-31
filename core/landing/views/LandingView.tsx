import { ComparisonSection } from "@/core/landing/components/comparison-section";
import { ContactSection } from "@/core/landing/components/contact-section";
import { CtaSection } from "@/core/landing/components/cta-section";
import { DailyRoutineSection } from "@/core/landing/components/daily-routine-section";
import { FaqSection } from "@/core/landing/components/faq-section";
import { FeaturesSection } from "@/core/landing/components/features-section";
import { HeroSection } from "@/core/landing/components/hero-section";
import { LandingFooter } from "@/core/landing/components/landing-footer";
import { LandingNavbar } from "@/core/landing/components/landing-navbar";
import { LogosSection } from "@/core/landing/components/logos-section";
import { PricingSection } from "@/core/landing/components/pricing-section";
import { ServicesSection } from "@/core/landing/components/services-section";
import { StructuredData } from "@/core/landing/components/structured-data";

/**
 * LandingView — the full marketing landing page composed from sections.
 *
 * Rendered by the thin wrapper at `app/(root)/page.tsx`. Lives in `core/`
 * per the "app/ is thin wrappers only" rule. Server-rendered by default;
 * only the navbar and contact form opt into "use client".
 */
export function LandingView() {
	return (
		<>
			<StructuredData />
			<LandingNavbar />
			<main>
				<HeroSection />
				<LogosSection />
				<FeaturesSection />
				<DailyRoutineSection />
				<ComparisonSection />
				<ServicesSection />
				<PricingSection />
				<FaqSection />
				<ContactSection />
				<CtaSection />
			</main>
			<LandingFooter />
		</>
	);
}
