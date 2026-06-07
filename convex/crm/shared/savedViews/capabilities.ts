/**
 * Saved-view capabilities — the AI-callable surface for filter presets that
 * pin to the sidebar. Wraps the existing `*ForAI` internal twins; never
 * re-implements business logic.
 *
 * Surface (5 caps in the `views` group):
 *
 *   list_saved_views   user-visible views (their personal + every org view)
 *   create_saved_view  user- or org-scoped (RBAC checked at write time)
 *   update_saved_view  patch name / filters / sort / columns
 *   pin_saved_view     toggle pin (returns the new state)
 *   delete_saved_view  hard-delete (creator-only for personal, admin for org)
 *
 * Group invariants (also baked into the playbook below — keep in sync):
 *
 *   1. `filters` is a JSON STRING (the table column is a string, parsed by
 *      consumers). The capability accepts `filters` as a structured object
 *      and stringifies it before calling the mutation; the mutation also
 *      validates the JSON and rejects malformed strings with `INVALID_FILTERS`.
 *   2. Scope split: `scope:'org'` requires `savedViews.createOrg`; `scope:'user'`
 *      requires `savedViews.createPersonal`. The capability declares the lower
 *      bar (`createPersonal`) for visibility; the mutation enforces the higher
 *      bar at write time and returns `business_error` if the user lacks it.
 *   3. Personal view edits are creator-only (the mutation throws FORBIDDEN
 *      if a different user attempts). Org-view edits require
 *      `savedViews.createOrg`. Org-view DELETIONS additionally require
 *      `savedViews.delete`.
 *   4. `togglePin` is a flip — re-calling it toggles back. The capability
 *      surfaces the new state in `data.isPinned` so the model can confirm
 *      "Pinned." vs "Unpinned." correctly.
 *   5. Risk: every write is reversible (delete is recoverable by recreating;
 *      no data references leak). No 2FA needed.
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
import { ok, repair } from "../../../ai/registry/result";

const SCOPE = z.enum(["user", "org"]);
const SORT_ORDER = z.enum(["asc", "desc"]);

// ─── Group playbook ─────────────────────────────────────────────────────────

defineGroup({
	name: "views",
	playbook: `Read first → \`list_saved_views\` returns the views the current user can see (their personal + every org view, optionally filtered by entityType). Use BEFORE every update/pin/delete to get a real \`viewId\`.

Create → \`create_saved_view\` accepts a structured \`filters\` object; the capability stringifies + validates server-side. Pass \`scope:'user'\` (default) for a personal view; \`scope:'org'\` requires \`savedViews.createOrg\` and the mutation returns business_error if the user lacks it.

Update vs pin vs delete — pick the right verb:
  · \`update_saved_view\` for name / filters / sort / columns. Personal views are creator-only.
  · \`pin_saved_view\` toggles the pin and surfaces the NEW state in \`data.isPinned\` — read it to say "Pinned." vs "Unpinned." correctly.
  · \`delete_saved_view\` HARD-deletes. Personal views are creator-only; org views need \`savedViews.delete\`.

Permission split: \`savedViews.createPersonal\` opens the group; \`savedViews.createOrg\` is needed for org-scoped writes; \`savedViews.delete\` is needed for org-scoped deletes (creator can always delete their own personal view).`,
});

// ─── list_saved_views ───────────────────────────────────────────────────────

const listSavedViews = defineCapability<{
	entityType?: string;
}>({
	name: "list_saved_views",
	module: "savedViews",
	group: "views",
	permission: "savedViews.view",
	risk: "safe",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"List the saved views visible to the current user. Returns BOTH the user's personal views AND every org-scoped view, optionally filtered by entityType. Each row carries the viewId, name, scope, isPinned, filters (JSON string), sort, columns.",
		whenNotToCall:
			"the user wants to use a saved view as a filter predicate — pass the view's `filters` to whatever read tool needs them; this verb just lists views.",
		synonyms: ["saved views", "filter presets", "list views", "my views", "pinned views"],
		goodExample: { entityType: "lead" },
	},
	drive: {
		onSuccess: "Narrate the count + show top 5 by recency. Pinned views first.",
		onEmpty: "If 0 views, suggest `create_saved_view` to seed.",
	},
	input: z.object({
		entityType: entityTypeSchema()
			.optional()
			.describe(
				"Optional filter — only views for this entity. Accepts the canonical entity type string (e.g. 'lead', 'deal') or an org-relabelled alias from describe_workspace.",
			),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		// Runtime validation against the org's enabled entity types
		// (replaces the static z.enum). The 4-core constraint is
		// applied via `restrictTo` because the underlying mutations
		// only support those 4 today; when entity5/entity6 backend
		// lands, drop the `restrictTo` here.
		let validatedEntityType: string | undefined;
		if (args.entityType !== undefined) {
			const validated = await validateEntityType(cap, args.entityType, {
				restrictTo: CORE_ENTITY_TYPES,
			});
			if (isEntityTypeError(validated)) return validated;
			validatedEntityType = validated.entityType;
		}
		const rows = (await ctx.runQuery(internal.crm.shared.savedViews.queries.listForUserForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			...(validatedEntityType !== undefined ? { entityType: validatedEntityType } : {}),
		})) as Array<{
			_id: string;
			name: string;
			entityType: string;
			scope: "user" | "org";
			isPinned: boolean;
			createdAt: number;
		}>;
		if (rows.length === 0) {
			return ok({
				headline: "No saved views.",
				facts: ["Use `create_saved_view` to seed one."],
				data: { views: [] as unknown[] },
			});
		}
		// Sort: pinned first, then most-recent.
		const sorted = rows.slice().sort((a, b) => {
			if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
			return b.createdAt - a.createdAt;
		});
		const top = sorted.slice(0, 5);
		return ok({
			headline: `${rows.length} saved view${rows.length === 1 ? "" : "s"}.`,
			changes: top.map((v) => ({
				label: v.name,
				value: `${v.entityType} · ${v.scope}${v.isPinned ? " · pinned" : ""}`,
				emphasis: "unchanged" as const,
			})),
			data: { views: sorted },
		});
	},
});

// ─── create_saved_view ──────────────────────────────────────────────────────

const createSavedView = defineCapability<{
	name: string;
	entityType: string;
	scope?: "user" | "org";
	filters: Record<string, unknown>;
	sortBy?: string;
	sortOrder?: "asc" | "desc";
	columns?: string[];
	isPinned?: boolean;
}>({
	name: "create_saved_view",
	module: "savedViews",
	group: "views",
	// The lower-bar permission so the capability is visible to anyone who
	// can save a personal view. Org-scope writes are gated server-side and
	// the mutation throws if the user lacks `savedViews.createOrg`.
	permission: "savedViews.createPersonal",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Save a filter preset for an entity list. Default scope is `user` (visible only to the creator); pass `scope:'org'` to share workspace-wide (requires `savedViews.createOrg`). The `filters` argument is a structured object — the capability stringifies it and the mutation validates the JSON.",
		whenNotToCall:
			"the user wants to apply a filter without saving (just pass the filter to the read tool directly).",
		requiredClarifications: ["name", "entityType", "filters"],
		synonyms: ["save view", "create saved view", "save filter", "save preset"],
		goodExample: {
			name: "My hot leads",
			entityType: "lead",
			scope: "user",
			filters: { status: "hot", assignedTo: "me" },
			sortBy: "updatedAt",
			sortOrder: "desc",
			isPinned: true,
		},
		badExample: {
			args: { name: "Hot leads", entityType: "lead" },
			why: "filters must be supplied (even if empty `{}`) so the saved view is well-defined.",
		},
	},
	drive: {
		onSuccess:
			"Confirm with the view's name + scope. Offer to pin it if the caller didn't already.",
		onValidationError:
			"`INVALID_FILTERS` → the stringified filters didn't parse as JSON; that's a capability bug — surface verbatim.",
		onDenied:
			"For org scope: tell the user they need savedViews.createOrg. For personal: savedViews.createPersonal.",
	},
	input: z.object({
		name: z.string().min(1).describe("View display name."),
		entityType: entityTypeSchema().describe(
			"Which entity list this view filters. Accepts the canonical type or an org-relabelled alias from describe_workspace.",
		),
		scope: SCOPE.optional()
			.default("user")
			.describe("`user` (creator-only) or `org` (workspace-wide). Defaults to `user`."),
		filters: z
			.record(z.string(), z.unknown())
			.describe(
				"Structured filter object. Stringified before save; the mutation validates the JSON.",
			),
		sortBy: z.string().optional().describe("Field name to sort by (e.g. `updatedAt`)."),
		sortOrder: SORT_ORDER.optional().describe("`asc` or `desc`."),
		columns: z
			.array(z.string().min(1))
			.optional()
			.describe("Optional column-id list for the table view (overrides default columns)."),
		isPinned: z
			.boolean()
			.optional()
			.describe("If true, the view appears in the sidebar's pinned section after creation."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		// Runtime validation — see listSavedViews for rationale.
		const validated = await validateEntityType(cap, args.entityType, {
			restrictTo: CORE_ENTITY_TYPES,
		});
		if (isEntityTypeError(validated)) return validated;
		const entityType = validated.entityType;
		// Stringify filters once — the mutation expects a string + validates the JSON.
		let filtersJson: string;
		try {
			filtersJson = JSON.stringify(args.filters ?? {});
		} catch {
			return repair(
				"filters",
				"a JSON-serialisable object",
				typeof args.filters,
				"Pass `filters` as a plain object — keys are field names, values are filter primitives.",
				{ status: "hot" },
			);
		}
		const viewId = (await ctx.runMutation(
			internal.crm.shared.savedViews.mutations.createForAI,
			{
				orgId: principal.orgId,
				userId: principal.userId,
				name: args.name,
				entityType,
				scope: args.scope ?? "user",
				filters: filtersJson,
				sortBy: args.sortBy,
				sortOrder: args.sortOrder,
				columns: args.columns,
				isPinned: args.isPinned,
			},
		)) as Id<"savedViews">;
		return ok({
			headline: `Saved view "${args.name}".`,
			changes: [
				{ label: "View", value: args.name, emphasis: "added" },
				{ label: "Entity", value: entityType, emphasis: "added" },
				{ label: "Scope", value: args.scope ?? "user", emphasis: "added" },
				...(args.isPinned
					? [{ label: "Pinned", value: "yes", emphasis: "added" as const }]
					: []),
			],
			data: { viewId, scope: args.scope ?? "user" },
			suggestedNext: args.isPinned
				? []
				: [
						{
							label: "Pin to sidebar",
							intent: `Pin the "${args.name}" saved view to the sidebar`,
						},
					],
		});
	},
});

// ─── update_saved_view ──────────────────────────────────────────────────────

const updateSavedView = defineCapability<{
	viewId: string;
	name?: string;
	filters?: Record<string, unknown>;
	sortBy?: string;
	sortOrder?: "asc" | "desc";
	columns?: string[];
}>({
	name: "update_saved_view",
	module: "savedViews",
	group: "views",
	permission: "savedViews.createPersonal",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Patch one saved view's name / filters / sort / columns. Personal views are creator-only — the mutation throws FORBIDDEN otherwise. Org views require `savedViews.createOrg`.",
		whenNotToCall:
			"the user wants to pin/unpin (use `pin_saved_view`) OR delete (use `delete_saved_view`).",
		requiredClarifications: ["viewId"],
		synonyms: ["edit view", "update view", "rename view", "tweak filter"],
		goodExample: {
			viewId: "k123abc",
			filters: { status: "hot", assignedTo: "me", region: "EU" },
		},
		badExample: {
			args: { viewId: "k123abc" },
			why: "At least one editable field (name/filters/sortBy/sortOrder/columns) must be supplied.",
		},
	},
	drive: {
		onSuccess: "Confirm with only the fields that actually changed.",
	},
	input: z
		.object({
			viewId: z
				.string()
				.min(1)
				.describe("The saved view's Convex _id (from list_saved_views)."),
			name: z.string().min(1).optional().describe("New view name."),
			filters: z
				.record(z.string(), z.unknown())
				.optional()
				.describe("REPLACE the filter object. Stringified before save."),
			sortBy: z.string().optional().describe("Field name to sort by."),
			sortOrder: SORT_ORDER.optional().describe("`asc` or `desc`."),
			columns: z.array(z.string().min(1)).optional().describe("REPLACE the column id list."),
		})
		.refine(
			(v) =>
				v.name !== undefined ||
				v.filters !== undefined ||
				v.sortBy !== undefined ||
				v.sortOrder !== undefined ||
				v.columns !== undefined,
			{ message: "At least one editable field must be supplied." },
		),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		let filtersJson: string | undefined;
		if (args.filters !== undefined) {
			try {
				filtersJson = JSON.stringify(args.filters);
			} catch {
				return repair(
					"filters",
					"a JSON-serialisable object",
					typeof args.filters,
					"Pass `filters` as a plain object — keys are field names, values are filter primitives.",
					{ status: "hot" },
				);
			}
		}
		await ctx.runMutation(internal.crm.shared.savedViews.mutations.updateForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			viewId: args.viewId as Id<"savedViews">,
			...(args.name !== undefined ? { name: args.name } : {}),
			...(filtersJson !== undefined ? { filters: filtersJson } : {}),
			...(args.sortBy !== undefined ? { sortBy: args.sortBy } : {}),
			...(args.sortOrder !== undefined ? { sortOrder: args.sortOrder } : {}),
			...(args.columns !== undefined ? { columns: args.columns } : {}),
		});
		const changes: { label: string; value: string; emphasis: "changed" }[] = [];
		if (args.name !== undefined)
			changes.push({ label: "Name", value: args.name, emphasis: "changed" });
		if (args.filters !== undefined)
			changes.push({
				label: "Filters",
				value: `${Object.keys(args.filters).length} key${Object.keys(args.filters).length === 1 ? "" : "s"}`,
				emphasis: "changed",
			});
		if (args.sortBy !== undefined)
			changes.push({ label: "Sort by", value: args.sortBy, emphasis: "changed" });
		if (args.sortOrder !== undefined)
			changes.push({ label: "Sort order", value: args.sortOrder, emphasis: "changed" });
		if (args.columns !== undefined)
			changes.push({
				label: "Columns",
				value: `${args.columns.length} column${args.columns.length === 1 ? "" : "s"}`,
				emphasis: "changed",
			});
		return ok({
			headline: "Saved view updated.",
			changes,
			data: { viewId: args.viewId },
		});
	},
});

// ─── pin_saved_view ─────────────────────────────────────────────────────────

const pinSavedView = defineCapability<{ viewId: string }>({
	name: "pin_saved_view",
	module: "savedViews",
	group: "views",
	permission: "savedViews.view",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Toggle a view's pinned state. Surface the new state from `data.isPinned` to confirm 'Pinned.' vs 'Unpinned.' correctly. Personal views: creator-only (the mutation throws FORBIDDEN otherwise).",
		whenNotToCall:
			"the user wants to set a different sort or filter (use `update_saved_view`).",
		requiredClarifications: ["viewId"],
		synonyms: ["pin view", "unpin view", "favourite view"],
		goodExample: { viewId: "k123abc" },
	},
	drive: {
		onSuccess: "Read `data.isPinned` and reply 'Pinned.' or 'Unpinned.' accordingly.",
	},
	input: z.object({
		viewId: z.string().min(1).describe("The saved view's Convex _id."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		// togglePinForAI returns void; the new state is on the row. Re-fetch
		// is unnecessary because list_saved_views surfaces it fresh; but the
		// model's confirmation needs the state inline. Read the row back.
		await ctx.runMutation(internal.crm.shared.savedViews.mutations.togglePinForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			viewId: args.viewId as Id<"savedViews">,
		});
		// Listing again is the cheapest way to read back the pinned state
		// without exposing a dedicated `getById` *ForAI surface (which doesn't
		// exist yet). The list is already filtered by the permission check.
		const rows = (await ctx.runQuery(internal.crm.shared.savedViews.queries.listForUserForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
		})) as Array<{ _id: string; isPinned: boolean }>;
		const isPinned = rows.find((v) => v._id === args.viewId)?.isPinned ?? false;
		return ok({
			headline: isPinned ? "View pinned." : "View unpinned.",
			changes: [
				{ label: "View", value: args.viewId, emphasis: "unchanged" },
				{
					label: "State",
					value: isPinned ? "Pinned" : "Unpinned",
					emphasis: "changed",
				},
			],
			data: { viewId: args.viewId, isPinned },
		});
	},
});

// ─── delete_saved_view ──────────────────────────────────────────────────────

const deleteSavedView = defineCapability<{ viewId: string }>({
	name: "delete_saved_view",
	module: "savedViews",
	group: "views",
	permission: "savedViews.createPersonal",
	risk: "reversible",
	channels: ["chat", "mcp", "rest"],
	spec: {
		whenToCall:
			"Hard-delete a saved view. Personal views: creator-only. Org views require `savedViews.delete`.",
		whenNotToCall:
			"the user wants to unpin a pinned view (use `pin_saved_view` to toggle off — keeps the view).",
		requiredClarifications: ["viewId"],
		synonyms: ["delete view", "remove view", "drop view"],
		goodExample: { viewId: "k123abc" },
	},
	drive: {
		onSuccess: "Confirm in one short sentence.",
		onValidationError:
			"`FORBIDDEN` → the user isn't the creator (personal view) or lacks savedViews.delete (org view). Surface the constraint.",
	},
	input: z.object({
		viewId: z.string().min(1).describe("The saved view's Convex _id."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		await ctx.runMutation(internal.crm.shared.savedViews.mutations.removeForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			viewId: args.viewId as Id<"savedViews">,
		});
		return ok({
			headline: "Saved view deleted.",
			changes: [
				{ label: "View", value: args.viewId, emphasis: "unchanged" },
				{ label: "State", value: "deleted", emphasis: "changed" },
			],
			data: { viewId: args.viewId },
		});
	},
});

// ─── Public surface ─────────────────────────────────────────────────────────

export const SAVED_VIEWS_CAPABILITIES = [
	listSavedViews,
	createSavedView,
	updateSavedView,
	pinSavedView,
	deleteSavedView,
];
