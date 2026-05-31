"use client";

import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PricingCard } from "@/core/billing/components/PricingCard";
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
 * In-app billing settings — compact upgrade/downgrade surface.
 *
 * Trimmed (2026-05-31) to just what a customer needs: their current plan +
 * status, and the plan picker to switch. Plans + prices come from the
 * platform-owner-managed `listPublicTiers` (same SSOT as the marketing
 * landing). Each <PricingCard mode="upgrade" /> drives a LemonSqueezy
 * checkout / change.
 */
export function BillingGroup({ org: _org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const plan = useQuery(api.billing.queries.getCurrentPlan, { orgId });
	const tiers = useQuery(api._platform.tiers.queries.listPublicTiers, {});
	const [cadence, setCadence] = useState<"monthly" | "yearly">("monthly");

	if (!plan || !tiers) {
		return (
			<SettingsSection id="billing.plan" title="Plan & billing" description="Loading…">
				<div className="py-6 text-center text-muted-foreground text-sm">
					<Loader2 className="mx-auto size-4 animate-spin" />
				</div>
			</SettingsSection>
		);
	}

	const periodEnd = plan.lemonSqueezy.currentPeriodEnd;

	return (
		<div className="grid gap-6">
			<TrialBanner orgId={orgId} />

			<SettingsSection
				id="billing.plan"
				title="Plan & billing"
				description={
					periodEnd
						? `Current period ends ${new Date(periodEnd).toLocaleDateString(undefined, {
								year: "numeric",
								month: "short",
								day: "numeric",
							})}. Switch any time — your data comes with you.`
						: "Pick the plan that fits your team. Switch any time — your data comes with you."
				}
				action={
					<div className="flex items-center gap-2">
						<Badge className="capitalize">{plan.planLabel}</Badge>
						<StatusBadge status={plan.lemonSqueezy.status} />
					</div>
				}
			>
				<div className="flex items-center justify-end gap-2 pb-2 text-xs">
					<span
						className={cadence === "monthly" ? "font-medium" : "text-muted-foreground"}
					>
						Monthly
					</span>
					<Switch
						checked={cadence === "yearly"}
						onCheckedChange={(v) => setCadence(v ? "yearly" : "monthly")}
						aria-label="Toggle billing cadence"
					/>
					<span
						className={cadence === "yearly" ? "font-medium" : "text-muted-foreground"}
					>
						Yearly{" "}
						<span className="text-[10px] text-muted-foreground">(save ~17%)</span>
					</span>
				</div>
				<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
					{tiers.map((tier) => (
						<PricingCard
							key={tier.key}
							tier={tier}
							cadence={cadence}
							mode="upgrade"
							orgId={orgId}
							currentTierKey={plan.plan}
						/>
					))}
				</div>
			</SettingsSection>
		</div>
	);
}
