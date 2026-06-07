/**
 * Notes capabilities — the AI-callable surface for the notes domain.
 * Wraps the existing `*ForAI` internal twins in `mutations.ts` + `queries.ts`;
 * never re-implements business logic.
 *
 * Surface (6 caps in the `notes` group):
 *
 *   add_note            attach a note to lead/contact/deal/company by entityCode
 *   update_note         patch title / content / categoryId / isInternal by noteId
 *   set_note_category   move a note into a different category column
 *   pin_note            toggle pin (returns the new state)
 *   set_note_entity     re-attach a note to a different entity (or org-wide bucket)
 *   delete_note         hard-delete (no undo — `reversible` only because the
 *                       activity log preserves the audit trail; matches the
 *                       legacy V1 confirmation policy)
 *
 * Group invariants (also baked into the playbook below — keep both in sync):
 *
 *   1. CREATE → entityCode (P-NNN / D-NNN / C-NNN), not raw `entityId`. The
 *      `createForAI` mutation auto-resolves the code via `resolveCodeToRecordForAI`
 *      and auto-populates `personCode` for lead/contact rows. The AI never
 *      handles the internal `_id`.
 *   2. UPDATE / PIN / DELETE / SET_CATEGORY / SET_ENTITY all take the raw
 *      `noteId` (notes have no public code). The model gets the noteId from
 *      `list_org_notes` or by reading a prior result's `data.noteId`.
 *   3. CATEGORY moves go through `set_note_category` (atomic, single round-trip
 *      — the mutation auto-stamps a top-of-column sortOrder so the recategorized
 *      card lands at the top of the destination column). Don't use update_note
 *      for this; the kanban-position semantics differ.
 *   4. PIN goes through `pin_note` (returns the new boolean state). Don't
 *      patch `isPinned` via update_note — pin_note is idempotent and the
 *      activity log records different verbs.
 *   5. SET_ENTITY can detach a note back to the org-wide bucket by passing
 *      `entityType:"org"` + `entityId:"<orgSlug>"`. The mutation re-resolves
 *      the personCode automatically when the destination is a person.
 *   6. DELETE is HARD (`ctx.db.delete`) — no `deletedAt` flag. We classify
 *      `risk: "reversible"` because the activity log preserves the fact that
 *      the note existed (matches the legacy V1 policy + the `cancel_task_by_code`
 *      classification rationale). If S10 widens the `irreversible` fence to
 *      single-row destructive ops, flip the classification here in the same edit.
 */
import { z } from "zod";
import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import {
	CORE_ENTITY_TYPES,
	entityTypeSchema,
	isEntityTypeError,
	validateEntityType,
} from "../../../_shared/entityTypes";
import { defineCapability } from "../../../ai/registry/define";
import { defineGroup } from "../../../ai/registry/groups";
import { ok } from "../../../ai/registry/result";

// Lead/contact/deal/company OR the org-wide bucket. The runtime
// validator below only restricts the lead-or-org capability — the org
// bucket is its own enum literal that flows directly through.
const CORE_OR_ORG_ENTITY_TYPES = [...CORE_ENTITY_TYPES, "org"] as const;

// ─── Group playbook ─────────────────────────────────────────────────────────

defineGroup({
	name: "notes",
	playbook: `Read first → \`list_org_notes\` (or \`search_crm\` for cross-entity discovery). The note's internal \`_id\` is the handle for every write operation; surface it from a prior list/search call.

Create → \`add_note\` with the entity's CODE (P-NNN / D-NNN / C-NNN), not the raw _id. The mutation auto-resolves the code → entityId AND auto-populates \`personCode\` for lead/contact attachments — you don't need to pass it separately. \`isInternal:true\` hides the note from client/partner portals.

Update vs pin vs category vs entity — pick the RIGHT verb:
  · \`update_note\` for title / content / categoryId / isInternal patches.
  · \`pin_note\` for pin/unpin (returns the new state — confirm using it).
  · \`set_note_category\` for kanban-column moves (atomic, lands at top of column — different sortOrder semantics than update_note).
  · \`set_note_entity\` for re-attaching to a different entity (or detaching back to the org-wide bucket via \`entityType:"org"\` + \`entityId:<orgSlug>\`).

Delete → \`delete_note\` is HARD-delete (no \`deletedAt\` flag). The activity log preserves the fact that it existed, but the row is gone. Surface "this is permanent" in the confirmation message.

Permission: notes.create / notes.updateOwn / notes.deleteOwn protect the verbs. \`notes.deleteAny\` is the admin override for all owner-gated mutations. Internal notes need \`notes.viewInternal\` to be RETURNED by reads; the mutations don't gate on it.`,
});

