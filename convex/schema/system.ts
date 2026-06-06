/**
 * Schema — System domain.
 *
 * Tables: notifications, activityLogs, files, orgStats, contactSubmissions,
 * agentChannels, whatsappTemplates.
 *
 * Generic infrastructure tables fed by every feature.
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";
import { orgScoped, softDelete, timestamps } from "../_shared/validators";

/**
 * In-app notifications for users. Generic — fed by feature mutations.
 */
export const notifications = defineTable({
	...orgScoped,
	userId: v.id("users"),
	type: v.string(),
	title: v.string(),
	body: v.optional(v.string()),
	entityType: v.optional(v.string()),
	entityId: v.optional(v.string()),
	actionUrl: v.optional(v.string()),
	read: v.boolean(),
	readAt: v.optional(v.number()),
	archivedAt: v.optional(v.number()),
	metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
	...timestamps,
})
	.index("by_userId_and_read", ["userId", "read"])
	.index("by_userId_and_read_and_archivedAt", ["userId", "read", "archivedAt"])
	.index("by_orgId_and_userId", ["orgId", "userId"])
	.index("by_userId_and_createdAt", ["userId", "createdAt"]);

/**
 * Audit trail for all mutations. Always call logActivity() after mutations.
 *
 * actorType enables unified timeline to distinguish AI vs human vs integration actions.
 * userId is ALWAYS required — actorType clarifies the medium, not the identity.
 * For AI actions: userId = user who triggered the conversation, actorType = "ai".
 */
export const activityLogs = defineTable({
	...orgScoped,
	userId: v.id("users"),
	actorType: v.union(
		v.literal("user"),
		v.literal("ai"),
		v.literal("integration"),
		v.literal("system"),
	),
	action: v.string(),
	entityType: v.string(),
	entityId: v.string(),
	personCode: v.optional(v.string()),
	description: v.optional(v.string()),
	metadata: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
	createdAt: v.number(),
})
	.index("by_orgId_and_createdAt", ["orgId", "createdAt"])
	.index("by_entityType_and_entityId", ["entityType", "entityId"])
	.index("by_userId_and_createdAt", ["userId", "createdAt"])
	.index("by_orgId_and_actorType_and_createdAt", ["orgId", "actorType", "createdAt"])
	.index("by_org_and_personCode", ["orgId", "personCode"]);

/**
 * Universal attachment table. Works for every entity in the app.
 *
 *   - `scope`    — namespace the attachment lives in ("lead", "contact",
 *                  "deal", "company", "user", "org", or any custom slot).
 *   - `scopeId`  — the record id inside that scope (e.g. a leadId).
 *   - `fieldKey` — optional hint for dynamic-field attachments.
 *   - `tags`     — free-form attribution markers (e.g. "deal:D-001").
 *
 * storageId is the Convex File Storage id — actual bytes live there.
 */
export const files = defineTable({
	...orgScoped,
	storageId: v.id("_storage"),
	scope: v.string(),
	scopeId: v.string(),
	fieldKey: v.optional(v.string()),
	tags: v.optional(v.array(v.string())),
	name: v.string(),
	size: v.number(),
	mimeType: v.string(),
	uploadedBy: v.id("users"),
	...timestamps,
	...softDelete,
})
	.index("by_org_and_scope", ["orgId", "scope", "scopeId"])
	.index("by_org_scope_field", ["orgId", "scope", "scopeId", "fieldKey"])
	.index("by_storageId", ["storageId"])
	.index("by_uploader", ["orgId", "uploadedBy"]);

