/**
 * convex/ai/tools/layers/settings.ts — Workspace settings tools.
 */
import { z } from "zod";
import { internal } from "../../../_generated/api";
import { entityTypeEnum } from "../../../_shared/synonyms";
import { validateDashboardLayout, WIDGET_KEYS, WIDGETS } from "../../../_shared/widgetRegistry";
import { registerTool } from "../../toolRegistry";
import { propose, requirePermission, runTool, type ToolContext, toolMutation } from "../_shared";

let _ctx: ToolContext | null = null;
export function setSettingsContext(c: ToolContext): void {
	_ctx = c;
}
function getCtx(): ToolContext {
	if (!_ctx) throw new Error("settings ctx");
	return _ctx;
}

/**
 * Allowlist of top-level keys accepted by `orgs.settings`. Mirrors the
 * `settings` validator in `convex/orgs/mutations.ts::orgUpdateArgs.settings`.
 *
 * 2026-05-30 regression: a model (NVIDIA Llama-3.3-70B) hallucinated
 * `entitySettings: { lead: { view: "board" }, ... }` for the request
 * "show board view for all entities". The tool happily forwarded the
 * unknown top-level key because the schema was `z.record(z.string(),
 * z.unknown())` — every key allowed. Convex's validator rejected the
 * payload at the mutation layer with `Object contains extra field
 * entitySettings that is not in the validator`, surfacing as
 * "Tool tried to save with an unexpected field" in chat.
 *
 * The allowlist below is enforced BOTH in the propose handler (so the
 * approval card never shows fields that will fail at commit time) AND
 * in the commit handler (defence-in-depth — the persisted payload could
 * be tampered with between propose and commit). Adding a new
 * `orgs.settings.*` field requires:
 *   1. Update the validator in `orgs/mutations.ts`.
 *   2. Add the key here.
 *   3. (Optional) Add a dedicated tool if it needs special read-merge-write
 *      handling (see `set_entity_default_view` for `modules`).
 */
const ALLOWED_ORG_SETTINGS_KEYS = new Set<string>([
	"defaultCurrency",
	"timezone",
	"leadStaleAfterDays",
	"badgeCountsVisible",
	"codePrefixes",
	"modules",
	"taskDefaults",
	"briefingDefaults",
	"fileUpload",
	"dashboardMetrics",
	"softDeleteRetentionDays",
	"mockDataSeededAt",
	"mockDataDismissedAt",
	"deletionScheduledAt",
]);

/**
 * Filter a settings patch against the allowlist. Returns the kept keys
 * and the rejected ones so callers can surface a friendly error that
 * tells the model which key was unknown + which keys ARE supported.
 */
function filterAllowedSettingsKeys(patch: Record<string, unknown>): {
	kept: Record<string, unknown>;
	rejected: string[];
} {
	const kept: Record<string, unknown> = {};
	const rejected: string[] = [];
	for (const [k, v] of Object.entries(patch)) {
		if (ALLOWED_ORG_SETTINGS_KEYS.has(k)) {
			kept[k] = v;
		} else {
			rejected.push(k);
		}
	}
	return { kept, rejected };
}

registerTool({
	name: "update_org_settings",
	layer: "settings",
	permission: "org.editSettings",
	requiredCapability: "premium",
	confirmation: "twoStep",
	approvalCategory: "settings",
	description: `Update workspace settings. Pass the patch object with only these top-level keys: ${Array.from(ALLOWED_ORG_SETTINGS_KEYS).join(", ")}. For per-entity DEFAULT VIEW (list vs board), use \`set_entity_default_view\` instead — this tool can't merge a single slot into the modules[] array.`,
	runbook: {
		onSuccess: "Confirm with the keys that were updated. Don't restate every value.",
		onPermissionDenied:
			"Tell the user they need org.editSettings permission. Suggest contacting an admin.",
		onValidationError:
			"If `patch` is missing or empty, ask the user which specific setting they want to change before retrying. NEVER call this tool with an empty patch. If the error mentions an unknown key (e.g. `entitySettings`), the message lists the supported keys — pick one of those, or call the dedicated tool the message mentions (e.g. `set_entity_default_view` for per-entity board/list view).",
	},
	schema: z.object({
		patch: z.record(z.string(), z.unknown()).refine((p) => Object.keys(p).length > 0, {
			message:
				"patch must contain at least one setting key. Ask the user what to change first.",
		}),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "org.editSettings");
		// Defensive: zod refine should catch this, but if a future schema
		// loosens the rule we still want a friendly error here rather than
		// a crashed pickSettingsSection downstream.
		if (!args.patch || typeof args.patch !== "object" || Object.keys(args.patch).length === 0) {
			return {
				ok: false as const,
				error: "patch is empty — ask the user which specific setting to change before calling update_org_settings.",
				code: "EMPTY_PATCH",
			};
		}
		const { kept, rejected } = filterAllowedSettingsKeys(args.patch);
		if (rejected.length > 0) {
			return {
				ok: false as const,
				error: `Unknown settings key(s): ${rejected.map((k) => `\`${k}\``).join(", ")}. Allowed top-level keys: ${Array.from(ALLOWED_ORG_SETTINGS_KEYS).join(", ")}. For per-entity DEFAULT VIEW (board vs list), call \`set_entity_default_view\` instead. For dashboard layout, call \`update_dashboard_layout\`. For entity labels, call \`rename_entity_labels\`.`,
				code: "UNKNOWN_SETTINGS_KEY",
			};
		}
		return propose(
			"update_org_settings",
			{ patch: kept },
			{
				title: "Update workspace settings",
				fields: Object.entries(kept).map(([k, v]) => ({ label: k, value: String(v) })),
			},
		);
	},
});

