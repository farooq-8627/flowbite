"use client";

import { useQuery } from "convex/react";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { TrialBanner } from "@/core/billing/components/TrialBanner";
import type { OrgSettings } from "../../types";
import { SettingsSection } from "../shared/SettingsSection";

function StatusBadge({ status }: { status: string | undefined }) {
	if (!status) return null;
	const tone =
		status === "active" || status === "on_trial"
			? "default"
			: status === "past_due" || status === "unpaid"
				? "destructive"
				: "secondary";
	return (
		<Badge variant={tone} className="capitalize">
			{status.replace("_", " ")}
		</Badge>
	);
}

/**
 * In-app billing settings — platform billing status only.
 *
 * Trimmed (2026-06-06) to drop the four full PricingCards. The complete
 * plan comparison + feature matrix lives on the public marketing pricing
 * page (`core/landing/components/pricing-section.tsx`, anchor `#pricing`)
 * and duplicating it inside the dashboard was redundant. This surface now
 * keeps ONLY the platform-billing facts a customer needs day to day — their
 * current plan, subscription status, and the renewal date — plus one compact
 * button that takes them to the marketing pricing page to upgrade or
 * downgrade. The button opens in a new tab so the customer doesn't lose their
 * settings context.
 *
 * Plan/status/period come from `billing.queries.getCurrentPlan`. The actual
 * checkout still flows through LemonSqueezy from the pricing page's
 * `<PricingCard mode="upgrade" />`.
 */
export function BillingGroup({ org: _org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const plan = useQuery(api.billing.queries.getCurrentPlan, { orgId });

	if (!plan) {
		return (
			<SettingsSection id="billing.plan" title="Plan & billing" description="Loading…">
				<div className="py-6 text-center text-muted-foreground text-sm">
					<Loader2 className="mx-auto size-4 animate-spin" />
				</div>
			</SettingsSection>
		);
	}

	const periodEnd = plan.lemonSqueezy.currentPeriodEnd;
	const status = plan.lemonSqueezy.status;

	return (
		<div className="grid gap-6">
			<TrialBanner orgId={orgId} />

			<SettingsSection
				id="billing.plan"
				title="Plan & billing"
				description="Your workspace's current plan and billing status. Compare every plan and switch any time on our pricing page. Your data comes with you."
				action={
					<div className="flex items-center gap-2">
						<Badge className="capitalize">{plan.planLabel}</Badge>
						<StatusBadge status={status} />
					</div>
				}
			>
				<div className="flex flex-col gap-4 rounded-[var(--radius)] border bg-card/50 p-4 sm:flex-row sm:items-center sm:justify-between">
					<dl className="grid gap-3 text-sm sm:grid-cols-2">
						<div className="flex flex-col gap-0.5">
							<dt className="text-xs text-muted-foreground">Current plan</dt>
							<dd className="font-medium capitalize">{plan.planLabel}</dd>
						</div>
						<div className="flex flex-col gap-0.5">
							<dt className="text-xs text-muted-foreground">Status</dt>
							<dd className="font-medium capitalize">
								{status ? status.replace("_", " ") : "Free"}
							</dd>
						</div>
						{periodEnd ? (
							<div className="flex flex-col gap-0.5 sm:col-span-2">
								<dt className="text-xs text-muted-foreground">Renews / ends</dt>
								<dd className="font-medium">
									{new Date(periodEnd).toLocaleDateString(undefined, {
										year: "numeric",
										month: "short",
										day: "numeric",
									})}
								</dd>
							</div>
						) : null}
					</dl>

					<Button asChild className="shrink-0">
						<a href="/#pricing" target="_blank" rel="noreferrer">
							Upgrade or downgrade
							<ArrowUpRight className="size-3.5" aria-hidden />
						</a>
					</Button>
				</div>
			</SettingsSection>
		</div>
	);
}
