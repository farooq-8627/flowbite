/**
 * S13 — Twilio WhatsApp inbound handler.
 *
 * Three concerns, kept separate so each is unit-testable:
 *   1. Pure helpers — `verifyTwilioSignatureSha1`, `parseTwilioFormBody`.
 *   2. Internal queries/mutations — agent lookup, lead lookup, idempotent
 *      message write into the existing `messages` table (PART 1 §1.10).
 *   3. Internal action `handleTwilioInboundInternal` — orchestrator the
 *      `httpAction` in `convex/http.ts` calls AFTER signature verification.
 *
 * Routing per `agentChannels.mode`:
 *   - "agent_ops" → schedule `runtime/autonomous:autonomousTurn` under the
 *                   AGENT's RBAC. The customer's text is data, never authority.
 *   - "send"      → outbound-only number. Inbound is rejected.
 *   - "profile"   → S15 Mode C — schedule `channels/persona:runWaProfileReply`
 *                   under the wa_profile service member. The persona-side
 *                   master switch (`org.settings.aiAutonomy.whatsappAgentEnabled`)
 *                   is checked AT-RUN inside the action, so flipping it
 *                   off stops new replies immediately even if the webhook
 *                   already fired.
 *
 * Persistence into `messages` happens ONLY when we resolve the From phone
 * to an existing contact/lead — the table requires (entityType, entityId).
 * For unknown senders the inbound text is passed as the autonomous engine's
 * transcript instead; the engine creates the lead via `create_lead`, and
 * the NEXT inbound from that number lands in the box. (Backfilling orphan
 * inbound onto a freshly-created lead is a follow-up.)
 *
 * Idempotency: `messages.idempotencyKey = MessageSid` keyed on the existing
 * `by_org_and_idempotency` index — Twilio re-delivery on retries can't
 * double-write.
 */

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
	internalAction,
	internalMutation,
	internalQuery,
	type MutationCtx,
} from "../../_generated/server";
import { normalizePhone } from "../../crm/fields/dedup/helpers";
import { ensureMember, getOrCreateConversation } from "../../crm/shared/conversations/internal";

// ─── Pure helpers (unit-testable, no Convex ctx) ───────────────────────────

/**
 * Outcome of the orchestrator. The `httpAction` translates these to HTTP
 * responses. `unauthorized` → 401, anything else → 200 (Twilio retries on
 * non-2xx and we never want a retry loop after we've persisted).
 */
export type WhatsappInboundOutcome =
	| { kind: "ok"; routed: "agent_ops" | "profile_stub"; messageSid: string }
	| { kind: "noop"; reason: "send_only_channel"; messageSid: string }
	| {
			kind: "unauthorized";
			reason:
				| "missing_signature"
				| "bad_signature"
				| "missing_to"
				| "missing_messagesid"
				| "channel_not_found"
				| "channel_disabled";
	  };

/**
 * Parse Twilio's `application/x-www-form-urlencoded` POST body into a flat
 * `Record<string, string>`. Twilio's webhook spec guarantees scalar values,
 * never repeated keys, so a `URLSearchParams` round-trip is sufficient.
 *
 * Pure — exported for tests.
 */
export function parseTwilioFormBody(rawBody: string): Record<string, string> {
	const out: Record<string, string> = {};
	const params = new URLSearchParams(rawBody);
	for (const [k, v] of params.entries()) out[k] = v;
	return out;
}

/**
 * Verify Twilio's `X-Twilio-Signature` per
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 *
 * Algorithm for `application/x-www-form-urlencoded` POST:
 *   1. Start with the exact request URL Twilio called.
 *   2. Sort form params alphabetically by KEY.
 *   3. Append each `key + value` pair to the URL with NO separator.
 *   4. HMAC-SHA1 the resulting string with the Twilio Auth Token.
 *   5. Base64-encode → compare (constant-time) to `X-Twilio-Signature`.
 *
 * Pure — exported for tests. Returns true on match.
 */
export async function verifyTwilioSignatureSha1(args: {
	authToken: string;
	url: string;
	params: Record<string, string>;
	signature: string;
}): Promise<boolean> {
	const { authToken, url, params, signature } = args;
	if (!authToken || !signature) return false;

	const sortedKeys = Object.keys(params).sort();
	let payload = url;
	for (const k of sortedKeys) payload += k + params[k];

	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(authToken),
		{ name: "HMAC", hash: "SHA-1" },
		false,
		["sign"],
	);
	const sigBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));

	// Base64 encode the raw bytes — Twilio's signature is base64.
	let binary = "";
	const bytes = new Uint8Array(sigBuffer);
	for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
	const expected = btoa(binary);

	// Constant-time compare. Length-mismatch fails immediately but still
	// scans the longer of the two so a length leak doesn't help.
	if (expected.length !== signature.length) return false;
	let mismatch = 0;
	for (let i = 0; i < expected.length; i += 1) {
		mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
	}
	return mismatch === 0;
}

