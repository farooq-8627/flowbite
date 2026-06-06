/**
 * Note-category capabilities — the AI-callable surface for the org's note
 * taxonomy (the kanban columns on the notes board). Wraps the existing
 * `*ForAI` internal twins; never re-implements business logic.
 *
 * Surface (7 caps in the `categories` group):
 *
 *   list_categories          all categories (optionally including archived)
 *   create_note_category     new category (validated name + hex colour)
 *   update_note_category     rename / recolour
 *   archive_note_category    soft-archive (or restore) — no DB delete
 *   reorder_note_categories  reorder by id list
 *   set_default_category     mark one as the org default (demotes the prev)
 *   delete_note_category     hard-delete iff zero notes reference it
 *
 * Group invariants (also baked into the playbook below — keep in sync):
 *
 *   1. Names are unique per org (case-sensitive). Both create + update reject
 *      duplicates with `DUPLICATE`.
 *   2. Names ≤40 chars, colours must match `^#([0-9a-f]{3}|[0-9a-f]{6})$`
 *      (case-insensitive). The mutation throws `INVALID_ARGS` otherwise; the
 *      wrapper surfaces it as `business_error`. The schema also pre-rejects.
 *   3. The org has EXACTLY ONE default category. `set_default_category`
 *      demotes the previous default automatically.
 *   4. `delete_note_category` is HARD-delete and is BLOCKED while any note
 *      references the category (mutation throws `IN_USE`). Archive instead,
 *      or move the notes first. Default category cannot be deleted (must
 *      reassign first via `set_default_category`).
 *   5. `archive_note_category` is reversible — pass `isArchived:false` to
 *      restore. Default cannot be archived (`DEFAULT_REQUIRED`).
 */
import { z } from "zod";
import { internal } from "../../../_generated/api";
import type { Id } from "../../../_generated/dataModel";
import { defineCapability } from "../../../ai/registry/define";
import { defineGroup } from "../../../ai/registry/groups";
import { ok } from "../../../ai/registry/result";

const NAME_MAX_LEN = 40;
const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

// ─── Group playbook ─────────────────────────────────────────────────────────

defineGroup({
	name: "categories",
	playbook: `Read first → \`list_categories\` returns the org's note taxonomy with id + name + bgColor + textColor + position + isDefault + isArchived. Use BEFORE every write so you have current ids; the notes group also routes through here when a user names a category by string.

Create vs update vs archive vs delete — pick the right verb:
  · \`create_note_category\` for a brand-new bucket. Names ≤40 chars; bgColor must be #RGB or #RRGGBB hex; the mutation rejects malformed values.
  · \`update_note_category\` to rename / recolour. Renames reject duplicates (per-org name uniqueness).
  · \`archive_note_category\` is the soft-disable: pass \`isArchived:true\` to hide from kanban, \`false\` to restore. Default category cannot be archived (\`DEFAULT_REQUIRED\`).
  · \`reorder_note_categories\` sets the kanban-column display order via the full id list.
  · \`set_default_category\` makes ONE category the org default; the previous default is demoted automatically. Archived categories cannot be made default.
  · \`delete_note_category\` is HARD-delete and is BLOCKED when ANY note references the category (\`IN_USE\`) — archive instead. Default cannot be deleted (reassign first).

Permission: every write needs \`notes.categories.manage\` (Owner / Admin). Reads need \`notes.categories.view\` OR \`notes.view\`.`,
});

// ─── list_categories ────────────────────────────────────────────────────────

