"use client";

import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PricingCard } from "@/core/billing/components/PricingCard";
import { TrialBanner } from "@/core/billing/components/TrialBanner";
import type { OrgSettings } from "../../types";
import { SettingsRow } from "../shared/SettingsRow";
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

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
	const percent = limit === -1 ? 0 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
	return (
		<SettingsRow label={label}>
			<div className="flex flex-col gap-1.5">
				<div className="flex items-center justify-end gap-2">
					<span className="text-sm font-medium tabular-nums">
						{used.toLocaleString()}
					</span>
					<span className="text-sm text-muted-foreground">
						/ {limit === -1 ? "Unlimited" : limit.toLocaleString()}
					</span>
				</div>
				{limit !== -1 && <Progress value={percent} />}
			</div>
		</SettingsRow>
	);
}

/**
 * In-app billing settings — Phase 3A + 2026-05-27 P0.1 / P0.2 wave.
 *
 * Layout:
 *   - TrialBanner (only renders when status ≠ active)
 *   - "Current Plan" card with status badge + period end + usage bars
 *   - "Choose plan" card containing one <PricingCard /> per tier from
 *     the public `listPublicTiers` query (DB-backed via owner panel).
 *   - Invoices link to LemonSqueezy customer portal when configured.
 *
 * The PricingCard component is the SAME one the marketing /pricing
 * page renders — owner-panel edits to display name, description,
 * features, prices, or LemonSqueezy variant ids propagate everywhere.
 */
export function BillingGroup({ org: _org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const plan = useQuery(api.billing.queries.getCurrentPlan, { orgId });
	const tiers = useQuery(api._platform.tiers.queries.listPublicTiers, {});
	const usage = useQuery(api.ai.queries.telemetry.getOrgUsage, { orgId, range: "30d" });
	const [cadence, setCadence] = useState<"monthly" | "yearly">("monthly");

	if (!plan || !tiers) {
		return (
			<div className="grid gap-6">
				<SettingsSection id="billing.plan" title="Current Plan" description="Loading…">
					<div className="py-6 text-center text-sm text-muted-foreground">
						<Loader2 className="mx-auto size-4 animate-spin" />
					</div>
				</SettingsSection>
			</div>
		);
	}

	const periodEnd = plan.lemonSqueezy.currentPeriodEnd;

	return (
		<div className="grid gap-6">
			<TrialBanner orgId={orgId} />

			<SettingsSection
				id="billing.plan"
				title="Current Plan"
				description="Your workspace is billed on the plan below."
				action={
					<div className="flex items-center gap-2">
						<Badge className="capitalize">{plan.planLabel}</Badge>
						<StatusBadge status={plan.lemonSqueezy.status} />
					</div>
				}
			>
				<SettingsRow
					label="Plan includes"
					description="Limits reset at the start of each billing cycle."
					controlClassName="sm:min-w-auto"
				>
					<span className="text-sm text-muted-foreground">
						{plan.limits.maxMembers === -1
							? "Unlimited members"
							: `${plan.limits.maxMembers} members`}{" "}
						·{" "}
						{plan.limits.aiTokensPerMonth === -1
							? "Unlimited AI"
							: `${plan.limits.aiTokensPerMonth.toLocaleString()} AI tokens`}{" "}
						·{" "}
						{plan.limits.maxPipelinesPerEntityType === -1
							? "Unlimited pipelines"
							: `${plan.limits.maxPipelinesPerEntityType} pipelines`}
					</span>
				</SettingsRow>
				{periodEnd && (
					<SettingsRow label="Current period ends" controlClassName="sm:min-w-auto">
						<span className="text-sm text-muted-foreground">
							{new Date(periodEnd).toLocaleDateString(undefined, {
								year: "numeric",
								month: "short",
								day: "numeric",
							})}
						</span>
					</SettingsRow>
				)}
			</SettingsSection>

			<SettingsSection
				id="billing.choose"
				title="Choose a plan"
				description="Limits, copy, and pricing are managed in the platform owner panel — what you see here is what every visitor sees on the marketing site."
				action={
					<div className="flex items-center gap-2 text-xs">
						<span
							className={
								cadence === "monthly" ? "font-medium" : "text-muted-foreground"
							}
						>
							Monthly
						</span>
						<Switch
							checked={cadence === "yearly"}
							onCheckedChange={(v) => setCadence(v ? "yearly" : "monthly")}
							aria-label="Toggle billing cadence"
						/>
						<span
							className={
								cadence === "yearly" ? "font-medium" : "text-muted-foreground"
							}
						>
							Yearly{" "}
							<span className="text-[10px] text-muted-foreground">(save ~17%)</span>
						</span>
					</div>
				}
			>
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

			<SettingsSection
				id="billing.usage"
				title="Plan limits"
				description="What this plan includes — usage tracking ships with the AI runtime."
			>
				<UsageBar label="Team members" used={0} limit={plan.limits.maxMembers} />
				<UsageBar
					label="Pipelines per entity"
					used={0}
					limit={plan.limits.maxPipelinesPerEntityType}
				/>
				<UsageBar label="Deals" used={0} limit={plan.limits.maxDeals} />
				<UsageBar label="Leads" used={0} limit={plan.limits.maxLeads} />
				<UsageBar
					label="Custom fields per entity"
					used={0}
					limit={plan.limits.maxCustomFieldsPerEntityType}
				/>
				<UsageBar
					label="AI tokens / mo"
					used={usage?.usedThisMonth.totalTokens ?? 0}
					limit={plan.limits.aiTokensPerMonth}
				/>
				<UsageBar
					label="AI message credits / mo"
					used={0}
					limit={plan.limits.aiMessageCreditsPerMonth}
				/>
			</SettingsSection>
		</div>
	);
}
