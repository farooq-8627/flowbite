/**
 * Tags capabilities — the AI-callable surface for the org-wide tag taxonomy
 * + per-record tag attachments. Wraps the existing `*ForAI` internal twins
 * in `mutations.ts` + `queries.ts`; never re-implements business logic.
 *
 * Surface (6 caps in the `tags` group):
 *
 *   list_tags         org-wide tag list (id + name + colour)
 *   create_tag        create a new tag (rate-limited; unique per org)
 *   update_tag        rename / recolour an existing tag
 *   delete_tag        hard-delete a tag + cascade-detach every entityTag link
 *   attach_tag        link a tag to a lead/contact/deal/company by entityCode
 *   detach_tag        unlink a tag from an entity
 *
 * Group invariants (also baked into the playbook below — keep in sync):
 *
 *   1. Tag names are unique per org (case-sensitive). `create_tag` / `update_tag`
 *      reject duplicates with `DUPLICATE` — surface the existing tag's id and
 *      offer to attach instead.
 *   2. `create_tag` is server-side rate-limited (RATE_LIMITS.write). The
 *      wrapper maps a hit to `infra_retry`; the host's retry budget (2)
 *      governs whether to retry or surface.
 *   3. `attach_tag` / `detach_tag` resolve entity codes (P-NNN / D-NNN /
 *      C-NNN) → entityId via `internal.ai.aiEntityPatch.resolveEntityCode`.
 *      The model never handles raw ids.
 *   4. `delete_tag` cascades through the `entityTags` join (batched 500 at
 *      a time, continued via internal scheduler). Classified `reversible`
 *      because the activity log preserves the audit trail and the user can
 *      recreate + reattach if needed.
 *   5. Permission split: `tags.manage` for create/update/delete; `tags.attach`
 *      for attach/detach. A user might be able to apply tags without being
 *      able to create them.
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

// ─── Group playbook ─────────────────────────────────────────────────────────

defineGroup({
	name: "tags",
	playbook: `Read first → \`list_tags\` returns every tag in the org with its id + name + colour. Use BEFORE \`attach_tag\` (so you have a real tagId) and BEFORE \`create_tag\` (to detect duplicates).

Create vs update vs delete — pick the right verb:
  · \`create_tag\` is rate-limited; duplicate names throw \`DUPLICATE\`. If a duplicate exists, switch to \`attach_tag\` against the existing id.
  · \`update_tag\` to rename or recolour. Renames also reject duplicates.
  · \`delete_tag\` HARD-deletes + cascades through every \`entityTags\` link (batched server-side). Tag-attach permission is separate from tag-manage — a user might attach without creating.

Attach vs detach (per-record):
  · \`attach_tag\` takes the tag's id + the entity's CODE (P-NNN / D-NNN / C-NNN). The capability resolves the code → entityId server-side.
  · Attach is idempotent — re-attaching the same tag is a no-op (returns the existing entityTag id).
  · \`detach_tag\` is also idempotent — detaching an unattached tag is a silent no-op.

Permission: tags.manage for create/update/delete; tags.attach for attach/detach. Reads need only org membership.`,
});

// ─── list_tags ──────────────────────────────────────────────────────────────

const listTags = defineCapability<Record<string, never>>({
	name: "list_tags",
	module: "tags",
	group: "tags",
	permission: "tags.view",
	risk: "safe",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Read every tag in the org. Returns id + name + colour. Use BEFORE every attach_tag (to map a name to an id) and BEFORE create_tag (to detect duplicates).",
		whenNotToCall:
			"the user wants the tags ON a specific record — that's part of `get_entity_detail` (deals/companies/leads groups) which already returns attached tags.",
		synonyms: ["tags", "list tags", "available tags", "tag library"],
		goodExample: {},
	},
	drive: {
		onSuccess: "Narrate the count + show top 5 by name. The result card carries the full list.",
		onEmpty: "If 0 tags, suggest `create_tag` to seed the library.",
	},
	input: z.object({}),
	run: async (cap) => {
		const { ctx, principal } = cap;
		const rows = (await ctx.runQuery(internal.crm.shared.tags.queries.listByOrgForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
		})) as Array<{ _id: string; name: string; color?: string }>;
		if (rows.length === 0) {
			return ok({
				headline: "No tags yet.",
				facts: ["Use `create_tag` to seed the library."],
				data: { tags: [] as unknown[] },
			});
		}
		const top = rows.slice(0, 5);
		return ok({
			headline: `${rows.length} tag${rows.length === 1 ? "" : "s"}.`,
			changes: top.map((t) => ({
				label: t.name,
				value: t.color ?? "(no colour)",
				emphasis: "unchanged" as const,
			})),
			data: { tags: rows },
		});
	},
});

// ─── create_tag ─────────────────────────────────────────────────────────────

const createTag = defineCapability<{ name: string; color?: string }>({
	name: "create_tag",
	module: "tags",
	group: "tags",
	permission: "tags.manage",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Create a new org-wide tag. Names are unique per org (case-sensitive); duplicates throw `DUPLICATE` — switch to `attach_tag` instead. Default colour is a neutral indigo (#6366f1).",
		whenNotToCall:
			"a tag with the same name already exists (call `list_tags` first to check). The user wants to apply an existing tag — use `attach_tag`.",
		requiredClarifications: ["name"],
		synonyms: ["create tag", "new tag", "add tag"],
		goodExample: { name: "Hot lead", color: "#ef4444" },
		badExample: {
			args: { name: "" },
			why: "Name cannot be empty.",
		},
	},
	drive: {
		onSuccess: "Confirm with the new tag's name + colour. Offer to attach it to a record.",
		onValidationError:
			"`DUPLICATE` → tell the user the tag exists; offer `attach_tag` with the surfaced id instead of creating.",
	},
	input: z.object({
		name: z.string().min(1).describe("Tag name. Unique per org (case-sensitive)."),
		color: z
			.string()
			.optional()
			.describe(
				"Optional CSS hex colour (e.g. #ef4444). Defaults to indigo (#6366f1) when omitted.",
			),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const tagId = (await ctx.runMutation(internal.crm.shared.tags.mutations.createForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			name: args.name,
			color: args.color,
		})) as Id<"tags">;
		return ok({
			headline: `Created tag "${args.name}".`,
			changes: [
				{ label: "Tag", value: args.name, emphasis: "added" },
				{ label: "Colour", value: args.color ?? "#6366f1", emphasis: "added" },
			],
			data: { tagId, name: args.name },
			suggestedNext: [
				{
					label: "Attach this tag to a record",
					intent: `Attach the "${args.name}" tag to`,
				},
			],
		});
	},
});

// ─── update_tag ─────────────────────────────────────────────────────────────

const updateTag = defineCapability<{ tagId: string; name?: string; color?: string }>({
	name: "update_tag",
	module: "tags",
	group: "tags",
	permission: "tags.manage",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall: "Rename a tag and / or change its colour.",
		whenNotToCall:
			"the user wants to delete the tag (use `delete_tag`) OR detach it from a record (use `detach_tag`).",
		requiredClarifications: ["tagId"],
		synonyms: ["edit tag", "rename tag", "recolour tag"],
		goodExample: { tagId: "k123abc", name: "VIP", color: "#0ea5e9" },
		badExample: {
			args: { tagId: "k123abc" },
			why: "At least one of name / color must be supplied.",
		},
	},
	drive: {
		onSuccess: "Confirm in one short sentence. The new colour shows on the tag chip.",
		onValidationError: "`DUPLICATE` → another tag already has this name; pick a different one.",
	},
	input: z
		.object({
			tagId: z.string().min(1).describe("The tag's Convex _id."),
			name: z.string().min(1).optional().describe("New tag name. Unique per org."),
			color: z.string().optional().describe("New CSS hex colour."),
		})
		.refine((v) => v.name !== undefined || v.color !== undefined, {
			message: "At least one of name / color must be supplied.",
		}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.crm.shared.tags.mutations.updateForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			tagId: args.tagId as Id<"tags">,
			...(args.name !== undefined ? { name: args.name } : {}),
			...(args.color !== undefined ? { color: args.color } : {}),
		});
		const changes: { label: string; value: string; emphasis: "changed" }[] = [];
		if (args.name !== undefined)
			changes.push({ label: "Name", value: args.name, emphasis: "changed" });
		if (args.color !== undefined)
			changes.push({ label: "Colour", value: args.color, emphasis: "changed" });
		return ok({
			headline: "Tag updated.",
			changes,
			data: { tagId: args.tagId },
		});
	},
});

// ─── delete_tag ─────────────────────────────────────────────────────────────

const deleteTag = defineCapability<{ tagId: string }>({
	name: "delete_tag",
	module: "tags",
	group: "tags",
	permission: "tags.manage",
	// Reversible: HARD-deletes the tag row + cascades the entityTags join,
	// but the activity log preserves the audit trail and the user can
	// recreate + re-attach. Matches the S6 `delete_note` rationale.
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Delete a tag permanently. The mutation cascades through every `entityTags` link in batches of 500 (continued via internal scheduler — the activity-log row is written immediately).",
		whenNotToCall:
			"the user wants to detach the tag from ONE record (use `detach_tag`) OR rename it (use `update_tag`).",
		requiredClarifications: ["tagId"],
		synonyms: ["delete tag", "remove tag", "drop tag"],
		goodExample: { tagId: "k123abc" },
	},
	drive: {
		onSuccess:
			"Confirm in one short sentence. Mention every record carrying this tag will lose the link.",
	},
	input: z.object({
		tagId: z.string().min(1).describe("The tag's Convex _id."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.crm.shared.tags.mutations.removeForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			tagId: args.tagId as Id<"tags">,
		});
		return ok({
			headline: "Tag deleted.",
			changes: [
				{ label: "Tag", value: args.tagId, emphasis: "unchanged" },
				{ label: "State", value: "deleted", emphasis: "changed" },
			],
			facts: ["Every `entityTags` link was cascade-detached."],
			data: { tagId: args.tagId },
		});
	},
});

// ─── attach_tag ─────────────────────────────────────────────────────────────

const attachTag = defineCapability<{
	tagId: string;
	entityType: string;
	entityCode: string;
}>({
	name: "attach_tag",
	module: "tags",
	group: "tags",
	permission: "tags.attach",
	risk: "reversible",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Apply a tag to a lead / contact / deal / company. Pass the entity's PUBLIC code (P-NNN / D-NNN / C-NNN); the capability resolves it to the internal id. Idempotent — re-attaching the same tag is a no-op.",
		whenNotToCall:
			"the user is creating a brand-new tag — call `create_tag` first to get the id, then `attach_tag`. The entity code didn't resolve — call `search_crm` first.",
		requiredClarifications: ["tagId", "entityType", "entityCode"],
		synonyms: ["attach tag", "apply tag", "tag a record", "label entity"],
		goodExample: { tagId: "k123abc", entityType: "lead", entityCode: "P-001" },
		badExample: {
			args: { tagId: "k123abc", entityType: "lead", entityCode: "Sara" },
			why: "entityCode must be the public code (P-NNN). Resolve via search_crm first.",
		},
	},
	drive: {
		onSuccess: "Confirm with the tag name and the entityCode in one short sentence.",
		onValidationError:
			"If entityCode didn't resolve, call search_crm first. If tagId didn't resolve, call list_tags first.",
	},
	input: z.object({
		tagId: z.string().min(1).describe("The tag's Convex _id (from list_tags)."),
		entityType: entityTypeSchema().describe(
			"Which entity kind to attach to. Accepts the canonical type or an org-relabelled alias from describe_workspace.",
		),
		entityCode: z.string().min(1).describe("Entity public code (P-NNN / D-NNN / C-NNN)."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		// Runtime entityType validation against the org's enabled types.
		const validated = await validateEntityType(cap, args.entityType, {
			restrictTo: CORE_ENTITY_TYPES,
		});
		if (isEntityTypeError(validated)) return validated;
		const entityType = validated.entityType as "lead" | "contact" | "deal" | "company";
		// Resolve P-007 / D-001 / C-005 → internal entityId via the shared resolver.
		const resolved = (await ctx.runMutation(internal.ai.aiEntityPatch.resolveEntityCode, {
			orgId: principal.orgId,
			userId: principal.userId,
			entityType,
			code: args.entityCode,
		})) as { entityId: string; canonicalCode: string };
		await ctx.runMutation(internal.crm.shared.tags.mutations.attachToEntityForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			tagId: args.tagId as Id<"tags">,
			entityType,
			entityId: resolved.entityId,
		});
		return ok({
			headline: `Tagged ${args.entityCode}.`,
			changes: [
				{ label: "Entity", value: args.entityCode, emphasis: "unchanged" },
				{ label: "Tag", value: args.tagId, emphasis: "added" },
			],
			data: {
				tagId: args.tagId,
				entityType,
				entityId: resolved.entityId,
				entityCode: resolved.canonicalCode,
			},
		});
	},
});

// ─── detach_tag ─────────────────────────────────────────────────────────────

const detachTag = defineCapability<{
	tagId: string;
	entityType: string;
	entityCode: string;
}>({
	name: "detach_tag",
	module: "tags",
	group: "tags",
	permission: "tags.attach",
	risk: "reversible",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Remove a tag from a record. Idempotent — detaching an unattached tag is a silent no-op (no error). Pass the entity's public code; the capability resolves to the internal id.",
		whenNotToCall:
			"the user wants to delete the tag entirely (use `delete_tag` — that detaches it from every record + drops the tag row).",
		requiredClarifications: ["tagId", "entityType", "entityCode"],
		synonyms: ["detach tag", "remove tag from", "untag", "unlabel"],
		goodExample: { tagId: "k123abc", entityType: "lead", entityCode: "P-001" },
	},
	drive: {
		onSuccess: "Confirm with the tag name and the entityCode in one short sentence.",
	},
	input: z.object({
		tagId: z.string().min(1).describe("The tag's Convex _id."),
		entityType: entityTypeSchema().describe(
			"Which entity kind to detach from. Accepts the canonical type or an org-relabelled alias.",
		),
		entityCode: z.string().min(1).describe("Entity public code (P-NNN / D-NNN / C-NNN)."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const validated = await validateEntityType(cap, args.entityType, {
			restrictTo: CORE_ENTITY_TYPES,
		});
		if (isEntityTypeError(validated)) return validated;
		const entityType = validated.entityType as "lead" | "contact" | "deal" | "company";
		const resolved = (await ctx.runMutation(internal.ai.aiEntityPatch.resolveEntityCode, {
			orgId: principal.orgId,
			userId: principal.userId,
			entityType,
			code: args.entityCode,
		})) as { entityId: string; canonicalCode: string };
		await ctx.runMutation(internal.crm.shared.tags.mutations.detachFromEntityForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			tagId: args.tagId as Id<"tags">,
			entityType,
			entityId: resolved.entityId,
		});
		return ok({
			headline: `Untagged ${args.entityCode}.`,
			changes: [
				{ label: "Entity", value: args.entityCode, emphasis: "unchanged" },
				{ label: "Tag", value: args.tagId, emphasis: "changed" },
			],
			data: {
				tagId: args.tagId,
				entityType,
				entityId: resolved.entityId,
				entityCode: resolved.canonicalCode,
			},
		});
	},
});

// ─── Public surface ─────────────────────────────────────────────────────────

export const TAGS_CAPABILITIES = [listTags, createTag, updateTag, deleteTag, attachTag, detachTag];
