/**
 * convex/ai/tools/layers/settings.ts — Workspace settings tools.
 */
import { z } from "zod";
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
	description:
		"Update workspace settings (timezone, currency, badge counts, etc.). Pass the patch object.",
	runbook: {
		onSuccess: "Confirm with the keys that were updated. Don't restate every value.",
		onPermissionDenied:
			"Tell the user they need org.editSettings permission. Suggest contacting an admin.",
	},
	schema: z.object({
		patch: z.record(z.string(), z.unknown()),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "org.editSettings");
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
			const { ctx, orgId, permissions } = getCtx();
			requirePermission(permissions, "org.editSettings");
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
			const { ctx, orgId, permissions } = getCtx();
			requirePermission(permissions, "org.editSettings");
			await toolMutation(getCtx(), "orgs/mutations:update", { orgId, entityLabels: args.labels });
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
 */
function pickSettingsSection(patch: Record<string, unknown>): string {
	const keys = Object.keys(patch);
	if (keys.some((k) => k.includes("currency") || k.includes("timezone"))) return "general";
	if (keys.some((k) => k.includes("dashboardMetrics") || k.includes("modules")))
		return "appearance";
	if (keys.some((k) => k.includes("softDelete") || k.includes("retention")))
		return "data-retention";
	if (keys.some((k) => k.includes("reminder") || k.includes("followUp"))) return "reminders";
	if (keys.some((k) => k.includes("ai"))) return "ai";
	return "general";
}
