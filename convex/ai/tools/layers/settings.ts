/**
 * convex/ai/tools/layers/settings.ts — Workspace settings tools.
 */
import { z } from "zod";
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

registerTool({
	name: "update_org_settings",
	layer: "settings",
	permission: "org.editSettings",
	requiredCapability: "premium",
	confirmation: "twoStep",
	approvalCategory: "settings",
	description:
		"Update workspace settings (timezone, currency, badge counts, etc.). Pass the patch object.",
	runbook: {
		onSuccess: "Confirm with the keys that were updated. Don't restate every value.",
		onPermissionDenied:
			"Tell the user they need org.editSettings permission. Suggest contacting an admin.",
		onValidationError:
			"If `patch` is missing or empty, ask the user which specific setting they want to change before retrying. NEVER call this tool with an empty patch.",
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
		return propose("update_org_settings", args, {
			title: "Update workspace settings",
			fields: Object.entries(args.patch).map(([k, v]) => ({ label: k, value: String(v) })),
		});
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
			await toolMutation(getCtx(), "orgs/mutations:update", { orgId, settings: args.patch });
			// Sprint 3 doctrine: emit a `settings` display payload so the
			// chat renders a deep-link card to the affected section. We
			// pick the best-matching section id by inspecting the patch keys.
			const sectionId = pickSettingsSection(args.patch);
			return {
				ok: true as const,
				data: args,
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