// ─── add_note ───────────────────────────────────────────────────────────────

const addNote = defineCapability<{
	entityType: string;
	entityCode: string;
	content: string;
	title?: string;
	isInternal?: boolean;
	categoryId?: string;
}>({
	name: "add_note",
	module: "notes",
	group: "notes",
	permission: "notes.create",
	risk: "reversible",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Capture context about a record — meeting recap, call summary, internal observation, follow-up promise. Notes are visible to all team members with `notes.view`; flip `isInternal:true` to hide from client/partner portals (still requires `notes.viewInternal` to read).",
		whenNotToCall:
			"the content is a task with a due date — call create_task with `type:'followup'`. The content is sensitive customer data covered by RBAC — use the relevant entity field instead.",
		requiredClarifications: ["entityType", "entityCode", "content"],
		synonyms: ["log", "annotation", "remark", "comment", "memo"],
		goodExample: {
			entityType: "lead",
			entityCode: "P-001",
			content: "Had a great call. Wants Q3 numbers next week.",
			isInternal: false,
		},
		badExample: {
			args: { entityType: "lead", entityCode: "Sarah", content: "Test" },
			why: "entityCode must be a P-NNN / D-NNN / C-NNN code. Resolve via search_crm first.",
		},
	},
	drive: {
		onSuccess:
			"Reply with one short sentence confirming the note attached + the entityCode. Don't restate the content — the note card carries it.",
		onValidationError:
			"If entityCode didn't resolve, run search_crm first. Don't retry blindly.",
	},
	input: z.object({
		entityType: entityTypeSchema().describe(
			"The entity kind to attach the note to. Accepts canonical type or org-relabelled alias.",
		),
		entityCode: z.string().min(1).describe("Entity public code (P-NNN / D-NNN / C-NNN)."),
		content: z.string().min(1).describe("Note body. Markdown supported."),
		title: z.string().optional().describe("Optional note title (max 80 chars)."),
		isInternal: z
			.boolean()
			.optional()
			.default(false)
			.describe(
				"true → hide from client/partner portals (requires notes.viewInternal to read).",
			),
		categoryId: z
			.string()
			.optional()
			.describe(
				"Optional Convex _id of a noteCategory (call list_categories first if unknown). When unset, the org's default category is used.",
			),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const validated = await validateEntityType(cap, args.entityType, {
			restrictTo: CORE_ENTITY_TYPES,
		});
		if (isEntityTypeError(validated)) return validated;
		const entityType = validated.entityType;
		const noteId = (await ctx.runMutation(internal.crm.shared.notes.mutations.createForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			entityType,
			entityCode: args.entityCode,
			content: args.content,
			title: args.title,
			isInternal: args.isInternal ?? false,
			categoryId: args.categoryId as Id<"noteCategories"> | undefined,
			authorType: principal.kind === "wa_profile" ? "ai" : "user",
		})) as Id<"notes">;
		const preview = args.content.length > 80 ? `${args.content.slice(0, 77)}…` : args.content;
		return ok({
			headline: `Added note to ${args.entityCode}.`,
			changes: [
				{ label: "Attached to", value: args.entityCode, emphasis: "added" },
				{
					label: "Visibility",
					value: args.isInternal ? "Internal" : "Shared",
					emphasis: "added",
				},
				{ label: "Excerpt", value: preview, emphasis: "added" },
			],
			data: { noteId, entityType, entityCode: args.entityCode },
			display: { kind: "note", noteId: noteId as unknown as string },
			suggestedNext: [
				{
					label: "Schedule follow-up",
					intent: `Schedule a follow-up with ${args.entityCode} for next week`,
				},
				{
					label: "Pin this note",
					intent: `Pin the note we just added to ${args.entityCode}`,
				},
			],
		});
	},
});

