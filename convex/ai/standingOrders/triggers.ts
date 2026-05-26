/**
 * convex/ai/standingOrders/triggers.ts
 *
 * Stage 8 of /SPRINT-PLAN.md (Autonomous layer). Auto-action helpers
 * called from CRM mutations to fire autonomous follow-ups / enrichments
 * when the per-user `aiAutonomy` toggle is on.
 *
 * Each trigger:
 *   1. Reads the owner's `users.preferences.aiAutonomy.<key>` flag —
 *      DEFAULT FALSE. If false, no-op + no audit row.
 *   2. Schedules the underlying ForAI mutation via `ctx.scheduler.runAfter(0, ...)`.
 *   3. Records an `aiToolEvents` row with `triggeredBy: "automation:<key>"`
 *      so the AI changelog + telemetry attribute the action correctly.
 *
 * These helpers are pure side-effects fired from inside other public
 * mutations; they share the public mutation's transaction. Failure to
 * read a preference is treated as "off" so we never block the original
 * mutation.
 */

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalAction, type MutationCtx } from "../../_generated/server";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * After a deal moves to a new stage, fire an auto-followup if:
 *   - the destination stage has `onEnter.autoFollowupTemplate` set, AND
 *   - the deal's owner has flipped `users.preferences.aiAutonomy.autoFollowupOnStageMove`.
 *
 * The follow-up is created via `internal.crm.shared.reminders.mutations.createForAI`
 * with `source: "system"` and the templated body. Audit row records
 * `triggeredBy: "automation:onStageMove"`.
 */
export async function maybeFireAutoFollowupOnStageMove(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		dealId: Id<"deals">;
		deal: Doc<"deals">;
		toStage: {
			id: string;
			name: string;
			onEnter?: { autoFollowupTemplate?: string; autoFollowupAfterDays?: number };
		};
	},
): Promise<void> {
	const templateRaw = args.toStage.onEnter?.autoFollowupTemplate;
	if (typeof templateRaw !== "string") return;
	const template = templateRaw.trim();
	if (template.length === 0) return;

	const ownerUserId = args.deal.assignedTo;
	if (!ownerUserId) return;
	// `reminders.create*` requires a `personCode`. Deals can exist without
	// one (deal-only workflows); in that case there's no person to attach
	// a follow-up to, so skip cleanly. Auto-followups for deal-only stages
	// are tracked in Future-Enhancements.md.
	const personCode = args.deal.personCode;
	if (typeof personCode !== "string" || personCode.length === 0) return;
	const owner = await ctx.db.get(ownerUserId);
	if (!owner || owner.deletedAt !== undefined) return;
	const flag = owner.preferences?.aiAutonomy?.autoFollowupOnStageMove === true;
	if (!flag) return;

	const offsetDays = Math.max(1, args.toStage.onEnter?.autoFollowupAfterDays ?? 3);
	const dueAt = Date.now() + offsetDays * DAY_MS;
	const title = template.includes("{stage}")
		? template.replaceAll("{stage}", args.toStage.name)
		: template;

	await ctx.scheduler.runAfter(0, internal.crm.shared.reminders.mutations.createForAI, {
		orgId: args.orgId,
		userId: ownerUserId,
		personCode,
		dealCode: args.deal.dealCode,
		entityType: "deal",
		entityId: args.dealId,
		title,
		dueAt,
		assignedTo: ownerUserId,
		source: "system",
		priority: "normal",
	});

	await ctx.db.insert("aiToolEvents", {
		orgId: args.orgId,
		userId: ownerUserId,
		toolName: "create_followup",
		layer: "automation",
		startedAt: Date.now(),
		durationMs: 0,
		ok: true,
		triggeredBy: "automation:onStageMove",
		expiresAt: Date.now() + 30 * DAY_MS,
	});
}

/**
 * After a contact is created, fire an auto-enrich if:
 *   - the contact has `email` (we use it as the enrichment seed), AND
 *   - the user creating the contact has
 *     `users.preferences.aiAutonomy.autoEnrichOnContactCreate` flipped on.
 *
 * The actual enrichment subagent is invoked best-effort via
 * `ctx.scheduler.runAfter(0, ...)`. The audit row is written
 * unconditionally so the AI changelog records the trigger even if the
 * enrichment provider isn't configured.
 */
export async function maybeFireAutoEnrichOnContactCreate(
	ctx: MutationCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		contactId: Id<"contacts">;
		personCode: string;
		email?: string;
		phone?: string;
	},
): Promise<void> {
	if (!args.email && !args.phone) return;
	const user = await ctx.db.get(args.userId);
	if (!user) return;
	const flag = user.preferences?.aiAutonomy?.autoEnrichOnContactCreate === true;
	if (!flag) return;

	// Audit row — written unconditionally so the AI changelog reflects
	// the trigger even when the enrichment provider is a stub in dev.
	await ctx.db.insert("aiToolEvents", {
		orgId: args.orgId,
		userId: args.userId,
		toolName: "enrich_record",
		layer: "automation",
		startedAt: Date.now(),
		durationMs: 0,
		ok: true,
		triggeredBy: "automation:onContactCreate",
		expiresAt: Date.now() + 30 * DAY_MS,
	});

	// Best-effort schedule of the enrichment subagent. If the provider
	// stack is a stub in dev, the action no-ops cleanly; the audit row
	// above is still written. We catch + log so a misbehaving subagent
	// can never break the parent contact-create transaction.
	try {
		await ctx.scheduler.runAfter(0, internal.ai.standingOrders.triggers.kickOffAutoEnrichment, {
			orgId: args.orgId,
			userId: args.userId,
			targetEntity: "contact",
			targetEntityId: args.contactId as unknown as string,
			targetCode: args.personCode,
			seedEmail: args.email,
			seedPhone: args.phone,
		});
	} catch (err) {
		console.warn("[autoEnrich] schedule failed:", err);
	}
}

/**
 * Stub kick-off action for autonomous enrichment. Today this just logs
 * a structured marker; the real provider waterfall integration is
 * tracked in Future-Enhancements.md (Stage 8 follow-up — the existing
 * enrichment provider stack is quarantined + mostly stubs in dev, so
 * coupling autonomy to it would surface unreliable behaviour). The
 * audit row written by `maybeFireAutoEnrichOnContactCreate` is the
 * durable provenance signal until the production wiring lands.
 *
 * DEFERRED: see Future-Enhancements.md §B.X (auto-enrichment provider
 *          wiring). Re-enable once the quarantined providers are
 *          production-ready.
 */
export const kickOffAutoEnrichment = internalAction({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		targetEntity: v.union(v.literal("contact"), v.literal("lead"), v.literal("company")),
		targetEntityId: v.string(),
		targetCode: v.optional(v.string()),
		seedEmail: v.optional(v.string()),
		seedPhone: v.optional(v.string()),
	},
	handler: async (_ctx, args): Promise<{ ok: true; deferred: true; reason: string }> => {
		console.log("[autoEnrich.kickOff]", {
			orgId: args.orgId,
			userId: args.userId,
			target: `${args.targetEntity}:${args.targetCode ?? args.targetEntityId}`,
			seedEmail: args.seedEmail,
			seedPhone: args.seedPhone,
		});
		return {
			ok: true,
			deferred: true,
			reason: "auto-enrichment provider chain pending Future-Enhancements card; audit row already written.",
		};
	},
});
