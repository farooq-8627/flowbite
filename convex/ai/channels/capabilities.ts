/**
 * WhatsApp outbound capability — S14 (Mode A/B).
 *
 * One capability lives here: `send_whatsapp`. Wires together:
 *   1. `findAgentSendChannel`      — agent's `mode:"send"` Twilio number.
 *   2. `findRecipientByPersonCode` — lead/contact phone + entityType.
 *   3. `getMostRecentInboundForPerson` + `isWithinSessionWindow`
 *      → 24h customer-service window check.
 *   4. `sendWhatsappViaTwilioAction` (Node) — the actual HTTP POST.
 *   5. `sendForAI` (existing internal mutation) — writes the outbound
 *      row into the canonical `messages` table with `channel:"whatsapp"`,
 *      `authorType:"ai"|"user"`, `onBehalfOf=<agent>`, `idempotencyKey`
 *      = the Twilio SID.
 *
 * Templates: read LIVE from `whatsappTemplates` (B.40). The seed
 * migration (`_migrations/2026_06_05_seedDefaultWhatsappTemplates`)
 * inserts the 4 built-ins on first deploy; org admins can override or
 * add more from `/xowner/whatsapp-templates`. There is NO in-process
 * fallback to the seed const at runtime — a missing row surfaces a
 * `repair` envelope listing the org's effective ids.
 *
 * Routing modes:
 *   - **Mode A** — autonomous WhatsApp turn (S13/S15) calls `send_whatsapp`.
 *   - **Mode B** — agent in chat → model picks `send_whatsapp`; runs under
 *     the agent's RBAC; requires an enabled `mode:"send"` agentChannels row.
 *
 * Mode C ships in S15. Risk=`reversible` (auto-executes; no 2FA).
 * Channels: chat / whatsapp / mcp / rest. Permission: `messages.send`.
 */

import { z } from "zod";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { defineCapability } from "../registry/define";
import { defineGroup } from "../registry/groups";
import { failed, ok, repair } from "../registry/result";
import {
	DEFAULT_WHATSAPP_TEMPLATES,
	isWithinSessionWindow,
	renderTemplateBody,
	SESSION_WINDOW_MS,
} from "./whatsappTemplates";

// ─── Group ────────────────────────────────────────────────────────────────
//
// `seedTemplateIdsHint` is the static list of built-in ids used inside
// the cached system-prompt playbook (the playbook is assembled once at
// module-load — we don't have orgId at that point). At RUNTIME, every
// repair envelope reads the org's *effective* template list from the
// DB, so org admins who add a custom template see it surfaced in the
// hint when the AI picks a wrong id.

const seedTemplateIdsHint = DEFAULT_WHATSAPP_TEMPLATES.map((t) => t.id);

defineGroup({
	name: "whatsapp",
	playbook: `Send WhatsApp → call \`send_whatsapp\` with the recipient's personCode (P-NNN). The capability resolves the agent's outbound number, the recipient's phone, and the 24h customer-service window automatically.

Within 24h of the lead's last inbound → pass \`message\` (free-form session text). Outside that window → pass \`templateId\` (built-ins: ${seedTemplateIdsHint.join(", ")} — the org may also have custom templates returned in the repair envelope) + \`templateVars\` filling every required variable. The capability rejects free-form out-of-window — that's a Twilio policy, not our choice.

Don't fabricate template variables. If the agent didn't tell you the appointment time, ask via \`ask_user\` instead of guessing. The capability writes the outbound row into the lead's message box with \`authorType:"ai"\` (when the AI composed it) or \`"user"\` (when a human dictated the text verbatim) — \`onBehalfOf\` is always the acting agent.

If \`send_whatsapp\` returns \`not_found\` for the channel, Mode B isn't configured for this agent yet — say so plainly; don't retry.`,
});

// ─── send_whatsapp ────────────────────────────────────────────────────────