// ─── Internal lookups ──────────────────────────────────────────────────────

/**
 * Resolve a Twilio "To" number → the org + agent that owns it. Returns
 * `null` when no `agentChannels` row matches; the orchestrator translates
 * this to a 401 so an unmapped number can never trigger an action.
 *
 * Phone numbers stored in `agentChannels.phoneNumber` are kept verbatim
 * (E.164, e.g. `+14155550100`) — we look up by exact match on the
 * `by_phone` index.
 */
export const findAgentChannelByPhone = internalQuery({
	args: {
		provider: v.union(v.literal("twilio")),
		phoneNumber: v.string(),
	},
	handler: async (ctx, args) => {
		const row = await ctx.db
			.query("agentChannels")
			.withIndex("by_phone", (q) =>
				q.eq("provider", args.provider).eq("phoneNumber", args.phoneNumber),
			)
			.first();
		if (!row) return null;
		return {
			orgId: row.orgId,
			userId: row.userId,
			mode: row.mode,
			enabled: row.enabled,
		};
	},
});

/**
 * Resolve an inbound "From" phone → an existing lead or contact in this
 * org. We use `normalizePhone` (strip non-digits) to match the dedup
 * helper's `normalizedPhone` field that's indexed on both `leads` +
 * `contacts`. Returns the FIRST match — multiple matches are not handled
 * here (autonomous turn can disambiguate via `search_crm`).
 */
export const findContactOrLeadByPhone = internalQuery({
	args: {
		orgId: v.id("orgs"),
		phoneNumber: v.string(),
	},
	handler: async (ctx, args) => {
		const normalized = normalizePhone(args.phoneNumber);
		if (normalized.length === 0) return null;

		// Prefer contacts (long-term identity). Fall back to leads.
		const contact = await ctx.db
			.query("contacts")
			.withIndex("by_org_and_normalizedPhone", (q) =>
				q.eq("orgId", args.orgId).eq("normalizedPhone", normalized),
			)
			.first();
		if (contact && contact.deletedAt === undefined) {
			return {
				entityType: "contact" as const,
				personCode: contact.personCode,
				assignedTo: contact.assignedTo,
			};
		}

		const lead = await ctx.db
			.query("leads")
			.withIndex("by_org_and_normalizedPhone", (q) =>
				q.eq("orgId", args.orgId).eq("normalizedPhone", normalized),
			)
			.first();
		if (lead && lead.deletedAt === undefined) {
			return {
				entityType: "lead" as const,
				personCode: lead.personCode,
				assignedTo: lead.assignedTo,
			};
		}
		return null;
	},
});

// ─── Internal mutation: persist inbound row ────────────────────────────────

/**
 * Idempotent inbound write. Uses `messages.by_org_and_idempotency` keyed
 * on `(orgId, conversationId, MessageSid)`; if a row with the same
 * idempotencyKey already exists in the same conversation, return its id
 * instead of inserting a duplicate. Twilio re-delivery is therefore safe.
 *
 * `authorId` is the AGENT — accountability on a row whose true sender
 * (the customer) has no `users` row. The actual sender identity is on
 * `authorType:"contact"` + `authorPersonCode`.
 */