/**
 * Denormalised aggregate counters per org. One row per (orgId, key).
 *
 * Production-grade replacement for the older "scan + reduce" dashboard query
 * pattern. Every CRUD that should affect a count calls `applyOrgStat()` from
 * `_shared/orgStats.ts`. Reads are O(1) per key.
 *
 * Keys (extend as new modules ship):
 *   - "members.active"        — active orgMembers count (excludes soft-deleted)
 *   - "leads.open"            — leads where !deletedAt && !convertedAt
 *   - "leads.total"           — every lead row created (audit, never decremented)
 *   - "contacts.active"       — contacts where !deletedAt
 *   - "deals.open"            — deals where !deletedAt && !wonAt && !lostAt
 *   - "deals.won"             — closed-as-positive count
 *   - "deals.lost"            — closed-as-negative count
 *   - "deals.pipelineValue"   — sum(value) of open deals (currency-naïve, see note)
 *   - "companies.active"      — companies where !deletedAt
 *
 * Currency note: pipelineValue is summed in the org's `defaultCurrency`. We
 * do not multi-currency-convert; if a deal stores a different currency, its
 * value still contributes — matches existing behaviour.
 *
 * Drift-recovery: an internal `recomputeOrgStats` mutation rebuilds the row
 * from the source-of-truth tables. Canonical export lives at
 * `_shared/orgStats.ts` and runs automatically once a week — see the weekly
 * cron registered in `convex/crons.ts`. To recompute manually:
 *   npx convex run _shared/orgStats:recomputeOrgStats '{}'
 */
export const orgStats = defineTable({
	...orgScoped,
	key: v.string(),
	value: v.number(),
	updatedAt: v.number(),
}).index("by_org_and_key", ["orgId", "key"]);

/**
 * Landing-page contact-form submissions. NOT org-scoped — these come from
 * anonymous public visitors. Every submission is stored here (so the data is
 * never lost even if email delivery isn't configured) and an email is sent to
 * the operator when `CONTACT_TO_EMAIL` is set. `emailStatus` records what
 * happened with the email side.
 */
export const contactSubmissions = defineTable({
	name: v.string(),
	email: v.string(),
	company: v.optional(v.string()),
	interest: v.string(),
	message: v.string(),
	emailStatus: v.union(v.literal("sent"), v.literal("skipped_no_recipient"), v.literal("failed")),
	...timestamps,
}).index("by_createdAt", ["createdAt"]);

/**
 * Per-agent channel routing for inbound + outbound integrations (S13+).
 *
 * One row per (org, provider, phoneNumber) — the phone is the inbound
 * destination Twilio receives the message at, AND the outbound sender for
 * `send_whatsapp` (S14). `userId` is the AGENT (a member) whose RBAC every
 * action runs under; `userId === undefined` is reserved for `mode: "profile"`
 * (the WhatsApp Agent Profile / `wa_profile` service member, S15).
 *
 * The `mode` discriminator routes inbound traffic:
 *   - `agent_ops`  — inbound WhatsApp from a customer maps to this AGENT;
 *                    schedules `autonomousTurn` under their RBAC. (S13)
 *   - `send`       — outbound-only number (Mode B in S14); inbound is rejected.
 *   - `profile`    — Mode C / `wa_profile` persona (S15, OFF by default via
 *                    `org.settings.aiAutonomy.whatsappAgentEnabled`).
 *
 * `enabled === false` short-circuits the inbound webhook to a 401 even when
 * the row exists — used to kill-switch a number without deleting metadata.
 *
 * Indexes:
 *   - `by_phone`                 — single-row lookup of "whose number is this?"
 *                                  Also forms the uniqueness contract: at most
 *                                  one row per (provider, phoneNumber).
 *                                  Enforced at the mutation layer; no DB unique.
 *   - `by_org_and_user_and_mode` — list an agent's channels by mode for the
 *                                  routing layer + settings UI.
 */
export const agentChannels = defineTable({
	...orgScoped,
	userId: v.optional(v.id("users")),
	provider: v.union(v.literal("twilio")),
	phoneNumber: v.string(),
	mode: v.union(v.literal("agent_ops"), v.literal("send"), v.literal("profile")),
	enabled: v.boolean(),
	...timestamps,
})
	.index("by_phone", ["provider", "phoneNumber"])
	.index("by_org_and_user_and_mode", ["orgId", "userId", "mode"])
	.index("by_org_and_provider", ["orgId", "provider"]);