// `seedTemplateIds` is the static list of seed template ids used in the
// arg-schema description (rendered into the cached prompt prefix). The
// runtime always reads the org's effective template list from the DB,
// so org-custom templates are fully supported via the repair envelope.
const seedTemplateIds = DEFAULT_WHATSAPP_TEMPLATES.map((t) => t.id);

const sendWhatsappArgs = z
	.object({
		recipientPersonCode: z
			.string()
			.regex(/^P-\d+$/i, "personCode must look like `P-007`.")
			.describe("The lead/contact's personCode (P-NNN). Required."),
		message: z
			.string()
			.min(1)
			.max(1500)
			.optional()
			.describe(
				"Free-form session message. Used WITHIN the 24h customer-service window. Mutually exclusive with `templateId`.",
			),
		templateId: z
			.string()
			.optional()
			.describe(
				`Pre-approved template id when sending OUT-OF-WINDOW. Built-ins: ${seedTemplateIds.join(", ")}. Org-custom ids surface in the repair envelope when a wrong id is passed.`,
			),
		templateVars: z
			.record(z.string(), z.string())
			.optional()
			.describe(
				"Values for the chosen template's `{{var}}` placeholders. Every required variable must be supplied.",
			),
		// When the AI composes the text the agent dictated verbatim ("send
		// EXACTLY this: …"), set authoredBy:"user" so the message box shows
		// the agent as the author. Default authorType is "ai".
		authoredBy: z
			.enum(["ai", "user"])
			.optional()
			.describe(
				"Who wrote the body — `ai` (the model composed it) or `user` (the agent dictated it verbatim). Defaults to `ai`.",
			),
	})
	.refine((v) => !!v.message || !!v.templateId, {
		message: "Pass either `message` (in-window) OR `templateId` (out-of-window).",
	});

type SendWhatsappArgs = z.infer<typeof sendWhatsappArgs>;