registerTool({
	name: "commit_update_org_settings",
	layer: "settings",
	permission: "org.editSettings",
	confirmation: "none",
	description: "Internal: commit settings update.",
	schema: z.object({ patch: z.record(z.string(), z.unknown()) }),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "org.editSettings");
			// Bug 2026-05-24: if the model previously emitted update_org_settings
			// without a patch (or with patch={}), the persisted confirmationPayload
			// could reach commit time with patch missing. Fail loud here rather
			// than crashing pickSettingsSection on Object.keys(undefined).
			if (
				!args.patch ||
				typeof args.patch !== "object" ||
				Object.keys(args.patch).length === 0
			) {
				return {
					ok: false as const,
					error: "Settings update was approved with an empty patch. Ask the user which specific setting to change and propose again.",
					code: "EMPTY_PATCH",
				};
			}
			// Defence-in-depth: enforce the allowlist a second time at
			// commit. The propose handler already filtered, but a tampered
			// or replayed payload could still slip through.
			const { kept, rejected } = filterAllowedSettingsKeys(args.patch);
			if (rejected.length > 0) {
				return {
					ok: false as const,
					error: `Approved payload contained unknown settings key(s): ${rejected.join(", ")}. Allowed: ${Array.from(ALLOWED_ORG_SETTINGS_KEYS).join(", ")}.`,
					code: "UNKNOWN_SETTINGS_KEY",
				};
			}
			await toolMutation(getCtx(), "orgs/mutations:update", { orgId, settings: kept });
			// Sprint 3 doctrine: emit a `settings` display payload so the
			// chat renders a deep-link card to the affected section. We
			// pick the best-matching section id by inspecting the patch keys.
			const sectionId = pickSettingsSection(kept);
			return {
				ok: true as const,
				data: { patch: kept },
				display: {
					kind: "settings" as const,
					sectionId,
				},
			};
		}),
});

registerTool({
	name: "rename_entity_labels",
	layer: "settings",
	permission: "org.editSettings",
	requiredCapability: "premium",
	confirmation: "twoStep",
	approvalCategory: "settings",
	description:
		"Rename CRM entity labels (e.g. 'Lead' → 'Inquiry'). Pass new singular/plural for any entity.",
	runbook: {
		onSuccess:
			"Confirm with the new singular labels. Mention that the change applies app-wide and the user can refresh to see it everywhere.",
	},
	schema: z.object({
		labels: z.object({
			lead: z.optional(z.object({ singular: z.string(), plural: z.string() })),
			contact: z.optional(z.object({ singular: z.string(), plural: z.string() })),
			deal: z.optional(z.object({ singular: z.string(), plural: z.string() })),
			company: z.optional(z.object({ singular: z.string(), plural: z.string() })),
		}),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "org.editSettings");
		const fields = Object.entries(args.labels).map(([k, v]) => {
			const label = v as { singular?: string; plural?: string } | undefined;
			return {
				label: k,
				value:
					label?.singular && label?.plural ? `${label.singular} / ${label.plural}` : "—",
			};
		});
		return propose("rename_entity_labels", args, {
			title: "Rename entity labels",
			fields,
		});
	},
});