// ─── update_note ────────────────────────────────────────────────────────────

const updateNote = defineCapability<{
	noteId: string;
	title?: string;
	content?: string;
	categoryId?: string;
	isInternal?: boolean;
}>({
	name: "update_note",
	module: "notes",
	group: "notes",
	permission: "notes.updateOwn",
	risk: "reversible",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Edit an existing note's title / content / category / internal flag. Owner with `notes.updateOwn` OR admin with `notes.deleteAny`.",
		whenNotToCall:
			"the user wants to PIN (use pin_note) OR change category alone (use set_note_category — atomic, no top-of-column re-sort surprise) OR re-attach to a different entity (use set_note_entity).",
		requiredClarifications: ["noteId"],
		synonyms: ["edit note", "fix note", "amend note", "rewrite note", "correct typo"],
		goodExample: {
			noteId: "k123abc",
			content: "Had a great call. Wants Q3 numbers next Tuesday (not Wed).",
		},
		badExample: {
			args: { noteId: "k123abc" },
			why: "At least one of title/content/categoryId/isInternal must be set — otherwise the call is a no-op.",
		},
	},
	drive: {
		onSuccess:
			"Confirm in one short sentence — the note card refreshes below. Don't quote the new content.",
		onValidationError:
			"If the noteId didn't resolve OR the caller isn't the note's owner (and isn't an admin), surface the failure plainly. Don't retry blindly.",
	},
	input: z
		.object({
			noteId: z.string().min(1).describe("The note's Convex _id."),
			title: z.string().optional().describe("New note title (max 80 chars)."),
			content: z.string().optional().describe("New note body. Markdown supported."),
			categoryId: z
				.string()
				.optional()
				.describe("New category id. Look up via list_categories if unknown."),
			isInternal: z.boolean().optional().describe("If true, hide from client portals."),
		})
		.refine(
			(v) =>
				v.title !== undefined ||
				v.content !== undefined ||
				v.categoryId !== undefined ||
				v.isInternal !== undefined,
			{
				message:
					"At least one of title / content / categoryId / isInternal must be supplied.",
			},
		),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.crm.shared.notes.mutations.updateForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			noteId: args.noteId as Id<"notes">,
			...(args.title !== undefined ? { title: args.title } : {}),
			...(args.content !== undefined ? { content: args.content } : {}),
			...(args.categoryId !== undefined
				? { categoryId: args.categoryId as Id<"noteCategories"> }
				: {}),
			...(args.isInternal !== undefined ? { isInternal: args.isInternal } : {}),
		});
		const changes: { label: string; value: string; emphasis: "changed" }[] = [];
		if (args.title !== undefined)
			changes.push({ label: "Title", value: args.title, emphasis: "changed" });
		if (args.content !== undefined) {
			const preview =
				args.content.length > 60 ? `${args.content.slice(0, 60)}…` : args.content;
			changes.push({ label: "Content", value: preview, emphasis: "changed" });
		}
		if (args.categoryId !== undefined)
			changes.push({ label: "Category", value: args.categoryId, emphasis: "changed" });
		if (args.isInternal !== undefined)
			changes.push({
				label: "Visibility",
				value: args.isInternal ? "Internal" : "Shared",
				emphasis: "changed",
			});
		return ok({
			headline: "Note updated.",
			changes,
			data: { noteId: args.noteId },
			display: { kind: "note", noteId: args.noteId },
		});
	},
});

// ─── set_note_category ──────────────────────────────────────────────────────

