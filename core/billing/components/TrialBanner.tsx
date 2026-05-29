"use client";

/**
 * Trial / past-due banner — surfaces the workspace's subscription state
 * to admins on the dashboard + billing page so trials don't lapse silently.
 *
 * Reads `api.billing.queries.getCurrentPlan` for the org's
 * LemonSqueezy status + period end.
 *
 * Rendered states:
 *   - `on_trial` → blue info pill: "X days left in your <plan> trial."
 *   - `past_due` within 3 days of period end → amber: "Payment failed.
 *     Update your card to keep <plan> running. <Y> days of grace left."
 *   - `past_due` past grace window → red: "Trial / subscription lapsed.
 *     The workspace has dropped to Free until you reactivate."
 *   - `cancelled` → grey: "<plan> ends on <date>. Reactivate to keep it."
 *
 * Hidden when status is `active` / `undefined` / unknown — no banner
 * spam during steady-state.
 *
 * Props mirror `BillingGroup`'s wiring so this can also be mounted in a
 * dashboard slot (e.g. above the AI quick-composer card) without a
 * second query subscription.
 */

import { useQuery } from "convex/react";
import { AlertTriangle, ExternalLink, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;
const PAST_DUE_GRACE_MS = 3 * DAY_MS;

function daysUntil(timestamp: number, now = Date.now()): number {
	return Math.max(0, Math.ceil((timestamp - now) / DAY_MS));
}

function daysSince(timestamp: number, now = Date.now()): number {
	return Math.max(0, Math.ceil((now - timestamp) / DAY_MS));
}

export type TrialBannerProps = {
	orgId: Id<"orgs">;
	/**
	 * Optional click handler for the "Manage billing" CTA. When omitted,
	 * the CTA navigates to `/settings?group=billing` in the same window.
	 */
	onManageClick?: () => void;
	className?: string;
};

export function TrialBanner({ orgId, onManageClick, className }: TrialBannerProps) {
	const plan = useQuery(api.billing.queries.getCurrentPlan, { orgId });
	if (!plan) return null;

	const status = plan.lemonSqueezy.status;
	const periodEnd = plan.lemonSqueezy.currentPeriodEnd;

	if (!status || status === "active" || status === "unpaid") return null;

	let tone: "info" | "warning" | "danger" = "info";
	let icon: React.ReactNode = <Sparkles className="size-4" aria-hidden />;
	let title = "";
	let body = "";

	if (status === "on_trial") {
		const days = periodEnd ? daysUntil(periodEnd) : null;
		tone = "info";
		title =
			days != null ? `${days} day${days === 1 ? "" : "s"} left in your trial` : "On trial";
		body = `Your workspace is on a ${plan.planLabel} trial. Add a payment method anytime to keep it after the trial.`;
	} else if (status === "past_due") {
		const daysIntoPastDue = periodEnd ? daysSince(periodEnd) : 0;
		const withinGrace = periodEnd && Date.now() - periodEnd < PAST_DUE_GRACE_MS;
		const graceLeft = Math.max(
			0,
			Math.ceil((PAST_DUE_GRACE_MS - daysIntoPastDue * DAY_MS) / DAY_MS),
		);
		if (withinGrace) {
			tone = "warning";
			icon = <AlertTriangle className="size-4" aria-hidden />;
			title = "Payment failed — update your card";
			body = `Your last payment didn't go through. We're keeping ${plan.planLabel} running for ${graceLeft} more day${graceLeft === 1 ? "" : "s"} as a courtesy. Update your billing details to avoid downgrade.`;
		} else {
			tone = "danger";
			icon = <AlertTriangle className="size-4" aria-hidden />;
			title = "Subscription lapsed";
			body = `Payment has been past-due for over 3 days. Platform AI access has been suspended; reactivate to restore.`;
		}
	} else if (status === "cancelled") {
		const days = periodEnd ? daysUntil(periodEnd) : null;
		tone = "warning";
		icon = <AlertTriangle className="size-4" aria-hidden />;
		title =
			days != null
				? `${plan.planLabel} ends in ${days} day${days === 1 ? "" : "s"}`
				: `${plan.planLabel} cancelled`;
		body =
			"You've cancelled your subscription. Reactivate before the period ends to avoid downgrade.";
	} else if (status === "expired") {
		tone = "danger";
		icon = <AlertTriangle className="size-4" aria-hidden />;
		title = "Subscription expired";
		body =
			"Your workspace has been moved to the Free plan. Resubscribe to restore platform AI access.";
	} else if (status === "paused") {
		tone = "warning";
		icon = <AlertTriangle className="size-4" aria-hidden />;
		title = "Subscription paused";
		body =
			"Platform AI access is paused. Resume your subscription to continue, or use BYOK while paused.";
	}

	const handleClick = () => {
		if (onManageClick) {
			onManageClick();
			return;
		}
		window.location.href = "/settings?group=billing";
	};

	const toneClasses =
		tone === "info"
			? "border-primary/40 bg-primary/5 text-foreground"
			: tone === "warning"
				? "border-amber-500/40 bg-amber-500/5 text-amber-900 dark:text-amber-200"
				: "border-destructive/40 bg-destructive/5 text-destructive";

	return (
		<div
			role="status"
			aria-live="polite"
			className={cn(
				"flex flex-col gap-3 rounded-[var(--radius)] border p-4 sm:flex-row sm:items-center sm:justify-between",
				toneClasses,
				className,
			)}
		>
			<div className="flex items-start gap-3">
				<span className="mt-0.5 shrink-0">{icon}</span>
				<div className="space-y-1">
					<p className="text-sm font-medium">{title}</p>
					<p className="text-xs opacity-80">{body}</p>
				</div>
			</div>
			<Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={handleClick}>
				Manage billing
				<ExternalLink className="size-3.5" aria-hidden />
			</Button>
		</div>
	);
}