registerTool({
	name: "commit_rename_entity_labels",
	layer: "settings",
	permission: "org.editSettings",
	confirmation: "none",
	description: "Internal: commit entity label rename.",
	schema: z.object({
		labels: z.record(z.string(), z.unknown()),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "org.editSettings");
			await toolMutation(getCtx(), "orgs/mutations:update", {
				orgId,
				entityLabels: args.labels,
			});
			return {
				ok: true as const,
				data: args,
				display: {
					kind: "settings" as const,
					sectionId: "entity-labels",
				},
			};
		}),
});

/**
 * Pick the best matching settings section id for a settings patch.
 * Used so commit_update_org_settings can deep-link to the right page.
 * Defaults to "general" when no specific match.
 *
 * Defensive against null/undefined: returns "general" rather than throwing
 * `Object.keys(undefined)` (which crashed the resume action 2026-05-24
 * when a malformed payload reached the commit handler).
 */
function pickSettingsSection(patch: Record<string, unknown> | null | undefined): string {
	if (!patch || typeof patch !== "object") return "general";
	const keys = Object.keys(patch);
	if (keys.length === 0) return "general";
	if (keys.some((k) => k.includes("currency") || k.includes("timezone"))) return "general";
	if (keys.some((k) => k.includes("dashboardMetrics") || k.includes("modules")))
		return "appearance";
	if (keys.some((k) => k.includes("softDelete") || k.includes("retention")))
		return "data-retention";
	if (keys.some((k) => k.includes("reminder") || k.includes("followUp"))) return "reminders";
	if (keys.some((k) => k.includes("ai"))) return "ai";
	return "general";
}

// ─── update_org_identity ────────────────────────────────────────────────
// AI-native correction (2026-05-24): the agent CAN write the org's static
// identity blob ("About this organisation"). Routes to the personaContext
// internal twin so auth flows correctly through scheduler.runAfter.

registerTool({
	name: "update_org_identity",
	layer: "settings",
	permission: "org.manage",
	requiredCapability: "premium",
	confirmation: "twoStep",
	approvalCategory: "settings",
	description:
		"Update the workspace 'About this organisation' description that the AI assistant uses as static context. Use this for industry, products, customer types, sales process — durable info the AI should always know.",
	runbook: {
		onSuccess:
			"Confirm with a one-line summary of the change ('Saved your workspace description, now ~N chars.'). Don't echo the full text back.",
		onPermissionDenied:
			"Tell the user this requires org.manage permission. Suggest contacting an admin.",
		onValidationError: "If text is empty, ask the user what to write before retrying.",
	},
	schema: z.object({
		identity: z
			.string()
			.min(1)
			.max(10_000)
			.describe(
				"Plain text (≤10 000 chars) describing the business — industry, products, customers, sales process. The AI reads this every turn.",
			),
	}),
	example: {
		identity:
			"We are a B2B SaaS company selling CRM software to mid-market retailers in the GCC. Our typical customer has 50-500 employees…",
	},
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "org.manage");
		return propose("update_org_identity", args, {
			title: "Update workspace AI description",
			fields: [
				{
					label: "Length",
					value: `${args.identity.length} chars`,
				},
				{
					label: "Preview",
					value:
						args.identity.length > 200
							? `${args.identity.slice(0, 200)}…`
							: args.identity,
				},
			],
		});
	},
});

registerTool({
	name: "commit_update_org_identity",
	layer: "settings",
	permission: "org.manage",
	confirmation: "none",
	description: "Internal: commit org identity update.",
	schema: z.object({ identity: z.string() }),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "org.manage");
			await toolMutation(getCtx(), "ai/personaContext:setOrgIdentity", {
				orgId,
				identity: args.identity,
			});
			return {
				ok: true as const,
				data: { length: args.identity.length },
				display: {
					kind: "settings" as const,
					sectionId: "ai",
				},
				summary: {
					headline: `Updated workspace description (${args.identity.length} chars)`,
					table: [
						{
							label: "Stored on",
							value: "aiPersonaContext (org-level)",
						},
					],
					suggestedNext: [
						{
							label: "Open AI settings",
							intent: "Open settings → AI",
						},
					],
				},
			};
		}),
});

// ─── update_dashboard_layout ────────────────────────────────────────────
//
// Phase 4 Part 2 (T8). Lets the AI add / remove / reorder dashboard
// widgets via the same `dashboardMetrics` array the settings UI
// patches. Validates every key against `WIDGET_KEYS` so an unknown
// widget can never sneak in.