defineCapability<SendWhatsappArgs>({
	name: "send_whatsapp",
	module: "messaging",
	group: "whatsapp",
	permission: "messages.send",
	risk: "reversible",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Send a WhatsApp message to a lead/contact via the agent's configured Twilio \"send\" number. Within 24h of the lead's last inbound, pass `message`; otherwise pass `templateId` + `templateVars`.",
		whenNotToCall:
			'the agent wants to message another team member (use `send_message` for in-app chat); the conversation is in `wa_profile` mode (S15); the org hasn\'t configured a `mode:"send"` `agentChannels` row.',
		requiredClarifications: [
			"Which person? (personCode)",
			"What message? (free-form text OR template + values)",
		],
		synonyms: ["whatsapp", "wa", "text the lead", "dm on whatsapp", "message via whatsapp"],
		goodExample: {
			recipientPersonCode: "P-007",
			message: "Hi Sara — sending those JVC options across in a few minutes.",
		},
		badExample: {
			args: { recipientPersonCode: "P-007" },
			why: "Pass either `message` (in-window) OR `templateId` (out-of-window). Empty calls do nothing.",
		},
	},
	drive: {
		onSuccess:
			"Confirm in one short sentence that the message was sent to <displayName> via WhatsApp. Don't quote the body — the message box renders it. If the send was via a template, mention which template.",
		onValidationError:
			"If a required template variable is missing, ASK the agent for it (don't guess). If the channel isn't configured, tell the agent — only an owner can seed the `agentChannels` row.",
		onDenied:
			"Surface the missing permission (`messages.send`) and suggest the agent ask an admin to grant it.",
	},
	input: sendWhatsappArgs,
	run: async (cap, args) => {
		const { ctx, principal } = cap;

		// 1. Resolve the agent's outbound channel. Mode B only fires when
		//    the agent (or org-shared) has an enabled `mode:"send"` row.
		const channel = (await ctx.runQuery(
			internal.ai.channels.whatsappOutboundState.findAgentSendChannel,
			{ orgId: principal.orgId, userId: principal.userId },
		)) as { phoneNumber: string; userId: Id<"users"> | undefined } | null;
		if (!channel) {
			return failed(
				"not_found",
				'WhatsApp outbound is not configured for you yet. Ask an owner to seed an `agentChannels` row with `mode:"send"` for your account.',
			);
		}

		// 2. Resolve the recipient lead/contact + their phone.
		const personCode = args.recipientPersonCode.toUpperCase();
		const recipient = (await ctx.runQuery(
			internal.ai.channels.whatsappOutboundState.findRecipientByPersonCode,
			{ orgId: principal.orgId, personCode },
		)) as {
			entityType: "lead" | "contact";
			personCode: string;
			phone: string;
			displayName: string;
		} | null;
		if (!recipient) {
			return failed(
				"not_found",
				`No lead or contact with code ${personCode} has a phone on file.`,
			);
		}

		// 3. 24h customer-service window check.
		const lastInbound = (await ctx.runQuery(
			internal.ai.channels.whatsappOutboundState.getMostRecentInboundForPerson,
			{ orgId: principal.orgId, personCode },
		)) as { createdAt: number } | null;
		const within = isWithinSessionWindow(lastInbound?.createdAt);

		// 4. Choose the body — session vs template, gated by the window.
		//    Templates come LIVE from the `whatsappTemplates` table (B.40
		//    SSOT). No in-process fallback — a missing/inactive id surfaces
		//    a `repair` envelope listing the org's effective ids.
		let bodyText: string | undefined;
		let template:
			| {
					templateId: string;
					label: string;
					body: string;
					variables: Array<{ name: string; description: string; defaultValue?: string }>;
					contentSid: string | null;
			  }
			| undefined;

		// Resolve the org's effective template id list once for repair envelopes.
		// Cheap (small bounded table) and only fired when needed.
		const orgTemplates = (await ctx.runQuery(
			internal._platform.whatsappTemplates.queries.listForOrgInternal,
			{ orgId: principal.orgId },
		)) as Array<{
			templateId: string;
			label: string;
			body: string;
			variables: Array<{ name: string; description: string; defaultValue?: string }>;
			contentSid: string | null;
			active: boolean;
		}>;
		const effectiveIds = orgTemplates.map((t) => t.templateId);

		if (args.templateId) {
			const resolved = (await ctx.runQuery(
				internal._platform.whatsappTemplates.queries.getTemplateForOrg,
				{ orgId: principal.orgId, templateId: args.templateId },
			)) as {
				templateId: string;
				label: string;
				body: string;
				variables: Array<{ name: string; description: string; defaultValue?: string }>;
				contentSid: string | null;
				active: boolean;
			} | null;
			if (!resolved?.active) {
				return repair(
					"templateId",
					effectiveIds.length > 0
						? `one of: ${effectiveIds.join(", ")}`
						: "a registered template id (none configured for this org — ask an admin to seed templates)",
					args.templateId,
					"Pick a registered template id from the list above.",
					{
						recipientPersonCode: personCode,
						templateId: effectiveIds[0] ?? "",
						templateVars: {},
					},
				);
			}
			template = {
				templateId: resolved.templateId,
				label: resolved.label,
				body: resolved.body,
				variables: resolved.variables,
				contentSid: resolved.contentSid,
			};
			const rendered = renderTemplateBody(
				{
					id: resolved.templateId,
					label: resolved.label,
					description: "",
					category: "utility",
					body: resolved.body,
					variables: resolved.variables,
					contentSid: resolved.contentSid ?? undefined,
				},
				args.templateVars,
			);
			if (!rendered.ok) {
				return repair(
					"templateVars",
					`values for: ${rendered.missing.join(", ")}`,
					JSON.stringify(args.templateVars ?? {}),
					"Fill every variable the template declares.",
					{
						recipientPersonCode: personCode,
						templateId: resolved.templateId,
						templateVars: Object.fromEntries(
							resolved.variables.map((v) => [v.name, `<${v.description}>`]),
						),
					},
				);
			}
			bodyText = rendered.body;
		} else if (args.message) {
			if (!within) {
				// Out-of-window free-form is a Twilio policy violation. We
				// refuse on the client side so the model sees a clean
				// repair envelope instead of a generic Twilio 400.
				return repair(
					"message",
					effectiveIds.length > 0
						? `a templateId (one of ${effectiveIds.join(", ")})`
						: "a templateId (no templates configured — ask an admin to seed templates)",
					"a free-form message",
					`The 24h customer-service window is closed (last inbound > ${SESSION_WINDOW_MS / 3_600_000}h ago). Free-form messages are only allowed in-window. Pass \`templateId\` + \`templateVars\` instead.`,
					{
						recipientPersonCode: personCode,
						templateId: effectiveIds[0] ?? "",
						templateVars: {},
					},
				);
			}
			bodyText = args.message;
		} else {
			// The zod refine catches this; defensive fallback.
			return failed("business_error", "Pass `message` OR `templateId`.");
		}

		// 5. Send via Twilio (real OR mock per env).
		const twilio = (await ctx.runAction(
			internal.ai.channels.whatsappOutbound.sendWhatsappViaTwilioAction,
			{
				fromPhone: channel.phoneNumber,
				toPhone: recipient.phone,
				body: bodyText,
				...(template?.contentSid ? { contentSid: template.contentSid } : {}),
				...(template?.contentSid && args.templateVars
					? { contentVariables: args.templateVars }
					: {}),
				idempotencySeed: `${principal.orgId}:${personCode}:${Date.now()}`,
			},
		)) as
			| { ok: true; sid: string; mock: boolean }
			| { ok: false; errorCode?: string; errorMessage: string };
		if (!twilio.ok) {
			return failed(
				"infra_retry",
				`WhatsApp send failed: ${twilio.errorMessage}${
					twilio.errorCode ? ` (${twilio.errorCode})` : ""
				}.`,
			);
		}

		// 6. Persist outbound row in the canonical `messages` table. Reuses
		//    the existing `sendForAI` twin → automatically handles
		//    conversation get-or-create, participant join, idempotency.
		try {
			await ctx.runMutation(internal.crm.shared.messages.mutations.sendForAI, {
				orgId: principal.orgId,
				userId: principal.userId,
				entityType: recipient.entityType,
				entityId: personCode,
				content: bodyText,
				authorType: args.authoredBy ?? "ai",
				onBehalfOf: principal.userId,
				channel: "whatsapp",
				authorPersonCode: undefined,
				idempotencyKey: twilio.sid,
			});
		} catch (err) {
			// The Twilio send already succeeded — don't fail the capability.
			// Log + continue; the outbound message lives on Twilio's side
			// even if we couldn't mirror it locally.
			console.warn("[ai/send_whatsapp] persist failed:", err);
		}

		return ok({
			headline: template
				? `Sent ${template.label} to ${recipient.displayName} via WhatsApp.`
				: `Sent WhatsApp message to ${recipient.displayName}.`,
			changes: [
				{ label: "Recipient", value: `${recipient.displayName} (${personCode})` },
				{ label: "Channel", value: "whatsapp" },
				...(template
					? [
							{
								label: "Template",
								value: template.templateId,
								emphasis: "added" as const,
							},
						]
					: []),
				...(twilio.mock
					? [{ label: "Mode", value: "mock", emphasis: "unchanged" as const }]
					: []),
			],
			facts: [
				within
					? `Sent within the 24h customer-service window.`
					: `Sent via approved template (out-of-window).`,
				`Twilio SID: ${twilio.sid}`,
			],
			data: {
				sid: twilio.sid,
				windowOpen: within,
				recipientType: recipient.entityType,
				templateId: template?.templateId,
				mock: twilio.mock,
			},
			display: { kind: "personCode", personCode },
		});
	},
});