const setNoteCategory = defineCapability<{
	noteId: string;
	categoryId: string;
}>({
	name: "set_note_category",
	module: "notes",
	group: "notes",
	permission: "notes.updateOwn",
	risk: "reversible",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Move a note to a different category column. Atomic single round-trip — server stamps a top-of-column sortOrder so the recategorized note lands above existing notes in the destination column.",
		whenNotToCall:
			"the user wants to edit the note's content (use update_note) OR pin/unpin (use pin_note) OR re-attach to a different entity (use set_note_entity).",
		requiredClarifications: ["noteId", "categoryId"],
		synonyms: ["recategorize", "reclassify", "move column", "change category"],
		goodExample: { noteId: "k123abc", categoryId: "k456def" },
		badExample: {
			args: { noteId: "k123abc", categoryId: "Decisions" },
			why: "categoryId must be the Convex _id, not the human-readable name. Resolve via list_categories first.",
		},
	},
	drive: {
		onSuccess:
			"Confirm in one short sentence with the destination category name if you have it.",
		onValidationError:
			"If the categoryId didn't resolve, call list_categories first. Don't retry with the same value.",
	},
	input: z.object({
		noteId: z.string().min(1).describe("The note's Convex _id."),
		categoryId: z.string().min(1).describe("Destination noteCategory _id."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.crm.shared.notes.mutations.setCategoryForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			noteId: args.noteId as Id<"notes">,
			categoryId: args.categoryId as Id<"noteCategories">,
		});
		return ok({
			headline: "Note category updated.",
			changes: [
				{ label: "Note", value: args.noteId, emphasis: "unchanged" },
				{ label: "Category", value: args.categoryId, emphasis: "changed" },
			],
			data: { noteId: args.noteId, categoryId: args.categoryId },
			display: { kind: "note", noteId: args.noteId },
		});
	},
});

// ─── pin_note ───────────────────────────────────────────────────────────────

const pinNote = defineCapability<{ noteId: string }>({
	name: "pin_note",
	module: "notes",
	group: "notes",
	permission: "notes.pin",
	risk: "reversible",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Toggle a note's pinned state — pin to surface, unpin to demote. Returns the new boolean state so you can confirm 'Pinned.' vs 'Unpinned.' correctly. Idempotent in spirit (toggle), but the underlying mutation does flip the bit — the activity log records both verbs.",
		whenNotToCall:
			"the user wants to set a category (use set_note_category) or edit the content (use update_note).",
		requiredClarifications: ["noteId"],
		synonyms: ["pin", "unpin", "star", "highlight", "feature"],
		goodExample: { noteId: "k123abc" },
	},
	drive: {
		onSuccess:
			"Tell the user the new state (pinned vs unpinned) — read it from `data.isPinned`. The note card shows the pin icon.",
		onDenied: "Tell the user they need the notes.pin permission.",
	},
	input: z.object({
		noteId: z.string().min(1).describe("The note's Convex _id."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const result = (await ctx.runMutation(internal.crm.shared.notes.mutations.togglePinForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			noteId: args.noteId as Id<"notes">,
		})) as { isPinned: boolean };
		return ok({
			headline: result.isPinned ? "Note pinned." : "Note unpinned.",
			changes: [
				{ label: "Note", value: args.noteId, emphasis: "unchanged" },
				{
					label: "State",
					value: result.isPinned ? "Pinned" : "Unpinned",
					emphasis: "changed",
				},
			],
			data: { noteId: args.noteId, isPinned: result.isPinned },
			display: { kind: "note", noteId: args.noteId },
		});
	},
});

// ─── set_note_entity ────────────────────────────────────────────────────────

