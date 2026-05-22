"use client";

import { useAction, useQuery } from "convex/react";
import { ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "@/lib/toast";
import type { OrgSettings } from "../../types";
import { SettingsRow } from "../shared/SettingsRow";
import { SettingsSection } from "../shared/SettingsSection";

/**
 * Variant ids exposed to the upgrade buttons. These are environment-
 * specific — set them in your `.env.local` (and Convex dashboard for
 * `LEMONSQUEEZY_VARIANT_*`). The webhook handler maps each variant id
 * to a plan tier; if a variant isn't set, the corresponding upgrade
 * button is hidden.
 */
const UPGRADE_VARIANTS: Array<{ tier: "starter" | "pro" | "enterprise"; envKey: string }> = [
	{ tier: "starter", envKey: "NEXT_PUBLIC_LEMONSQUEEZY_VARIANT_STARTER" },
	{ tier: "pro", envKey: "NEXT_PUBLIC_LEMONSQUEEZY_VARIANT_PRO" },
	{ tier: "enterprise", envKey: "NEXT_PUBLIC_LEMONSQUEEZY_VARIANT_ENTERPRISE" },
];

function getVariantId(envKey: string): string | undefined {
	// Next.js inlines NEXT_PUBLIC_* at build time; we read from process.env
	// directly so missing keys are simply undefined.
	const env = process.env as Record<string, string | undefined>;
	const value = env[envKey];
	return value && value.length > 0 ? value : undefined;
}

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

function UsageBar({
	label,
	used,
	limit,
}: {
	label: string;
	used: number;
	limit: number;
}) {
	const percent =
		limit === -1 ? 0 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
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

export function BillingGroup({
	org: _org,
	orgId,
}: {
	org: OrgSettings;
	orgId: Id<"orgs">;
}) {
	const plan = useQuery(api.billing.queries.getCurrentPlan, { orgId });
	const checkout = useAction(api.billing.actions.createCheckoutUrl);
	const [busyTier, setBusyTier] = useState<string | null>(null);

	const handleUpgrade = async (tier: string, variantId: string) => {
		setBusyTier(tier);
		try {
			const r = await checkout({ orgId, variantId });
			window.location.href = r.url;
		} catch (err) {
			toast.mutationError(err, "Could not start checkout.");
			setBusyTier(null);
		}
	};

	if (!plan) {
		return (
			<div className="grid gap-6">
				<SettingsSection
					id="billing.plan"
					title="Current Plan"
					description="Loading…"
				>
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
					<SettingsRow
						label="Current period ends"
						controlClassName="sm:min-w-auto"
					>
						<span className="text-sm text-muted-foreground">
							{new Date(periodEnd).toLocaleDateString(undefined, {
								year: "numeric",
								month: "short",
								day: "numeric",
							})}
						</span>
					</SettingsRow>
				)}

				<div className="mt-2 flex flex-wrap gap-2 border-t pt-4">
					{UPGRADE_VARIANTS.filter(({ tier }) => tier !== plan.plan).map(
						({ tier, envKey }) => {
							const variantId = getVariantId(envKey);
							if (!variantId) return null;
							return (
								<Button
									key={tier}
									variant="outline"
									size="sm"
									disabled={busyTier !== null}
									onClick={() => handleUpgrade(tier, variantId)}
								>
									{busyTier === tier ? (
										<Loader2 className="size-3.5 animate-spin" />
									) : (
										<ExternalLink className="size-3.5" />
									)}
									{tier === "enterprise"
										? "Switch to Enterprise"
										: `Upgrade to ${tier[0]?.toUpperCase()}${tier.slice(1)}`}
								</Button>
							);
						},
					)}
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
				<UsageBar
					label="Custom fields per entity"
					used={0}
					limit={plan.limits.maxCustomFieldsPerEntityType}
				/>
				<UsageBar label="AI tokens / mo" used={0} limit={plan.limits.aiTokensPerMonth} />
			</SettingsSection>

			<SettingsSection
				id="billing.invoices"
				title="Invoices"
				description="Payment history is managed by LemonSqueezy."
				action={
					<Button variant="outline" size="sm" disabled={!plan.lemonSqueezy.customerId}>
						Open portal
						<ExternalLink className="size-3.5" />
					</Button>
				}
			>
				<div className="py-6 text-center text-sm text-muted-foreground">
					{plan.lemonSqueezy.customerId
						? "Use 'Open portal' to view past invoices."
						: "No billing history yet — upgrade to a paid plan to see invoices here."}
				</div>
			</SettingsSection>
		</div>
	);
}
