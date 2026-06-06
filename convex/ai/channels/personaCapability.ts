/**
 * `escalate_to_agent` capability + supporting internal mutation.
 *
 * Stage S15 — Mode C handoff. When the WhatsApp Agent Profile (the
 * `wa_profile` persona) decides the conversation must be handled by a
 * human, it calls `escalate_to_agent({ recipientPersonCode, reason })`.
 * The capability:
 *   1. Resolves the lead/contact by personCode.
 *   2. Picks the handoff target — `assignedTo` if set, else `null` (the
 *      operator's shared queue handles unassigned via a notification
 *      that targets every member with `messages.send`).
 *   3. Adds a note to the lead/contact summarising the handoff context.
 *   4. Sends an in-app notification to the agent (or every queue
 *      member) so the human picks up the thread.
 *   5. Returns a `headline` + `suggestedNext` that hints the AI to send
 *      the customer the `agent_handoff_v1` WhatsApp template (the
 *      persona's drive lines reinforce that follow-up).
 *
 * The actual customer-facing reply (the WhatsApp template) is the model's
 * follow-up `send_whatsapp` call — keeping `escalate_to_agent` single-
 * purpose makes it composable with chat-side dictation flows ("escalate
 * P-007 to me; I'll take it from here") that don't need a customer ping.
 *
 * Permission: `messages.send` — the persona already needs it to send
 * WhatsApp; reusing it avoids granting a second key for the handoff.
 * Risk: `reversible` (the handoff is a notification + note, not a
 * destructive write).
 *
 * Spec: AI-TOOLING-BUILD-STAGES.md §S15.
 */

import { ConvexError, v } from "convex/values";
import { z } from "zod";
import { requireOrgMemberByIds } from "../../_functions/authenticated";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { internalMutation, type MutationCtx } from "../../_generated/server";
import { requireRole } from "../../_shared/permissions/helpers";
import { sendNotification } from "../../notifications/helpers";
import { defineCapability } from "../registry/define";
import { failed, ok } from "../registry/result";

// ─── Internal mutation — atomic DB work ───────────────────────────────────

/**
 * The `run()` handler delegates here so every write (note + notification)
 * lands in a single transaction. Refusing to thread a separate runMutation
 * for each side-effect keeps the audit row + activity log coherent: if
 * the note fails to insert, the notification is rolled back too.
 *
 * Returns the resolved person + handoff target so the capability can
 * shape its envelope.
 */