/**
 * WhatsApp message templates — B.40 (S14 follow-up).
 *
 * Two row classes share the table:
 *   - **Built-in** (`isBuiltIn:true`, `orgId:undefined`)         — the
 *     four default templates seeded on every deployment via
 *     `_migrations/2026_06_05_seedDefaultWhatsappTemplates`. They cover
 *     the highest-frequency outbound moments (greeting / follow-up /
 *     appointment / agent-handoff). Built-ins are visible to every org;
 *     they are NEVER deleted by the owner panel — the operator can
 *     archive them, but the seed re-creates the row on the next run.
 *   - **Org override** (`isBuiltIn:false`, `orgId:<id>`)         — written
 *     from the owner panel by an org admin. When an org row carries the
 *     same `templateId` as a built-in, the org row WINS at the read
 *     path (`getTemplateForOrg(orgId, templateId)`). This is how a
 *     real-estate org's "appointment" copy can read different than a
 *     B2B SaaS org's without forking the codebase.
 *
 * Twilio approval status:
 *   - `approvalStatus = "draft"`     — local only, can't be sent
 *                                      out-of-window via the Content API.
 *   - `approvalStatus = "submitted"` — submitted to Twilio (operator
 *                                      pasted the proof of submission).
 *   - `approvalStatus = "approved"`  — Twilio approved + assigned a
 *                                      `contentSid`; out-of-window sends
 *                                      use this SID.
 *   - `approvalStatus = "rejected"`  — Twilio rejected; cannot be used
 *                                      out-of-window until re-submitted.
 *
 * Indexes:
 *   - `by_template_org`     — primary lookup (templateId + orgId). Picks
 *                             the org override first; nullable orgId is
 *                             the built-in fallback (queried with
 *                             `.eq("orgId", undefined)`).
 *   - `by_org_active`       — list every active template for an org
 *                             (built-in + overrides) for the admin UI.
 *   - `by_built_in`         — list every built-in row for the seed
 *                             migration's idempotency check.
 */
export const whatsappTemplates = defineTable({
	/** Stable id used by the AI in `send_whatsapp({templateId})`. Required. */
	templateId: v.string(),
	/** Optional — when set, this row overrides the built-in for that org. */
	orgId: v.optional(v.id("orgs")),
	/** Display label shown in the admin UI + audit log. */
	label: v.string(),
	/** One-line description shown in the admin UI; fed to the AI as a hint. */
	description: v.string(),
	/** Twilio Content API category. `utility` is the safe transactional default. */
	category: v.union(v.literal("utility"), v.literal("marketing"), v.literal("authentication")),
	/** Plain text body with `{{var}}` placeholders. */
	body: v.string(),
	/** Declared placeholders — order matters for Twilio Content API submission. */
	variables: v.array(
		v.object({
			name: v.string(),
			description: v.string(),
			defaultValue: v.optional(v.string()),
		}),
	),
	/**
	 * Twilio Content SID assigned after approval. When set, the outbound
	 * action uses the Content API path (ContentSid + ContentVariables);
	 * when unset, only in-window session sends use this template.
	 */
	contentSid: v.optional(v.string()),
	/** Lifecycle of the Twilio approval. Defaults to `draft`. */
	approvalStatus: v.union(
		v.literal("draft"),
		v.literal("submitted"),
		v.literal("approved"),
		v.literal("rejected"),
	),
	/** Free-form note from the operator (e.g. "rejected because of …"). */
	approvalNote: v.optional(v.string()),
	/** True for the seeded defaults; false for owner-created/org overrides. */
	isBuiltIn: v.boolean(),
	/** When false the template is hidden from the AI + admin pickers. */
	active: v.boolean(),
	/** Last user to edit (org admin or platform owner via the owner panel). */
	updatedBy: v.optional(v.id("users")),
	...timestamps,
	...softDelete,
})
	.index("by_template_org", ["templateId", "orgId"])
	.index("by_org_active", ["orgId", "active"])
	.index("by_built_in", ["isBuiltIn"]);