const listCategories = defineCapability<{ includeArchived?: boolean }>({
	name: "list_categories",
	module: "noteCategories",
	group: "categories",
	permission: "notes.categories.view",
	risk: "safe",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"Read every note category for the org. Returns id + name + bgColor + textColor + position + isDefault + isArchived. Pass `includeArchived:true` to see soft-archived buckets too.",
		whenNotToCall:
			"the user wants the notes themselves — that's `list_org_notes` (notes group).",
		synonyms: ["categories", "note categories", "kanban columns", "list categories"],
		goodExample: { includeArchived: false },
	},
	drive: {
		onSuccess:
			"Narrate the count + name the default category. The result card carries the full list.",
		onEmpty: "If 0, suggest `create_note_category` to seed.",
	},
	input: z.object({
		includeArchived: z
			.boolean()
			.optional()
			.default(false)
			.describe("If true, archived categories are returned alongside active ones."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const rows = (await ctx.runQuery(
			internal.crm.shared.noteCategories.queries.listForOrgForAI,
			{
				orgId: principal.orgId,
				userId: principal.userId,
				includeArchived: args.includeArchived ?? false,
			},
		)) as Array<{
			_id: string;
			name: string;
			bgColor: string;
			textColor?: string;
			position: number;
			isDefault: boolean;
			isArchived: boolean;
		}>;
		if (rows.length === 0) {
			return ok({
				headline: "No note categories.",
				facts: ["Use `create_note_category` to seed one."],
				data: { categories: [] as unknown[] },
			});
		}
		const def = rows.find((c) => c.isDefault);
		return ok({
			headline: `${rows.length} categor${rows.length === 1 ? "y" : "ies"}.`,
			changes: rows.map((c) => ({
				label: c.name,
				value: `${c.bgColor}${c.isDefault ? " · default" : ""}${c.isArchived ? " · archived" : ""}`,
				emphasis: "unchanged" as const,
			})),
			...(def ? { facts: [`Default: ${def.name}.`] } : {}),
			data: { categories: rows },
		});
	},
});

// ─── create_note_category ───────────────────────────────────────────────────

const createNoteCategory = defineCapability<{
	name: string;
	bgColor: string;
	textColor?: string;
}>({
	name: "create_note_category",
	module: "noteCategories",
	group: "categories",
	permission: "notes.categories.manage",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Create a new note category (a kanban column on the notes board). Names ≤40 chars, bgColor is required hex (#RGB or #RRGGBB). textColor is optional — when omitted, the UI picks a contrast colour.",
		whenNotToCall:
			"a category with the same name exists — call `update_note_category` to rename / recolour.",
		requiredClarifications: ["name", "bgColor"],
		synonyms: ["add category", "new category", "create category"],
		goodExample: { name: "Decisions", bgColor: "#0ea5e9", textColor: "#ffffff" },
		badExample: {
			args: { name: "Decisions", bgColor: "blue" },
			why: "bgColor must be a hex string like #0ea5e9 or #fff.",
		},
	},
	drive: {
		onSuccess:
			"Confirm with the new category's name + colour. Offer to make it the default if the user signals it.",
		onValidationError:
			"`DUPLICATE` → the name exists; switch to `update_note_category` against the surfaced id.",
	},
	input: z.object({
		name: z
			.string()
			.min(1)
			.max(NAME_MAX_LEN)
			.describe(`Category name (1–${NAME_MAX_LEN} chars).`),
		bgColor: z
			.string()
			.regex(HEX_COLOR, "bgColor must be a hex colour (e.g. #0ea5e9 or #abc).")
			.describe("Background colour, hex format (#RGB or #RRGGBB)."),
		textColor: z
			.string()
			.regex(HEX_COLOR, "textColor must be a hex colour (e.g. #ffffff or #000).")
			.optional()
			.describe("Optional text colour, hex format. Auto-contrasted when omitted."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const categoryId = (await ctx.runMutation(
			internal.crm.shared.noteCategories.mutations.createForAI,
			{
				orgId: principal.orgId,
				userId: principal.userId,
				name: args.name,
				bgColor: args.bgColor,
				textColor: args.textColor,
			},
		)) as Id<"noteCategories">;
		return ok({
			headline: `Created category "${args.name}".`,
			changes: [
				{ label: "Category", value: args.name, emphasis: "added" },
				{ label: "Background", value: args.bgColor, emphasis: "added" },
				...(args.textColor
					? [{ label: "Text", value: args.textColor, emphasis: "added" as const }]
					: []),
			],
			data: { categoryId, name: args.name },
		});
	},
});

// ─── update_note_category ───────────────────────────────────────────────────

const updateNoteCategory = defineCapability<{
	categoryId: string;
	name?: string;
	bgColor?: string;
	textColor?: string;
}>({
	name: "update_note_category",
	module: "noteCategories",
	group: "categories",
	permission: "notes.categories.manage",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall: "Rename and / or recolour an existing note category.",
		whenNotToCall:
			"the user wants to archive (use `archive_note_category`), reorder columns (use `reorder_note_categories`), or make it default (use `set_default_category`).",
		requiredClarifications: ["categoryId"],
		synonyms: ["edit category", "rename category", "recolour category"],
		goodExample: { categoryId: "k123abc", bgColor: "#10b981" },
		badExample: {
			args: { categoryId: "k123abc" },
			why: "At least one of name / bgColor / textColor must be supplied.",
		},
	},
	drive: {
		onSuccess: "Confirm with only the fields that actually changed.",
	},
	input: z
		.object({
			categoryId: z.string().min(1).describe("The category's Convex _id."),
			name: z.string().min(1).max(NAME_MAX_LEN).optional().describe("New category name."),
			bgColor: z.string().regex(HEX_COLOR).optional().describe("New background hex colour."),
			textColor: z.string().regex(HEX_COLOR).optional().describe("New text hex colour."),
		})
		.refine(
			(v) => v.name !== undefined || v.bgColor !== undefined || v.textColor !== undefined,
			{ message: "At least one of name / bgColor / textColor must be supplied." },
		),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.crm.shared.noteCategories.mutations.updateForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			categoryId: args.categoryId as Id<"noteCategories">,
			...(args.name !== undefined ? { name: args.name } : {}),
			...(args.bgColor !== undefined ? { bgColor: args.bgColor } : {}),
			...(args.textColor !== undefined ? { textColor: args.textColor } : {}),
		});
		const changes: { label: string; value: string; emphasis: "changed" }[] = [];
		if (args.name !== undefined)
			changes.push({ label: "Name", value: args.name, emphasis: "changed" });
		if (args.bgColor !== undefined)
			changes.push({ label: "Background", value: args.bgColor, emphasis: "changed" });
		if (args.textColor !== undefined)
			changes.push({ label: "Text", value: args.textColor, emphasis: "changed" });
		return ok({
			headline: "Category updated.",
			changes,
			data: { categoryId: args.categoryId },
		});
	},
});

