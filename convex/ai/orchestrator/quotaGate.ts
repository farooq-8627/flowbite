"use node";
/**
 * convex/ai/orchestrator/quotaGate.ts
 *
 * Reads the org's monthly AI token usage from `aiToolEvents` and
 * compares it against the plan's `aiTokensPerMonth` limit.
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
 *     the plan's `aiTokensPerMonth` cap.
 *   • Platform model on enterprise → unmetered.
 *
 * Returns `{ allowed: false, message }` when the org has exhausted
 * its quota; otherwise `{ allowed: true }`. The caller is responsible
 * for surfacing the friendly message to the user.
 *
 * Cost: zero queries on BYOK or hard-blocked free; one indexed query
 * against `aiToolEvents.by_org_and_started` scoped to the current
 * calendar month for metered tiers.
 */

import type { Id } from "../../_generated/dataModel";
import { getPlanLimits, type PlanTier } from "../../_platform/limits";

// biome-ignore lint/suspicious/noExplicitAny: pre-codegen cross-module ref
const _ref = (path: string) => path as any;

type RunQueryFn = (fn: unknown, args: unknown) => Promise<unknown>;

export type QuotaCheckResult = { allowed: true } | { allowed: false; message: string };

export async function checkAiQuota(args: {
	ctx: { runQuery: RunQueryFn };
	orgId: Id<"orgs">;
	plan: PlanTier;
	usageMode: "platform" | "byok";
}): Promise<QuotaCheckResult> {
	// BYOK — user pays the model bill, we don't meter. Skip every gate.
	if (args.usageMode === "byok") return { allowed: true };

	const limits = getPlanLimits(args.plan);

	// Free tier on a platform model — blocked. Tell the user the two
	// ways forward: add a BYOK key (instant unblock) or upgrade.
	if (limits.aiTokensPerMonth === 0) {
		return {
			allowed: false,
			message:
				"❌ **Platform AI models aren't available on the Free plan.**\n\nYou have two options:\n\n• **Bring your own key** — add an Anthropic / OpenAI / Google / Groq / Moonshot key under **Settings → AI**. BYOK is unmetered on every plan, including Free.\n• **Upgrade** — Starter (100K tokens/mo), Pro (1M tokens/mo), or Enterprise (unlimited) under **Settings → Billing**.",
		};
	}

	// Unlimited tier (enterprise).
	if (limits.aiTokensPerMonth === -1) return { allowed: true };

	// Metered tier — read the month-to-date totals from telemetry.
	const usage = (await args.ctx.runQuery(_ref("ai/telemetry:sumTokensThisMonth"), {
		orgId: args.orgId,
	})) as { totalTokens: number };

	if (usage.totalTokens >= limits.aiTokensPerMonth) {
		return {
			allowed: false,
			message: `❌ **You've used your monthly AI quota.**\n\nThis workspace is on the **${args.plan}** plan, which includes **${limits.aiTokensPerMonth.toLocaleString()} tokens/month** (currently ${usage.totalTokens.toLocaleString()} used).\n\nTo continue using AI:\n• Wait until the next billing cycle, OR\n• Upgrade your plan in **Settings → Billing**, OR\n• Add your own API key in **Settings → AI** (BYOK is unmetered on every plan).`,
		};
	}

	return { allowed: true };
}