registerTool({
	name: "update_dashboard_layout",
	layer: "settings",
	permission: "org.editSettings",
	requiredCapability: "premium",
	confirmation: "twoStep",
	approvalCategory: "settings",
	description:
		"Set the ordered list of dashboard widget keys. Pass `keys` — an array of widget keys (see list_widgets for the catalogue). Unknown keys are rejected before write.",
	runbook: {
		onSuccess:
			"Confirm the new layout in one short sentence. Mention how many widgets are active. The dashboard refreshes automatically — no reload needed.",
		onValidationError:
			"If any key was rejected, surface the rejected keys and tell the user to call list_widgets to discover the valid set. Do not retry with the same args.",
		onPermissionDenied: "Tell the user this requires org.editSettings permission.",
	},
	example: {
		keys: ["leads.open", "deals.open", "deals.pipelineValue", "tasks.dueToday"],
	},
	schema: z.object({
		keys: z
			.array(z.string().min(1).max(64))
			.min(1)
			.max(20)
			.describe(`Ordered list of widget keys. Valid keys: ${WIDGET_KEYS.join(", ")}.`),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "org.editSettings");
		const { keys, rejected } = validateDashboardLayout(args.keys);
		if (rejected.length > 0) {
			return {
				ok: false as const,
				error: `Unknown widget key(s): ${rejected.join(", ")}. Call list_widgets to see the valid catalogue.`,
				code: "UNKNOWN_WIDGET_KEY",
			};
		}
		return propose(
			"update_dashboard_layout",
			{ keys },
			{
				title: "Update dashboard layout",
				fields: [
					{
						label: "Widgets (in order)",
						value: keys.map((k) => `${WIDGETS[k].label} (${k})`).join(" → "),
					},
					{ label: "Count", value: `${keys.length} widget(s)` },
				],
			},
		);
	},
});

registerTool({
	name: "commit_update_dashboard_layout",
	layer: "settings",
	permission: "org.editSettings",
	confirmation: "none",
	description: "Internal: commit dashboard layout update.",
	schema: z.object({ keys: z.array(z.string()) }),
	execute: async (args) =>
		runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "org.editSettings");
			const { keys, rejected } = validateDashboardLayout(args.keys);
			if (rejected.length > 0) {
				return {
					ok: false as const,
					error: `Unknown widget key(s): ${rejected.join(", ")}. Refresh by calling list_widgets.`,
					code: "UNKNOWN_WIDGET_KEY",
				};
			}
			await toolMutation(getCtx(), "orgs/mutations:update", {
				orgId,
				settings: { dashboardMetrics: keys },
			});
			return {
				ok: true as const,
				data: { count: keys.length, keys },
				display: {
					kind: "settings" as const,
					sectionId: "appearance",
				},
				summary: {
					headline: `Dashboard layout updated (${keys.length} widget${keys.length === 1 ? "" : "s"})`,
					table: [
						{
							label: "Order",
							value: keys.map((k) => WIDGETS[k]?.label ?? k).join(" → "),
						},
					],
				},
			};
		}),
});

// ─── set_entity_default_view ──────────────────────────────────────────────
//
// Added 2026-05-30 after `update_org_settings` rejected
// `entitySettings: { lead: { view: "board" }, ... }` (a hallucinated field
// shape) and the user got a wall-of-text validator error instead of the
// "show board view for all entities" workflow they asked for.
//
// The real field is `orgs.settings.modules[]` — an ARRAY where each entry
// is `{ slot, defaultView, order, label, ... }`. To change one slot's
// `defaultView` we have to read the whole array, splice the matching slot,
// and write it back. The vanilla `update_org_settings` patch shape can't
// express that (it overwrites `modules` wholesale, blowing away every
// other module config the workspace depends on). This tool does the
// read-merge-write atomically inside ONE approval card.
//
// Slot-name doctrine: per `convex/_shared/synonyms.ts`, the canonical
// CRM slot ids are `lead | contact | deal | company`. The schema reuses
// `entityTypeEnum()` so plurals + variants (`leads`, `opportunities`,
// `accounts`) auto-coerce to the canonical singular before the modules
// array is patched.

const ENTITY_VIEW_LITERAL = z.union([z.literal("list"), z.literal("board")]);