// ─── archive_note_category ──────────────────────────────────────────────────

const archiveNoteCategory = defineCapability<{
	categoryId: string;
	isArchived: boolean;
}>({
	name: "archive_note_category",
	module: "noteCategories",
	group: "categories",
	permission: "notes.categories.manage",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Soft-archive (or restore) a category. Pass `isArchived:true` to hide from kanban / new-note picker; `false` to restore. Existing notes keep their categoryId — only the column visibility changes. The default category cannot be archived (`DEFAULT_REQUIRED`).",
		whenNotToCall:
			"the user wants to delete the category permanently — use `delete_note_category` (only when zero notes reference it).",
		requiredClarifications: ["categoryId", "isArchived"],
		synonyms: ["archive category", "restore category", "hide category"],
		goodExample: { categoryId: "k123abc", isArchived: true },
	},
	drive: {
		onSuccess: "Confirm 'Archived.' or 'Restored.' depending on `isArchived`.",
		onValidationError:
			"`DEFAULT_REQUIRED` → tell the user another category must be promoted to default first; offer `set_default_category`.",
	},
	input: z.object({
		categoryId: z.string().min(1).describe("The category's Convex _id."),
		isArchived: z
			.boolean()
			.describe("`true` archives the category; `false` restores an archived one."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.crm.shared.noteCategories.mutations.setArchivedForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			categoryId: args.categoryId as Id<"noteCategories">,
			isArchived: args.isArchived,
		});
		return ok({
			headline: args.isArchived ? "Category archived." : "Category restored.",
			changes: [
				{ label: "Category", value: args.categoryId, emphasis: "unchanged" },
				{
					label: "State",
					value: args.isArchived ? "Archived" : "Active",
					emphasis: "changed",
				},
			],
			data: { categoryId: args.categoryId, isArchived: args.isArchived },
		});
	},
});

// ─── reorder_note_categories ────────────────────────────────────────────────