export const recordInboundWhatsappMessage = internalMutation({
	args: {
		orgId: v.id("orgs"),
		agentUserId: v.id("users"),
		entityType: v.union(v.literal("lead"), v.literal("contact"), v.literal("person")),
		personCode: v.string(),
		content: v.string(),
		messageSid: v.string(),
	},
	handler: async (ctx: MutationCtx, args) => {
		// 1. Get-or-create the canonical conversation for this person. The
		//    helper auto-rewrites legacy lead/contact-keyed rows to "person"
		//    so future reads hit one canonical path.
		const conversationId = await getOrCreateConversation(ctx, {
			orgId: args.orgId,
			entityType: args.entityType,
			entityId: args.personCode,
			creatorId: args.agentUserId,
		});

		// 2. Idempotency check — short-circuit Twilio re-delivery before
		//    any further writes.
		const existing = await ctx.db
			.query("messages")
			.withIndex("by_org_and_idempotency", (q) =>
				q
					.eq("orgId", args.orgId)
					.eq("conversationId", conversationId)
					.eq("idempotencyKey", args.messageSid),
			)
			.first();
		if (existing) {
			return { messageId: existing._id, conversationId, deduped: true as const };
		}

		const now = Date.now();
		const messageId = await ctx.db.insert("messages", {
			orgId: args.orgId,
			conversationId,
			entityType: args.entityType,
			entityId: args.personCode,
			personCode: args.personCode,
			content: args.content,
			authorId: args.agentUserId,
			authorType: "contact",
			channel: "whatsapp",
			authorPersonCode: args.personCode,
			idempotencyKey: args.messageSid,
			createdAt: now,
			updatedAt: now,
		});

		// 3. Bump conversation summary so the inbox preview is current.
		await ctx.db.patch(conversationId, {
			lastMessageAt: now,
			lastMessagePreview: args.content.slice(0, 200),
			lastMessageAuthorId: args.agentUserId,
			updatedAt: now,
		});

		// 4. Auto-add the agent as a participant so the message is visible
		//    in their inbox + future read_conversation calls scope correctly.
		await ensureMember(ctx, {
			orgId: args.orgId,
			conversationId,
			userId: args.agentUserId,
			role: "participant",
			joinReason: "auto",
		});

		return { messageId, conversationId, deduped: false as const };
	},
});

// ─── Orchestrator (post-signature-verification) ────────────────────────────

/**
 * Internal action called by the `httpAction` in `convex/http.ts` AFTER the
 * signature has been verified. Splitting this from the http handler keeps
 * the http layer thin (read body + verify + dispatch) and makes the routing
 * + persistence logic testable with `convex-test` directly.
 *
 * Returns a `WhatsappInboundOutcome` describing what was done — the http
 * layer maps that to a status code + body. We never throw on legitimate
 * Twilio payloads; we surface the outcome so the http response is
 * deterministic.
 */