export const escalateToAgentInternal = internalMutation({
	args: {
		orgId: v.id("orgs"),
		/** The acting principal — the wa_profile service member or a chat agent. */
		actorUserId: v.id("users"),
		recipientPersonCode: v.string(),
		reason: v.optional(v.string()),
	},
	handler: async (ctx: MutationCtx, args) => {
		const { member } = await requireOrgMemberByIds(ctx, args.orgId, args.actorUserId);
		requireRole(member.permissions, "messages.send");

		const personCode = args.recipientPersonCode.toUpperCase();

		// 1. Resolve the lead OR contact by personCode. Prefer contact
		//    (long-term identity) over lead — same precedence as the
		//    inbound resolver.
		const contact = await ctx.db
			.query("contacts")
			.withIndex("by_org_and_personCode", (q) =>
				q.eq("orgId", args.orgId).eq("personCode", personCode),
			)
			.first();
		const lead = !contact
			? await ctx.db
					.query("leads")
					.withIndex("by_org_and_personCode", (q) =>
						q.eq("orgId", args.orgId).eq("personCode", personCode),
					)
					.first()
			: null;

		const person = contact ?? lead;
		if (!person || person.deletedAt !== undefined) {
			throw new ConvexError({
				code: "NOT_FOUND",
				message: `No lead or contact with code ${personCode}.`,
			});
		}

		const entityType: "contact" | "lead" = contact ? "contact" : "lead";
		const displayName =
			(person as { displayName?: string }).displayName ??
			(person as { name?: string }).name ??
			personCode;
		const assignedTo: Id<"users"> | null =
			(person as { assignedTo?: Id<"users"> }).assignedTo ?? null;

		// 2. Resolve the handoff TARGET set. Owner-defined `assignedTo`
		//    takes precedence; when unassigned we notify every member
		//    holding `messages.send` (the shared-queue fallback). This is
		//    intentionally simple — round-robin / online-only routing is
		//    a follow-up.
		let recipients: Id<"users">[] = [];
		if (assignedTo) {
			recipients = [assignedTo];
		} else {
			// Shared-queue fallback. Reads orgMembers + their roles to filter
			// to members with `messages.send`. Bounded — an org has ≤ ~50
			// members in practice; reading them all is cheap.
			const memberRows = await ctx.db
				.query("orgMembers")
				.withIndex("by_orgId_and_userId", (q) => q.eq("orgId", args.orgId))
				.collect();
			const allowed: Id<"users">[] = [];
			for (const m of memberRows) {
				if (m.deletedAt !== undefined) continue;
				const role = await ctx.db.get(m.roleId);
				if (!role) continue;
				if ((role.permissions as string[]).includes("messages.send")) {
					allowed.push(m.userId);
				}
			}
			recipients = allowed;
		}

		// 3. Add the handoff note. `notes.createForAI` would re-check the
		//    actor's `notes.create` permission via requireOrgMemberByIds
		//    — but we're already inside the transaction with the same
		//    actor; doing the note insert directly mirrors what
		//    `createImpl` does and avoids an extra ctx.runMutation hop.
		const now = Date.now();
		const noteContent =
			args.reason && args.reason.trim().length > 0
				? `Escalated to a human agent. Reason: ${args.reason.trim()}`
				: "Escalated to a human agent.";
		const noteId = await ctx.db.insert("notes", {
			orgId: args.orgId,
			entityType,
			entityId: person._id as unknown as string,
			personCode,
			authorId: args.actorUserId,
			authorType: "ai",
			content: noteContent,
			isInternal: true,
			isPinned: false,
			createdAt: now,
			updatedAt: now,
		});

		// 4. Notify every recipient. Use the canonical `sendNotification`
		//    helper so the row shape matches every other notification.
		const notificationIds: Id<"notifications">[] = [];
		for (const recipientUserId of recipients) {
			// Don't self-notify the persona — even if the operator wired
			// the wa_profile member's `userId` into a queue role.
			if (recipientUserId === args.actorUserId) continue;
			const id = await sendNotification(ctx, {
				orgId: args.orgId,
				userId: recipientUserId,
				type: "ai.whatsappAgent.escalation",
				title: `WhatsApp handoff: ${displayName}`,
				body: noteContent,
				entityType,
				entityId: personCode,
				actionUrl: `/profile/${personCode}`,
				metadata: {
					personCode,
					assignedDirect: assignedTo === recipientUserId,
				},
			});
			notificationIds.push(id);
		}

		return {
			personCode,
			entityType,
			displayName,
			assignedTo,
			recipientCount: notificationIds.length,
			noteId,
		};
	},
});

// ─── Capability definition ────────────────────────────────────────────────

const escalateArgs = z.object({
	recipientPersonCode: z
		.string()
		.regex(/^P-\d+$/i, "personCode must look like `P-007`.")
		.describe("The lead/contact's personCode (P-NNN). Required."),
	reason: z
		.string()
		.min(1)
		.max(500)
		.optional()
		.describe(
			"Why escalation is needed — quoted from the customer's message or summarised. Helps the human pick up the thread.",
		),
});

type EscalateArgs = z.infer<typeof escalateArgs>;

