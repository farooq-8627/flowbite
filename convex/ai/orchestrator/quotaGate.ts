"use node";
/**
 * convex/ai/orchestrator/quotaGate.ts
 *
 * Reads the org's monthly AI usage from telemetry rollups and compares
 * against the plan's `aiTokensPerMonth` + `aiMessageCreditsPerMonth`
 * limits. Whichever exhausts first blocks the next turn.
 *
 * 2026-05-24 update — BYOK is unconditionally unlimited regardless of
 * plan. The previous policy blocked the free tier outright at the
 * quota gate (which fired BEFORE model resolution, so it had no idea
 * whether the user was bringing their own key). The new policy:
 *
 *   • BYOK (`usageMode === "byok"`) → always allowed. The user is
 *     paying the model bill directly; we don't meter their usage.
 *   • Platform model on free tier → BLOCKED with a clear "add BYOK or
 *     upgrade" message. Platform models cost us money so we don't
 *     give them away on free.
 *   • Platform model on metered tier (starter / pro) → checked against
 *     the plan's `aiTokensPerMonth` AND `aiMessageCreditsPerMonth` cap.
 *   • Platform model on enterprise → unmetered.
 *
 * 2026-05-27 P0.1.1 update — trial + 3-day past_due grace.
 *
 *   • Status `on_trial` → treat as if the plan were active (no quota
 *     hard-block at the entry gate; quotas still apply numerically).
 *   • Status `past_due` within 3 days of `currentPeriodEnd` → grace
 *     period; treat as active. Beyond 3 days → fall back to
 *     free-tier behaviour (block platform, BYOK still works).
 *   • Status `cancelled` / `expired` / `unpaid` → treat as free tier
 *     (the plan field on `orgs` will lag, so we explicitly downgrade
 *     here at the gate to avoid a window where the user hits a
 *     premium-tier quota but their billing is dead).
 *   • Status `paused` → treat as free tier (paused = paying customer
 *     who's pressed pause; they can BYOK their way through, no platform
 *     spend).
 *
 * 2026-05-27 P0.2.E update — limits include `aiMessageCreditsPerMonth`.
 * Both metrics are checked: token cap AND message cap. Whichever
 * exhausts first wins.
 *
 * Returns `{ allowed: false, message }` when the org has exhausted
 * its quota; otherwise `{ allowed: true }`. The caller is responsible
 * for surfacing the friendly message to the user.
 *
 * Cost: zero queries on BYOK. One indexed query against
 * `aiToolEvents.by_org_and_started` + one against
 * `aiMessages.by_org_role_created` for metered tiers — both scoped to
 * the current calendar month.
 *
 * 2026-05-27 update — limits are now fetched DB-first via the
 * internal query `_platform.tiers.queries.getLimitsInternal`. This
 * runtime is `"use node"` (action) so it has no `ctx.db` access; the
 * caller's `ctx.runQuery` makes the indexed read for us. Owner-panel
 * tier edits take effect immediately on the next chat turn.
 */

import type { Id } from "../../_generated/dataModel";
import type { PlanLimits, PlanTier } from "../../_platform/limits";

// biome-ignore lint/suspicious/noExplicitAny: pre-codegen cross-module ref
const _ref = (path: string) => path as any;

type RunQueryFn = (fn: unknown, args: unknown) => Promise<unknown>;

export type QuotaCheckResult = { allowed: true } | { allowed: false; message: string };

/** Three-day grace window for `past_due` subscriptions. */
const PAST_DUE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Resolve the *effective* plan tier for quota purposes. Honours trial +
 * past_due grace + cancellation lag. Returns the tier the gate should
 * meter against, NOT the tier on `orgs.plan` (which can lag the
 * subscription status during webhook-replay windows).
 */
function resolveEffectivePlan(args: {
	plan: PlanTier;
	subscriptionStatus?: string;
	currentPeriodEnd?: number;
}): { plan: PlanTier; reason: "active" | "trial" | "grace" | "downgraded" } {
	const status = args.subscriptionStatus;

	// No subscription metadata → use the plan field as-is.
	if (!status) return { plan: args.plan, reason: "active" };

	if (status === "active") return { plan: args.plan, reason: "active" };
	if (status === "on_trial") return { plan: args.plan, reason: "trial" };

	if (status === "past_due") {
		const periodEnd = args.currentPeriodEnd ?? 0;
		const withinGrace = periodEnd > 0 && Date.now() - periodEnd < PAST_DUE_GRACE_MS;
		if (withinGrace) return { plan: args.plan, reason: "grace" };
		// Past 3-day grace — downgrade to free.
		return { plan: "free", reason: "downgraded" };
	}

	// cancelled / expired / unpaid / paused — treat as free for quota
	// purposes (the user can still BYOK their way through; platform
	// models hard-block as if they were on free).
	return { plan: "free", reason: "downgraded" };
}

