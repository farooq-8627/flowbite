"use client";

/**
 * Owner-panel billing-settings view (Stage 6 — read-only v1).
 *
 * Surfaces which billing env vars are configured (present/missing only —
 * NEVER the values). Editing happens via the Convex dashboard env vars
 * directly. The full billing-settings editor is Tier B in
 * `Future-Enhancements.md` (deferred).
 *
 * Spec: PLATFORM-OWNER-PANEL.md §5 row 4, §10 stage 6.
 */
import { useQuery } from "convex/react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { OwnerSettingsCard } from "../../components/OwnerSettingsCard";

export function BillingSettingsView() {
	const config = useQuery(api._platform.billing.queries.getProviderConfig, {});

	return (
		<div className="flex flex-col gap-4">
			<OwnerSettingsCard
				title="Billing providers — env mask"
				description="Read-only summary of which env vars are configured. Set them in the Convex dashboard. Editing from this panel is Tier B."
			>
				{config === undefined ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" /> Reading env…
					</div>
				) : (
					<div className="space-y-5">
						<ProviderBlock title="LemonSqueezy" rows={config.lemonSqueezy} />
						<ProviderBlock title="Razorpay" rows={config.razorpay} />
						<ProviderBlock title="Email (Resend)" rows={config.email} />
					</div>
				)}
			</OwnerSettingsCard>

			<OwnerSettingsCard
				title="Default trial settings"
				description="Trial-day defaults live on each platformTier row. Edit them in the Tiers section."
			>
				<p className="text-xs text-muted-foreground">
					Per-tier `trialDays` is the source of truth. Adjust it on the relevant tier
					card; new orgs created on that plan inherit the value automatically.
				</p>
			</OwnerSettingsCard>
		</div>
	);
}

function ProviderBlock({
	title,
	rows,
}: {
	title: string;
	rows: ReadonlyArray<{ key: string; present: boolean }>;
}) {
	const allPresent = rows.every((r) => r.present);
	return (
		<div>
			<div className="mb-2 flex items-center gap-2">
				<h3 className="text-sm font-semibold">{title}</h3>
				{allPresent ? (
					<span className="rounded-[var(--radius)] bg-green-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-green-700 dark:text-green-400">
						configured
					</span>
				) : (
					<span className="rounded-[var(--radius)] bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-700 dark:text-amber-400">
						missing values
					</span>
				)}
			</div>
			<ul className="space-y-1">
				{rows.map((r) => (
					<li
						key={r.key}
						className="flex items-center justify-between gap-2 rounded-[var(--radius)] border border-border/60 px-3 py-1.5 text-xs"
					>
						<code className="font-mono">{r.key}</code>
						{r.present ? (
							<span className="flex items-center gap-1 text-green-700 dark:text-green-400">
								<CheckCircle2 className="h-3 w-3" /> set
							</span>
						) : (
							<span className="flex items-center gap-1 text-muted-foreground">
								<XCircle className="h-3 w-3" /> unset
							</span>
						)}
					</li>
				))}
			</ul>
		</div>
	);
}