const setNoteEntity = defineCapability<{
	noteId: string;
	entityType: string;
	entityCode?: string;
	orgSlug?: string;
	personCode?: string;
}>({
	name: "set_note_entity",
	module: "notes",
	group: "notes",
	permission: "notes.updateOwn",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Re-attach a note to a different entity. Pass `entityType:'lead'|'contact'|'deal'|'company'` + `entityCode` to attach to a record. Pass `entityType:'org'` + `orgSlug` to detach back to the org-wide bucket.",
		whenNotToCall:
			"the user wants to recategorize within the same entity (use set_note_category) or edit the note (use update_note).",
		requiredClarifications: ["noteId", "entityType"],
		synonyms: ["reattach note", "move note", "re-link note"],
		goodExample: { noteId: "k123abc", entityType: "deal", entityCode: "D-007" },
		badExample: {
			args: { noteId: "k123abc", entityType: "lead", entityCode: "Sarah" },
			why: "entityCode must be the public code (P-NNN / D-NNN / C-NNN). Run search_crm first.",
		},
	},
	drive: {
		onSuccess:
			"Confirm in one short sentence with the destination (entityCode or 'org-wide bucket').",
		onValidationError:
			"If entityCode didn't resolve, run search_crm first. Don't retry blindly.",
	},
	input: z
		.object({
			noteId: z.string().min(1).describe("The note's Convex _id."),
			entityType: entityTypeSchema().describe(
				"Destination entity type — canonical type or 'org' (detach back to the org-wide bucket).",
			),
			entityCode: z
				.string()
				.optional()
				.describe(
					"Destination public code (P-NNN / D-NNN / C-NNN) — required when entityType is not 'org'.",
				),
			orgSlug: z
				.string()
				.optional()
				.describe("Org slug — required when entityType is 'org'."),
			personCode: z
				.string()
				.optional()
				.describe(
					"Optional explicit personCode for lead/contact destinations. Auto-populated from entityCode when unset.",
				),
		})
		.refine((v) => (v.entityType === "org" ? !!v.orgSlug : !!v.entityCode), {
			message:
				"entityType:'org' requires orgSlug; lead/contact/deal/company requires entityCode.",
		}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		// Validate against the org's enabled types PLUS the special "org"
		// sentinel (detach to the org-wide bucket).
		const validated = await validateEntityType(cap, args.entityType, {
			restrictTo: CORE_OR_ORG_ENTITY_TYPES,
		});
		if (isEntityTypeError(validated)) return validated;
		const destEntityType = validated.entityType;

		// Resolve destination entity code → entityId. For "org" the entityId
		// is the orgSlug (matches the legacy ui contract where the org-wide
		// bucket has entityType:"org" + entityId=orgSlug — see notes module docs).
		let destEntityId: string;
		let destPersonCode = args.personCode;
		if (destEntityType === "org") {
			destEntityId = args.orgSlug ?? "";
			destPersonCode = undefined;
		} else {
			const resolved = (await ctx.runMutation(internal.ai.aiEntityPatch.resolveEntityCode, {
				orgId: principal.orgId,
				userId: principal.userId,
				entityType: destEntityType as "lead" | "contact" | "deal" | "company",
				code: args.entityCode ?? "",
			})) as { entityId: string; canonicalCode: string };
			destEntityId = resolved.entityId;
			if (!destPersonCode && (destEntityType === "lead" || destEntityType === "contact")) {
				destPersonCode = resolved.canonicalCode;
			}
		}

		await ctx.runMutation(internal.crm.shared.notes.mutations.setEntityForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			noteId: args.noteId as Id<"notes">,
			entityType: destEntityType,
			entityId: destEntityId,
			personCode: destPersonCode,
		});
		const destLabel =
			destEntityType === "org" ? "org-wide bucket" : (args.entityCode ?? "(unknown)");
		return ok({
			headline: `Re-attached note to ${destLabel}.`,
			changes: [
				{ label: "Note", value: args.noteId, emphasis: "unchanged" },
				{ label: "Attached to", value: destLabel, emphasis: "changed" },
			],
			data: {
				noteId: args.noteId,
				entityType: destEntityType,
				entityId: destEntityId,
				personCode: destPersonCode,
			},
			display: { kind: "note", noteId: args.noteId },
		});
	},
});

// ─── delete_note ────────────────────────────────────────────────────────────

const deleteNote = defineCapability<{ noteId: string }>({
	name: "delete_note",
	module: "notes",
	group: "notes",
	permission: "notes.deleteOwn",
	risk: "reversible", // see invariant #6 in this file's header for the rationale.
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Hard-delete a single note by its Convex _id. The mutation is owner-gated (`notes.deleteOwn`) with admin override (`notes.deleteAny`).",
		whenNotToCall:
			"the user wants to detach the note (call set_note_entity with entityType:'org') OR archive (notes have no archive — surface the constraint).",
		requiredClarifications: ["noteId"],
		synonyms: ["remove note", "trash note", "delete note"],
		goodExample: { noteId: "k123abc" },
	},
	drive: {
		onSuccess: "Confirm in one short sentence. Mention deletion is permanent.",
		onDenied:
			"Tell the user they need notes.deleteOwn (own note) or notes.deleteAny (admin override).",
	},
	input: z.object({
		noteId: z.string().min(1).describe("The note's Convex _id."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.crm.shared.notes.mutations.removeForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			noteId: args.noteId as Id<"notes">,
		});
		return ok({
			headline: "Note deleted (permanent).",
			changes: [
				{ label: "Note", value: args.noteId, emphasis: "unchanged" },
				{ label: "State", value: "deleted", emphasis: "changed" },
			],
			facts: ["Hard-deleted — the activity log preserves the audit trail."],
			data: { noteId: args.noteId },
		});
	},
});

