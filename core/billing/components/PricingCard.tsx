"use client";

/**
 * Shared <PricingCard /> — single source of truth for tier display in:
 *   1. The in-app billing UI (core/platform/settings/components/groups/BillingGroup.tsx).
 *   2. The marketing /pricing page (`app/(marketing)/pricing/page.tsx` — separate PR track).
 *
 * Reads tier metadata via `api._platform.tiers.queries.listPublicTiers`,
 * which is unauthenticated + DB-first (with in-code fallback). Owner-panel
 * edits to display-copy or variant ids propagate through this component.
 *
 * **Responsibilities:**
 *   - Render the marketing tile (display name, tagline, price, feature
 *     bullets, "Most popular" highlight).
 *   - Provide one of two CTAs:
 *       a) `mode="upgrade"` (in-app billing) — calls
 *          `api.billing.actions.createCheckoutUrl` and redirects to a
 *          LemonSqueezy hosted checkout. Highlights the tier the
 *          workspace is currently on.
 *       b) `mode="marketing"` (landing page) — links to `/login?intent=…`
 *          so the visitor signs up first; once they're in the app they
 *          see the same component in `mode="upgrade"`.
 *   - Honour billing cadence (monthly | yearly) via a parent-controlled
 *     toggle so each PricingCard can re-render with the right variant id.
 *
 * RTL-safety: every directional class uses `start-/end-/ms-/me-`. Border
 * radii via `rounded-[var(--radius)]`. No hardcoded copy beyond CTA labels
 * (those are deliberately user-visible text, not platform names).
 */

