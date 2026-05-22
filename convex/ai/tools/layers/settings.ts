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
			await toolMutation(ctx, "orgs/mutations:update", { orgId, settings: args.patch });
			return { ok: true as const, data: args, display: `✅ Settings updated.` };
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
			await toolMutation(ctx, "orgs/mutations:update", { orgId, entityLabels: args.labels });
			return { ok: true as const, data: args, display: `✅ Entity labels updated.` };
		}),
});