defineCapability<EscalateArgs>({
	name: "escalate_to_agent",
	module: "messaging",
	group: "whatsapp",
	permission: "messages.send",
	risk: "reversible",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Hand the conversation off to a human agent. The customer asked for a person, the request is outside the persona's restricted scope (delete, change account, anything destructive), or the persona is uncertain and would otherwise guess.",
		whenNotToCall:
			"the customer's question can be answered from CRM/FAQ + a single template (use `send_whatsapp` instead); the agent will be back online soon and a `follow_up_v1` template suffices; the persona is just confirming a booking.",
		requiredClarifications: [
			"Which person? (personCode — usually the inbound sender resolved by `search_crm`)",
		],
		synonyms: [
			"hand off",
			"transfer to agent",
			"route to human",
			"speak to a person",
			"speak to someone",
		],
		goodExample: {
			recipientPersonCode: "P-007",
			reason: "Customer asked to speak to a person about pricing.",
		},
		badExample: {
			args: { recipientPersonCode: "P-007" },
			why: "Always include `reason` — the human picking up the thread needs context. Empty escalations bury the lede.",
		},
	},
	drive: {
		onSuccess:
			"Confirm the handoff in one short sentence. After this call, send the customer the `agent_handoff_v1` WhatsApp template via `send_whatsapp` so they know an agent will reach out — don't leave them hanging.",
		onValidationError:
			"If the personCode doesn't resolve, the inbound sender isn't yet in the CRM — call `create_lead` first, then retry the escalation against the new personCode.",
		onDenied:
			"If `messages.send` is missing, the persona is mis-configured — tell the operator.",
	},
	input: escalateArgs,
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		try {
			const result = (await ctx.runMutation(
				internal.ai.channels.personaCapability.escalateToAgentInternal,
				{
					orgId: principal.orgId,
					actorUserId: principal.userId,
					recipientPersonCode: args.recipientPersonCode,
					reason: args.reason,
				},
			)) as {
				personCode: string;
				entityType: "lead" | "contact";
				displayName: string;
				assignedTo: Id<"users"> | null;
				recipientCount: number;
				noteId: Id<"notes">;
			};

			const target = result.assignedTo
				? "the assigned agent"
				: result.recipientCount > 0
					? `${result.recipientCount} member${result.recipientCount === 1 ? "" : "s"} in the shared queue`
					: "no one (no member in the org holds `messages.send` — operator must seed at least one)";

			return ok({
				headline: `Escalated ${result.displayName} (${result.personCode}) to ${target}.`,
				changes: [
					{ label: "Person", value: `${result.displayName} (${result.personCode})` },
					{
						label: "Handoff",
						value: result.assignedTo ? "assigned agent" : "shared queue",
						emphasis: "added",
					},
					{
						label: "Note",
						value: "Added (internal)",
						emphasis: "added",
					},
				],
				facts: [
					result.recipientCount === 0
						? "No human will see this — seed at least one member with `messages.send`."
						: `${result.recipientCount} notification${result.recipientCount === 1 ? "" : "s"} sent.`,
				],
				suggestedNext: [
					{
						label: "Tell the customer an agent will reach out",
						intent: `send_whatsapp(recipientPersonCode="${result.personCode}", templateId="agent_handoff_v1", templateVars={"name": "${result.displayName}"})`,
					},
				],
				data: {
					personCode: result.personCode,
					entityType: result.entityType,
					assignedTo: result.assignedTo,
					recipientCount: result.recipientCount,
				},
				display: { kind: "personCode", personCode: result.personCode },
			});
		} catch (err) {
			if (err instanceof ConvexError) {
				const body = err.data as { code?: string; message?: string } | string | undefined;
				if (typeof body === "object" && body?.code === "NOT_FOUND") {
					return failed(
						"not_found",
						body.message ?? `No lead or contact with code ${args.recipientPersonCode}.`,
					);
				}
				return failed(
					"business_error",
					typeof body === "string" ? body : (body?.message ?? "Could not escalate."),
				);
			}
			throw err;
		}
	},
});
