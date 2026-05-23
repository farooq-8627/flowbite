/**
 * convex/ai/tools/layers/templates.ts — Workspace template tools.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import {
	propose,
	requirePermission,
	runTool,
	type ToolContext,
	toolMutation,
	toolQuery,
} from "../_shared";

let _ctx: ToolContext | null = null;
export function setTemplatesContext(c: ToolContext): void {
	_ctx = c;
}
function getCtx(): ToolContext {
	if (!_ctx) throw new Error("templates ctx");
	return _ctx;
}

registerTool({
	name: "list_templates",
	layer: "templates",
	permission: "org.viewSettings",
	confirmation: "none",
	description: "List the available industry templates.",
	runbook: {
		onSuccess:
			"Show the list of templates. If the user wants to apply one, call apply_template.",
		suggestNext: "apply_template",
	},
	schema: z.object({}),
	execute: async () =>
		runTool(async () => {
			const { ctx, permissions } = getCtx();
			requirePermission(permissions, "org.viewSettings");
			const templates = await toolQuery(getCtx(), "crm/fields/templates/queries:list", {});
			return { ok: true as const, data: templates };
		}),
});

registerTool({
	name: "apply_template",
	layer: "templates",
	permission: "org.editSettings",
	requiredCapability: "premium",
	confirmation: "twoStep",
	description: "Apply or re-apply an industry template. Additive — never deletes existing data.",
	runbook: {
		onSuccess:
			"Confirm with the template name. Mention that existing data was preserved (templates are additive).",
		onPermissionDenied:
			"Tell the user they need org.editSettings permission. Suggest contacting an admin.",
	},
	schema: z.object({
		templateId: z.string(),
		templateName: z.string().describe("For preview"),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "org.editSettings");
		return propose("apply_template", args, {
			title: `Apply template: ${args.templateName}`,
			fields: [
				{ label: "Template", value: args.templateName },
				{ label: "Mode", value: "Additive — never deletes existing data" },
			],
		});
	},
});

registerTool({
	name: "commit_apply_template",
	layer: "templates",
	permission: "org.editSettings",
	confirmation: "none",
	description: "Internal: commit template application.",
	schema: z.object({ templateId: z.string() }),
	execute: async (args) =>
		runTool(async () => {
			const { ctx, orgId, permissions } = getCtx();
			requirePermission(permissions, "org.editSettings");
			await toolMutation(getCtx(), "orgs/mutations:applyTemplate", { orgId, ...args });
			return { ok: true as const, data: args, display: `✅ Template applied.` };
		}),
});

registerTool({
	name: "clear_mock_data",
	layer: "templates",
	permission: "org.editSettings",
	confirmation: "twoStep",
	description: 'Hard-delete all sample data seeded by the template (source: "template_seed").',
	runbook: {
		onSuccess: "Confirm with the count of records cleared.",
		onPermissionDenied:
			"Tell the user they need org.editSettings permission. Suggest contacting an admin.",
	},
	schema: z.object({}),
	execute: async () => {
		const { permissions } = getCtx();
		requirePermission(permissions, "org.editSettings");
		return propose(
			"clear_mock_data",
			{},
			{
				title: "Clear all sample data",
				fields: [
					{ label: "Action", value: "Hard-delete all sample records" },
					{
						label: "Affects",
						value: "Leads, contacts, deals, companies, notes, reminders",
					},
					{ label: "Real data", value: "Untouched" },
				],
			},
		);
	},
});

registerTool({
	name: "commit_clear_mock_data",
	layer: "templates",
	permission: "org.editSettings",
	confirmation: "none",
	description: "Internal: commit clear-mock-data.",
	schema: z.object({}),
	execute: async () =>
		runTool(async () => {
			const { ctx, orgId, permissions } = getCtx();
			requirePermission(permissions, "org.editSettings");
			const result = await toolMutation(getCtx(), "orgs/mutations:clearMockData", { orgId });
			const r = result as { deleted?: number };
			return {
				ok: true as const,
				data: result,
				display: `✅ Cleared ${r.deleted ?? 0} sample records.`,
			};
		}),
});