export async function checkAiQuota(args: {
	ctx: { runQuery: RunQueryFn };
	orgId: Id<"orgs">;
	plan: PlanTier;
	usageMode: "platform" | "byok";
	subscriptionStatus?: string;
	currentPeriodEnd?: number;
}): Promise<QuotaCheckResult> {
	// BYOK — user pays the model bill, we don't meter. Skip every gate.
	if (args.usageMode === "byok") return { allowed: true };

	// Resolve the effective plan against subscription status (trial /
	// past_due grace / cancelled lag / paused).
	const { plan: effectivePlan, reason } = resolveEffectivePlan(args);

	// DB-authoritative limits. Owner-panel edits to `platformTiers`
	// land here on the next call without a redeploy.
	const limits = (await args.ctx.runQuery(_ref("_platform/tiers/queries:getLimitsInternal"), {
		tier: effectivePlan,
	})) as PlanLimits;

	// Free tier on a platform model — blocked. Tell the user the two
	// ways forward: add a BYOK key (instant unblock) or upgrade.
	if (limits.aiTokensPerMonth === 0) {
		const downgradeNote =
			reason === "downgraded"
				? "\n\nYour subscription is `" +
					(args.subscriptionStatus ?? "inactive") +
					"`. Reactivate it under **Settings → Billing** to restore platform AI access."
				: "";
		return {
			allowed: false,
			message:
				"❌ **Platform AI models aren't available on the Free plan.**\n\nYou have two options:\n\n• **Bring your own key** — add an Anthropic / OpenAI / Google / Groq / Moonshot key under **Settings → AI**. BYOK is unmetered on every plan, including Free.\n• **Upgrade** — Starter (100K tokens/mo), Pro (1M tokens/mo), or Enterprise (unlimited) under **Settings → Billing**." +
				downgradeNote,
		};
	}

	// Unlimited tier (enterprise).
	if (limits.aiTokensPerMonth === -1 && limits.aiMessageCreditsPerMonth === -1) {
		return { allowed: true };
	}

	// Metered tier — check token cap first (cheaper read).
	if (limits.aiTokensPerMonth > 0) {
		const usage = (await args.ctx.runQuery(_ref("ai/telemetry:sumTokensThisMonth"), {
			orgId: args.orgId,
		})) as { totalTokens: number };

		if (usage.totalTokens >= limits.aiTokensPerMonth) {
			return {
				allowed: false,
				message: `❌ **You've used your monthly AI token quota.**\n\nThis workspace is on the **${effectivePlan}** plan, which includes **${limits.aiTokensPerMonth.toLocaleString()} tokens/month** (currently ${usage.totalTokens.toLocaleString()} used).\n\nTo continue using AI:\n• Wait until the next billing cycle, OR\n• Upgrade your plan in **Settings → Billing**, OR\n• Add your own API key in **Settings → AI** (BYOK is unmetered on every plan).`,
			};
		}
	}

	// Then check the message-credit cap (P0.2.E pricing-ladder pool).
	if (limits.aiMessageCreditsPerMonth > 0) {
		const messages = (await args.ctx.runQuery(_ref("ai/telemetry:sumMessagesThisMonth"), {
			orgId: args.orgId,
		})) as { messageCount: number };

		if (messages.messageCount >= limits.aiMessageCreditsPerMonth) {
			return {
				allowed: false,
				message: `❌ **You've used your monthly AI message credits.**\n\nThis workspace is on the **${effectivePlan}** plan, which includes **${limits.aiMessageCreditsPerMonth.toLocaleString()} messages/month** (currently ${messages.messageCount.toLocaleString()} used).\n\nTo continue:\n• Wait until the next billing cycle, OR\n• Upgrade your plan in **Settings → Billing**, OR\n• Add your own API key in **Settings → AI** (BYOK is unmetered).`,
			};
		}
	}

	return { allowed: true };
}
