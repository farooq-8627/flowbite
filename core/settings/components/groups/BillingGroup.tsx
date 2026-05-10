"use client";

import { ExternalLink } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import type { OrgSettings } from "../../types";

import { SettingsSection } from "../shared/SettingsSection";
import { SettingsRow } from "../shared/SettingsRow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

// Plan limits — swap with real billing-plan data when the billing backend is wired.
const PLAN_LIMITS: Record<
	string,
	{ members: number; aiMessages: number; pipelines: number; fields: number }
> = {
	free:     { members: 3,  aiMessages: 100,    pipelines: 1,  fields: 5   },
	starter:  { members: 10, aiMessages: 500,    pipelines: 3,  fields: 20  },
	pro:      { members: 25, aiMessages: 2_000,  pipelines: 10, fields: 100 },
	business: { members: 100, aiMessages: 10_000, pipelines: 50, fields: 500 },
};

function UsageBar({
	label,
	description,
	used,
	limit,
}: {
	label: string;
	description?: string;
	used: number;
	limit: number;
}) {
	const percent = Math.min(100, (used / limit) * 100);
	return (
		<SettingsRow label={label} description={description}>
			<div className="flex flex-col gap-1.5">
				<div className="flex items-center justify-end gap-2">
					<span className="text-sm font-medium tabular-nums">{used.toLocaleString()}</span>
					<span className="text-sm text-muted-foreground">/ {limit.toLocaleString()}</span>
				</div>
				<Progress value={percent} />
			</div>
		</SettingsRow>
	);
}

export function BillingGroup({
	org,
	// orgId kept for future billing calls
	orgId: _orgId,
}: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const limits = PLAN_LIMITS[org.plan] ?? PLAN_LIMITS.free;

	return (
		<div className="grid gap-6">
			<SettingsSection
				id="billing.plan"
				title="Current Plan"
				description="Your workspace is billed on the plan below."
				action={
					<div className="flex items-center gap-2">
						<Badge className="capitalize">{org.plan}</Badge>
						<Button variant="outline" size="sm" disabled>
							Change plan
							<ExternalLink className="size-3.5" />
						</Button>
					</div>
				}
			>
				<SettingsRow
					label="Plan includes"
					description="Limits reset at the start of each billing cycle."
				>
					<span className="text-sm text-muted-foreground">
						{limits.members} members · {limits.aiMessages.toLocaleString()} AI msgs · {limits.pipelines} pipelines
					</span>
				</SettingsRow>
				<SettingsRow
					label="Billing contact"
					description="Who receives invoices and billing emails."
				>
					<span className="text-sm text-muted-foreground">Configured in LemonSqueezy.</span>
				</SettingsRow>
			</SettingsSection>

			<SettingsSection
				id="billing.usage"
				title="Usage"
				description="Real-time usage against your plan limits."
			>
				<UsageBar label="AI messages" used={0} limit={limits.aiMessages} />
				<UsageBar label="Team members" used={0} limit={limits.members} />
				<UsageBar label="Pipelines" used={0} limit={limits.pipelines} />
				<UsageBar label="Custom fields" used={0} limit={limits.fields} />
			</SettingsSection>

			<SettingsSection
				id="billing.invoices"
				title="Invoices"
				description="Payment history is managed by LemonSqueezy."
				action={
					<Button variant="outline" size="sm" disabled>
						Open portal
						<ExternalLink className="size-3.5" />
					</Button>
				}
			>
				<div className="py-6 text-center text-sm text-muted-foreground">
					Invoice history will appear here once payments are processed.
				</div>
			</SettingsSection>
		</div>
	);
}