const reorderNoteCategories = defineCapability<{ categoryIds: string[] }>({
	name: "reorder_note_categories",
	module: "noteCategories",
	group: "categories",
	permission: "notes.categories.manage",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Set the kanban-column display order by passing every category id in the desired order. Categories not in the list keep their current position (silent partial-reorder).",
		whenNotToCall:
			"the user wants to add or remove a category (use `create_note_category` / `delete_note_category`).",
		requiredClarifications: ["categoryIds"],
		synonyms: ["reorder categories", "rearrange columns", "sort categories"],
		goodExample: {
			categoryIds: ["k_general", "k_decisions", "k_followups", "k_archive"],
		},
	},
	drive: {
		onSuccess: "Confirm with the count + first 3 category names if you have them.",
	},
	input: z.object({
		categoryIds: z
			.array(z.string().min(1))
			.min(1)
			.describe("Category ids in the desired order."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.crm.shared.noteCategories.mutations.reorderForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			categoryIds: args.categoryIds as Id<"noteCategories">[],
		});
		return ok({
			headline: `Reordered ${args.categoryIds.length} categor${args.categoryIds.length === 1 ? "y" : "ies"}.`,
			changes: args.categoryIds.map((id, i) => ({
				label: `Position ${i + 1}`,
				value: id,
				emphasis: "changed" as const,
			})),
			data: { categoryIds: args.categoryIds },
		});
	},
});

// ─── set_default_category ───────────────────────────────────────────────────

const setDefaultCategory = defineCapability<{ categoryId: string }>({
	name: "set_default_category",
	module: "noteCategories",
	group: "categories",
	permission: "notes.categories.manage",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Promote one category to the org default. The previous default is demoted automatically. Archived categories cannot be made default — restore them first.",
		whenNotToCall:
			"this category is already the default — the call would be a no-op (the mutation handles it idempotently but the model should know).",
		requiredClarifications: ["categoryId"],
		synonyms: ["set default", "make default category", "default note category"],
		goodExample: { categoryId: "k123abc" },
	},
	drive: {
		onSuccess: "Confirm with the new default category's name in one short sentence.",
		onValidationError:
			"`ARCHIVED` → tell the user the category is archived; offer `archive_note_category` with `isArchived:false` first.",
	},
	input: z.object({
		categoryId: z.string().min(1).describe("The category's Convex _id."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.crm.shared.noteCategories.mutations.setDefaultForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			categoryId: args.categoryId as Id<"noteCategories">,
		});
		return ok({
			headline: "Default category updated.",
			changes: [{ label: "Default", value: args.categoryId, emphasis: "changed" }],
			data: { categoryId: args.categoryId },
		});
	},
});

// ─── delete_note_category ───────────────────────────────────────────────────

const deleteNoteCategory = defineCapability<{ categoryId: string }>({
	name: "delete_note_category",
	module: "noteCategories",
	group: "categories",
	permission: "notes.categories.manage",
	// Reversible: HARD-deletes the row but BLOCKED when any note references
	// it (mutation throws IN_USE). The audit log preserves the trail. Matches
	// the S6 `delete_note` rationale.
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Hard-delete a note category. ONLY succeeds when zero notes reference it (the mutation throws `IN_USE` otherwise) AND it isn't the org default (`DEFAULT_REQUIRED` — reassign first).",
		whenNotToCall:
			"any notes reference the category — call `archive_note_category` instead, OR move the notes via `set_note_category`.",
		requiredClarifications: ["categoryId"],
		synonyms: ["delete category", "remove category", "drop category"],
		goodExample: { categoryId: "k123abc" },
	},
	drive: {
		onSuccess: "Confirm in one short sentence.",
		onValidationError:
			"`IN_USE` → list the count of notes still referencing it; offer to archive OR move the notes via `set_note_category`. `DEFAULT_REQUIRED` → tell the user another category must be promoted first; offer `set_default_category`.",
	},
	input: z.object({
		categoryId: z.string().min(1).describe("The category's Convex _id."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.crm.shared.noteCategories.mutations.removeForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			categoryId: args.categoryId as Id<"noteCategories">,
		});
		return ok({
			headline: "Category deleted.",
			changes: [
				{ label: "Category", value: args.categoryId, emphasis: "unchanged" },
				{ label: "State", value: "deleted", emphasis: "changed" },
			],
			data: { categoryId: args.categoryId },
		});
	},
});

// ─── Public surface ─────────────────────────────────────────────────────────

export const NOTE_CATEGORIES_CAPABILITIES = [
	listCategories,
	createNoteCategory,
	updateNoteCategory,
	archiveNoteCategory,
	reorderNoteCategories,
	setDefaultCategory,
	deleteNoteCategory,
];
