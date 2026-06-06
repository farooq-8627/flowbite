/**
 * V8 sister to `whatsappOutbound.ts` (which is `"use node"`).
 *
 * Hosts the internalQueries the outbound capability needs to resolve:
 *   1. The agent's send-mode `agentChannels` row (`mode:"send"` + enabled).
 *   2. The recipient lead/contact for a personCode → phone + entityType.
 *   3. The most recent inbound `messages` row for that person — feeds the
 *      24h customer-service window check (`whatsappTemplates.isWithinSessionWindow`).
 *
 * Convex forbids `internalQuery`/`internalMutation` in `"use node"` files
 * — same split pattern S11/S13 use (`autonomous.ts` ↔ `autonomousState.ts`,
 * `whatsappInbound.ts` is V8 already so the split wasn't needed there).
 *
 * No mutation lives here yet: the outbound message row is written via
 * the existing `convex/crm/shared/messages/mutations:sendForAI` twin —
 * which already handles authorType/channel/onBehalfOf/idempotency
 * correctly. Reusing it keeps `messages` ownership in one place.
 */

import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { internalQuery } from "../../_generated/server";

// ─── Types ─────────────────────────────────────────────────────────────────

export type AgentSendChannel = {
	id: Id<"agentChannels">;
	orgId: Id<"orgs">;
	userId: Id<"users"> | undefined;
	phoneNumber: string;
	enabled: boolean;
};

export type WhatsappRecipient = {
	entityType: "lead" | "contact";
	personCode: string;
	phone: string;
	displayName: string;
};

// ─── findAgentSendChannel ──────────────────────────────────────────────────

/**
 * Resolve "which Twilio number does THIS agent send from?" by looking up
 * the agent-bound `mode:"send"` row first; if none, fall back to an
 * org-shared `mode:"send"` row (rare — most orgs assign per-agent).
 *
 * Returns `null` when no `mode:"send"` channel is configured AT ALL —
 * that's the cue Mode B is offline for this org and the capability
 * surfaces a `not_found` envelope explaining the operator step.
 *
 * Disabled rows (`enabled === false`) are filtered out — kill-switch
 * semantics match the inbound webhook's behaviour.
 */
export const findAgentSendChannel = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
	},
	handler: async (ctx, args): Promise<AgentSendChannel | null> => {
		// 1. Agent-bound row first.
		const agentRow = await ctx.db
			.query("agentChannels")
			.withIndex("by_org_and_user_and_mode", (q) =>
				q.eq("orgId", args.orgId).eq("userId", args.userId).eq("mode", "send"),
			)
			.first();
		if (agentRow?.enabled) {
			return {
				id: agentRow._id,
				orgId: agentRow.orgId,
				userId: agentRow.userId,
				phoneNumber: agentRow.phoneNumber,
				enabled: agentRow.enabled,
			};
		}

		// 2. Org-shared (no userId) fallback — useful for small teams
		//    that share a single Twilio number for outbound.
		const sharedRow = await ctx.db
			.query("agentChannels")
			.withIndex("by_org_and_user_and_mode", (q) =>
				q.eq("orgId", args.orgId).eq("userId", undefined).eq("mode", "send"),
			)
			.first();
		if (sharedRow?.enabled) {
			return {
				id: sharedRow._id,
				orgId: sharedRow.orgId,
				userId: sharedRow.userId,
				phoneNumber: sharedRow.phoneNumber,
				enabled: sharedRow.enabled,
			};
		}

		return null;
	},
});

// ─── findRecipientByPersonCode ─────────────────────────────────────────────

/**
 * Resolve a personCode → recipient (lead OR contact) with phone +
 * displayName. Tries `contacts` first (long-term identity) then `leads`.
 * Soft-deleted rows are skipped.
 *
 * Returns `null` when no match OR the matched row has no `phone` set.
 * The capability turns the latter into a clear "P-007 has no phone
 * number on file" repair message rather than fabricating a destination.
 */
export const findRecipientByPersonCode = internalQuery({
	args: {
		orgId: v.id("orgs"),
		personCode: v.string(),
	},
	handler: async (ctx, args): Promise<WhatsappRecipient | null> => {
		// Contacts first.
		const contact = await ctx.db
			.query("contacts")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode),
			)
			.first();
		if (contact && contact.deletedAt === undefined && contact.phone) {
			return {
				entityType: "contact",
				personCode: contact.personCode,
				phone: contact.phone,
				displayName: contact.displayName ?? contact.personCode,
			};
		}

		// Then leads.
		const lead = await ctx.db
			.query("leads")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode),
			)
			.first();
		if (lead && lead.deletedAt === undefined && lead.phone) {
			return {
				entityType: "lead",
				personCode: lead.personCode,
				phone: lead.phone,
				displayName: lead.displayName ?? lead.personCode,
			};
		}

		return null;
	},
});

// ─── getMostRecentInboundForPerson ────────────────────────────────────────

/**
 * Return the timestamp of the most recent inbound message for a person
 * (`authorType:"contact"` + `channel:"whatsapp"`), or `null` when none.
 * Used to check the 24h customer-service window — a `null` here means
 * "no window open: out-of-window, only templates allowed."
 *
 * Uses the existing `messages.by_org_and_personCode` index, which is
 * keyed `(orgId, personCode, createdAt)` — order desc + take(N) is
 * effectively O(N) bounded by the small filtered window.
 */
export const getMostRecentInboundForPerson = internalQuery({
	args: {
		orgId: v.id("orgs"),
		personCode: v.string(),
	},
	handler: async (ctx, args): Promise<{ createdAt: number } | null> => {
		const recent = await ctx.db
			.query("messages")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", args.personCode),
			)
			.order("desc")
			.take(20);

		const inbound = recent.find(
			(m) =>
				m.authorType === "contact" && m.channel === "whatsapp" && m.deletedAt === undefined,
		);
		if (!inbound) return null;
		return { createdAt: inbound.createdAt };
	},
});