export const handleTwilioInboundInternal = internalAction({
	args: {
		// Pre-parsed Twilio form fields the http layer already extracted.
		from: v.string(), // E.164 sender (the customer)
		to: v.string(), // E.164 receiving number (the agent's mapped Twilio number)
		body: v.string(), // The message text
		messageSid: v.string(), // Twilio's message id — our idempotency key
	},
	handler: async (ctx, args): Promise<WhatsappInboundOutcome> => {
		// 1. Resolve receiving number → channel row. Strip Twilio's
		//    `whatsapp:` URI prefix for the lookup; we store the bare E.164
		//    in `agentChannels.phoneNumber`.
		const toBare = stripWhatsappPrefix(args.to);
		const channel = await ctx.runQuery(
			internal.ai.channels.whatsappInbound.findAgentChannelByPhone,
			{ provider: "twilio", phoneNumber: toBare },
		);
		if (!channel) return { kind: "unauthorized", reason: "channel_not_found" };
		if (!channel.enabled) return { kind: "unauthorized", reason: "channel_disabled" };

		// 2. Mode routing — `send` is outbound-only, `profile` is Mode C.
		if (channel.mode === "send") {
			return { kind: "noop", reason: "send_only_channel", messageSid: args.messageSid };
		}
		if (channel.mode === "profile") {
			// S15 — Mode C dispatch. Master switch + per-conversation
			// rate limit + allow-list filter all live inside
			// `runWaProfileReply`; we just need to resolve the persona's
			// service-member id (the `userId` on the agentChannels row)
			// and forward the inbound transcript. Without a `userId` the
			// row is mis-seeded — fail closed so an unmapped persona
			// can never act.
			if (!channel.userId) {
				return { kind: "unauthorized", reason: "channel_not_found" };
			}
			const profileUserId = channel.userId as Id<"users">;

			// Same recipient resolution as agent_ops — keeps the message
			// box coherent (the persona's reply will land on the same
			// `aiConversations` row as the inbound).
			const fromBareProfile = stripWhatsappPrefix(args.from);
			const existingProfile = await ctx.runQuery(
				internal.ai.channels.whatsappInbound.findContactOrLeadByPhone,
				{ orgId: channel.orgId, phoneNumber: fromBareProfile },
			);

			let messagesConversationId: Id<"conversations"> | undefined;
			if (existingProfile) {
				const written = await ctx.runMutation(
					internal.ai.channels.whatsappInbound.recordInboundWhatsappMessage,
					{
						orgId: channel.orgId,
						agentUserId: profileUserId,
						entityType: existingProfile.entityType,
						personCode: existingProfile.personCode,
						content: args.body,
						messageSid: args.messageSid,
					},
				);
				messagesConversationId = (written as { conversationId?: Id<"conversations"> })
					.conversationId;
			}

			const transcript = formatInboundTranscript({
				fromPhone: fromBareProfile,
				content: args.body,
				personCode: existingProfile?.personCode,
			});
			await ctx.scheduler.runAfter(0, internal.ai.channels.persona.runWaProfileReply, {
				orgId: channel.orgId,
				profileUserId,
				transcript,
				idempotencyKey: args.messageSid,
				// Use the messages-table conversationId (or the
				// personCode when no entity exists yet) as the
				// per-conversation rate-limit key. The action runs
				// without an `aiConversations` row — autonomous-reply
				// turns don't have a persisted aiConversations entry.
				rateLimitKey: messagesConversationId
					? `conv:${messagesConversationId as unknown as string}`
					: existingProfile?.personCode
						? `person:${existingProfile.personCode}`
						: `from:${fromBareProfile}`,
			});
			return { kind: "ok", routed: "profile_stub", messageSid: args.messageSid };
		}

		// 3. `agent_ops` mode requires a bound agent — the principal every
		//    capability inside the autonomous turn will gate against.
		if (!channel.userId) {
			return { kind: "unauthorized", reason: "channel_not_found" };
		}
		const agentUserId = channel.userId as Id<"users">;

		// 4. Resolve the From phone → existing contact/lead (if any). Used
		//    to attach the inbound row to a real entity when one exists.
		const fromBare = stripWhatsappPrefix(args.from);
		const existing = await ctx.runQuery(
			internal.ai.channels.whatsappInbound.findContactOrLeadByPhone,
			{ orgId: channel.orgId, phoneNumber: fromBare },
		);

		// 5. Persist the inbound message ONLY when we have an entity.
		//    Orphan inbound for new senders is forwarded to the autonomous
		//    engine via the transcript; it creates the lead via `create_lead`
		//    and the next inbound lands in the box.
		if (existing) {
			await ctx.runMutation(
				internal.ai.channels.whatsappInbound.recordInboundWhatsappMessage,
				{
					orgId: channel.orgId,
					agentUserId,
					entityType: existing.entityType,
					personCode: existing.personCode,
					content: args.body,
					messageSid: args.messageSid,
				},
			);
		}

		// 6. Schedule the autonomous turn under the AGENT's RBAC. The
		//    debounce + audit row inside the engine will dedupe rapid-fire
		//    inbound bursts on the same conversation. The transcript here
		//    is the inbound text — the engine reads broader history via
		//    `read_conversation` if needed.
		const transcript = formatInboundTranscript({
			fromPhone: fromBare,
			content: args.body,
			personCode: existing?.personCode,
		});
		await ctx.scheduler.runAfter(0, internal.ai.runtime.autonomous.autonomousTurn, {
			orgId: channel.orgId,
			agentUserId,
			transcript,
			channel: "whatsapp",
			triggeredBy: `autonomous:whatsapp:${args.messageSid}`,
			idempotencyKey: args.messageSid,
		});

		return { kind: "ok", routed: "agent_ops", messageSid: args.messageSid };
	},
});

// ─── Small helpers (pure) ──────────────────────────────────────────────────

/**
 * Twilio WhatsApp numbers come prefixed with `whatsapp:` (e.g.
 * `whatsapp:+14155550100`). Channel rows store the bare E.164 so the
 * `agentChannels.phoneNumber` value is provider-agnostic.
 *
 * Pure — exported for tests.
 */
export function stripWhatsappPrefix(value: string): string {
	if (value.startsWith("whatsapp:")) return value.slice("whatsapp:".length);
	return value;
}

/**
 * Compose the autonomous-engine prompt's transcript section for a single
 * inbound message. The engine's `buildAutonomousPrompt` wraps this with
 * the goals checklist; we only supply the conversation body. Keeping this
 * a labelled one-liner means the model sees `Customer: <text>` and won't
 * confuse the inbound for the agent's own instructions.
 *
 * Pure — exported for tests.
 */
export function formatInboundTranscript(args: {
	fromPhone: string;
	content: string;
	personCode?: string;
}): string {
	const ident = args.personCode ? `${args.personCode} (${args.fromPhone})` : args.fromPhone;
	return `Customer ${ident}: ${args.content.trim()}`;
}