registerTool({
	name: "set_entity_default_view",
	layer: "settings",
	permission: "org.editSettings",
	requiredCapability: "premium",
	confirmation: "twoStep",
	approvalCategory: "settings",
	description:
		"Set the default workspace view (list or board) for one or more CRM entity slots (lead/contact/deal/company). Use this for 'show board view for all leads', 'switch deals to list view', 'change every entity to board'. Replaces the legacy attempt to patch `update_org_settings` with an `entitySettings.<entity>.view` blob — that field doesn't exist; the real field is `orgs.settings.modules[].defaultView` and this tool merges into the array correctly.",
	runbook: {
		onSuccess:
			"Confirm with the slots that changed and the new view (e.g. 'Set lead, contact, deal, company to board view.'). Mention that the change is workspace-wide and visible on next page load.",
		onPermissionDenied:
			"Tell the user they need org.editSettings permission. Suggest contacting an admin.",
		onValidationError:
			"If `views` is empty, ask the user which entity slot(s) they want to change. NEVER call this tool without at least one slot.",
	},
	example: {
		views: { lead: "board", contact: "board", deal: "board", company: "board" },
	},
	schema: z.object({
		views: z
			.record(entityTypeEnum(), ENTITY_VIEW_LITERAL)
			.refine((v) => Object.keys(v).length > 0, {
				message:
					"views must contain at least one entry. Ask the user which slot to change.",
			})
			.describe(
				'Map of entity slot to view. Example: {"lead":"board","contact":"board"}. Slots: lead | contact | deal | company. Views: list | board.',
			),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "org.editSettings");
		const entries = Object.entries(args.views);
		if (entries.length === 0) {
			return {
				ok: false as const,
				error: "views map is empty — ask the user which entity slots to switch and which view (list/board).",
				code: "EMPTY_VIEWS",
			};
		}
		return propose("set_entity_default_view", args, {
			title: `Set default view for ${entries.length} entity slot${entries.length === 1 ? "" : "s"}`,
			fields: entries.map(([slot, view]) => ({
				label: slot,
				value: view,
			})),
		});
	},
});

registerTool({
	name: "commit_set_entity_default_view",
	layer: "settings",
	permission: "org.editSettings",
	confirmation: "none",
	description: "Internal: commit per-entity default-view update (merges into modules[]).",
	schema: z.object({
		views: z.record(entityTypeEnum(), ENTITY_VIEW_LITERAL),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { ctx, orgId, userId, permissions } = getCtx();
			requirePermission(permissions, "org.editSettings");
			const entries = Object.entries(args.views);
			if (entries.length === 0) {
				return {
					ok: false as const,
					error: "Approved payload had no slot updates.",
					code: "EMPTY_VIEWS",
				};
			}
			// Read existing modules so we can merge + preserve every other
			// per-slot config (label, hidden, order, cardFields, listColumns,
			// boardGroupBy, defaultFilters, meta). Read goes through the
			// `*ForAI` twin per the AGENTS.md "Convex env" rule.
			const existing = (await ctx.runQuery(internal.orgs.queries.getOrgModulesForAI, {
				orgId,
				userId,
			})) as Array<{
				slot: string;
				label?: string;
				hidden?: boolean;
				order?: number;
				defaultView?: "list" | "board";
				cardFields?: string[];
				listColumns?: string[];
				boardGroupBy?: string;
				defaultFilters?: string[];
				meta?: unknown;
			}>;

			// Build a slot → module map so we can patch in O(1) and also
			// detect missing slots (org never seeded `modules` for that
			// entity). Missing slots are added with sensible defaults so
			// the merge never silently drops a user request.
			const bySlot = new Map(existing.map((m) => [m.slot, m]));
			const updatedSlots: string[] = [];
			for (const [slot, viewRaw] of entries) {
				// `views` is typed `Record<string, unknown>` because the
				// outer key validator is preprocessed (entityTypeEnum). Cast
				// at the use site — the inner `ENTITY_VIEW_LITERAL` already
				// constrained the runtime value to `"list" | "board"`.
				const view = viewRaw as "list" | "board";
				const prev = bySlot.get(slot);
				if (prev) {
					bySlot.set(slot, { ...prev, defaultView: view });
				} else {
					bySlot.set(slot, {
						slot,
						defaultView: view,
						order: existing.length + updatedSlots.length,
					});
				}
				updatedSlots.push(slot);
			}
			const merged = Array.from(bySlot.values());

			await toolMutation(getCtx(), "orgs/mutations:update", {
				orgId,
				settings: { modules: merged },
			});

			// Format a human-readable summary table for the assistant card.
			const summaryRows = entries.map(([slot, view]) => ({
				label: slot,
				value: String(view),
			}));

			return {
				ok: true as const,
				data: {
					updatedSlots,
					modules: merged.length,
				},
				display: {
					kind: "settings" as const,
					sectionId: "appearance",
				},
				summary: {
					headline: `Updated default view for ${updatedSlots.length} slot${updatedSlots.length === 1 ? "" : "s"}`,
					table: summaryRows,
					facts: [
						"Workspace-wide change — every member sees the new default on next page load.",
						"Each user can still override locally via the entity's view-options menu.",
					],
				},
			};
		}),
});