import { useAction } from "convex/react";
import { Check, ExternalLink, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export type PricingCadence = "monthly" | "yearly";

export type PricingTier = {
	key: "free" | "starter" | "pro" | "enterprise";
	displayName: string;
	description: string;
	features: ReadonlyArray<string>;
	highlight: boolean;
	monthlyPriceUSD: number;
	yearlyPriceUSD: number;
	trialDays: number;
	lemonSqueezyVariantIdMonthly: string | null;
	lemonSqueezyVariantIdYearly: string | null;
};

type PricingCardProps = {
	tier: PricingTier;
	cadence: PricingCadence;
	mode: "upgrade" | "marketing";
	/** Required when `mode === "upgrade"` — the workspace whose plan we're changing. */
	orgId?: Id<"orgs">;
	/** Required when `mode === "upgrade"` — used to render "Current plan" state. */
	currentTierKey?: PricingTier["key"];
	/** Optional currency formatter override; defaults to en-US USD. */
	formatPrice?: (amountUsd: number) => string;
};

const defaultFormatPrice = (amount: number) =>
	new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(amount);

export function PricingCard({
	tier,
	cadence,
	mode,
	orgId,
	currentTierKey,
	formatPrice = defaultFormatPrice,
}: PricingCardProps) {
	const checkout = useAction(api.billing.actions.createCheckoutUrl);
	const [busy, setBusy] = useState(false);

	const price = cadence === "yearly" ? tier.yearlyPriceUSD : tier.monthlyPriceUSD;
	const variantId =
		cadence === "yearly" ? tier.lemonSqueezyVariantIdYearly : tier.lemonSqueezyVariantIdMonthly;
	const isCurrent = mode === "upgrade" && currentTierKey === tier.key;
	const isFree = tier.monthlyPriceUSD === 0 && tier.yearlyPriceUSD === 0;
	const isEnterprise = tier.key === "enterprise";

	const handleUpgrade = async () => {
		if (!orgId || !variantId) return;
		setBusy(true);
		try {
			const r = await checkout({ orgId, variantId });
			window.location.href = r.url;
		} catch (err) {
			toast.mutationError(err, "Could not start checkout.");
			setBusy(false);
		}
	};

	const handleMarketingClick = () => {
		// Marketing site / unauthenticated visitor — push them through
		// signup. The post-login flow can pick the tier back up from the
		// query string and surface the same PricingCard in "upgrade" mode.
		window.location.href = `/login?intent=upgrade&tier=${tier.key}&cadence=${cadence}`;
	};

	const ctaLabel = (() => {
		if (isCurrent) return "Current plan";
		if (mode === "marketing") return isFree ? "Get started" : `Choose ${tier.displayName}`;
		if (isEnterprise) return "Contact sales";
		if (isFree) return "Downgrade";
		return `Upgrade to ${tier.displayName}`;
	})();

	const ctaDisabled =
		isCurrent || busy || (mode === "upgrade" && !variantId && !isFree && !isEnterprise);

	return (
		<div
			className={cn(
				"flex h-full flex-col gap-5 rounded-[var(--radius)] border bg-card p-6 transition-shadow",
				tier.highlight
					? "border-primary/60 shadow-md ring-1 ring-primary/30"
					: "border-border/60",
			)}
			data-tier={tier.key}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="space-y-1">
					<h3 className="text-base font-semibold tracking-tight">{tier.displayName}</h3>
					<p className="text-sm text-muted-foreground">{tier.description}</p>
				</div>
				{tier.highlight ? (
					<Badge className="shrink-0 gap-1">
						<Sparkles className="size-3" />
						Most popular
					</Badge>
				) : isCurrent ? (
					<Badge variant="outline" className="shrink-0">
						Current
					</Badge>
				) : null}
			</div>

			<div className="flex items-baseline gap-1">
				<span className="text-3xl font-semibold tracking-tight tabular-nums">
					{isFree ? "Free" : formatPrice(price)}
				</span>
				{!isFree && (
					<span className="text-sm text-muted-foreground">
						/{cadence === "yearly" ? "year" : "month"}
					</span>
				)}
			</div>

			{tier.trialDays > 0 && !isFree && !isCurrent ? (
				<p className="text-xs text-muted-foreground">
					Includes a {tier.trialDays}-day free trial — no card required to test.
				</p>
			) : null}

			<ul className="flex flex-1 flex-col gap-2.5 text-sm">
				{tier.features.map((feature) => (
					<li key={feature} className="flex items-start gap-2">
						<Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
						<span>{feature}</span>
					</li>
				))}
			</ul>

			{isEnterprise && mode === "upgrade" ? (
				<Button asChild variant="outline" className="w-full">
					<a href="mailto:sales@example.com?subject=Enterprise%20plan">
						{ctaLabel}
						<ExternalLink className="size-3.5" aria-hidden />
					</a>
				</Button>
			) : (
				<Button
					className="w-full"
					variant={tier.highlight ? "default" : "outline"}
					disabled={ctaDisabled}
					onClick={mode === "upgrade" ? handleUpgrade : handleMarketingClick}
				>
					{busy ? (
						<>
							<Loader2 className="size-3.5 animate-spin" />
							Starting checkout…
						</>
					) : (
						<>
							{ctaLabel}
							{mode === "upgrade" && !isCurrent && !isFree ? (
								<ExternalLink className="size-3.5" aria-hidden />
							) : null}
						</>
					)}
				</Button>
			)}

			{/*
			 * Variant-id misconfig is an OPERATOR concern, not a
			 * customer concern. Surfacing the internal `/xowner/tiers`
			 * path or "LemonSqueezy variant id" jargon to a paying user
			 * (a) leaks the existence of the hidden owner panel, (b)
			 * exposes the billing provider name, and (c) blames the
			 * customer for missing config they have no power to fix.
			 * The disabled CTA button above already communicates "this
			 * tier isn't purchasable right now" — that's the only thing
			 * the user needs. The owner panel + Convex insights surface
			 * the same gap to the operator side.
			 *
			 * If we ever want a customer-friendly fallback (e.g.
			 * "Contact sales" mailto for unsold tiers), wire it through
			 * `tier.contactSalesUrl` from the public tiers query — never
			 * via a string that names the internal slug.
			 */}
		</div>
	);
}