// ─── list_org_notes ─────────────────────────────────────────────────────────

const listOrgNotes = defineCapability<{
	categoryId?: string;
	authorId?: string;
	entityType?: string;
	isPinned?: boolean;
	limit?: number;
}>({
	name: "list_org_notes",
	module: "notes",
	group: "notes",
	permission: "notes.view",
	risk: "safe",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Org-wide notes feed with optional filters. Use to find a note's _id BEFORE update_note / pin_note / set_note_category / delete_note. Internal notes are filtered out for callers without `notes.viewInternal`.",
		whenNotToCall:
			"the user named an entity — search_crm + list per-entity is tighter scope. The user wants the org-wide ACTIVITY feed (created/updated events) — that's list_org_timeline.",
		synonyms: ["my notes", "all notes", "pinned notes", "recent notes"],
		goodExample: { isPinned: true, limit: 10 },
		badExample: {
			args: { entityType: "task" as unknown as "lead" },
			why: "Tasks aren't notes. Use list_tasks for the tasks feed.",
		},
	},
	drive: {
		onSuccess:
			"If 0 results, say so plainly. If many, narrate the count + the top 3 by recency — the result card carries the full list.",
		onEmpty:
			"No matching notes. Offer to relax the filter (drop categoryId / authorId / isPinned) before broadening.",
	},
	input: z.object({
		categoryId: z.string().optional().describe("Filter by noteCategory _id."),
		authorId: z.string().optional().describe("Filter by author user _id."),
		entityType: entityTypeSchema()
			.optional()
			.describe(
				"Filter by attached entity kind. Accepts canonical type or org-relabelled alias.",
			),
		isPinned: z.boolean().optional().describe("true → only pinned; false → only unpinned."),
		limit: z
			.number()
			.int()
			.min(1)
			.max(200)
			.optional()
			.default(50)
			.describe("Maximum rows. Default 50."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		let entityType: string | undefined;
		if (args.entityType !== undefined) {
			const validated = await validateEntityType(cap, args.entityType, {
				restrictTo: CORE_ENTITY_TYPES,
			});
			if (isEntityTypeError(validated)) return validated;
			entityType = validated.entityType;
		}
		const rows = (await ctx.runQuery(internal.crm.shared.notes.queries.listForOrgForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			categoryId: args.categoryId as Id<"noteCategories"> | undefined,
			authorId: args.authorId as Id<"users"> | undefined,
			entityType,
			isPinned: args.isPinned,
			limit: args.limit ?? 50,
		})) as Array<{
			_id: string;
			title?: string;
			content: string;
			entityType: string;
			personCode?: string;
			isPinned: boolean;
			isInternal: boolean;
			createdAt: number;
		}>;
		if (rows.length === 0) {
			return ok({
				headline: "No matching notes.",
				facts: ["Try without the filter, or call search_crm to find a specific entity."],
				data: { notes: [] as unknown[] },
			});
		}
		const top = rows.slice(0, 5);
		return ok({
			headline: `${rows.length} note${rows.length === 1 ? "" : "s"}.`,
			changes: top.map((n) => ({
				label: n.title?.slice(0, 40) ?? n.content.slice(0, 40),
				value: `${n.entityType}${n.personCode ? `/${n.personCode}` : ""} · ${new Date(n.createdAt).toISOString().slice(0, 10)}${n.isPinned ? " · pinned" : ""}`,
				emphasis: "unchanged" as const,
			})),
			data: { notes: rows },
		});
	},
});

// ─── Public surface ─────────────────────────────────────────────────────────

export const NOTES_CAPABILITIES = [
	addNote,
	updateNote,
	setNoteCategory,
	pinNote,
	setNoteEntity,
	deleteNote,
	listOrgNotes,
];
