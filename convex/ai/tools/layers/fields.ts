/**
 * convex/ai/tools/layers/fields.ts — Custom field definition tools.
 *
 * NOTE: minimal coverage — full custom field schema is complex.
 * Tools focus on common operations: create, archive.
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { propose, requirePermission, runTool, type ToolContext, toolMutation } from "../_shared";

let _ctx: ToolContext | null = null;
export function setFieldsContext(c: ToolContext): void {
	_ctx = c;
}
function getCtx(): ToolContext {
	if (!_ctx) throw new Error("fields ctx");
	return _ctx;
}

registerTool({
	name: "create_field",
	layer: "fields",
	permission: "fieldDefinitions.manage",
	requiredCapability: "premium",
	confirmation: "twoStep",
	description: "Create a custom field on a CRM entity.",
	runbook: {
		onSuccess:
			"Confirm with the field's label and type. Mention it appears in the entity's form on next render.",
		onValidationError:
			"If `options` is missing for select/multiselect, ask the user for the options list. Don't retry without options.",
		onPermissionDenied:
			"Tell the user they need fieldDefinitions.manage permission. Suggest contacting an admin.",
	},
	schema: z.object({
		entityType: z.enum(["lead", "contact", "deal", "company"]),
		label: z.string(),
		fieldType: z.enum([
			"text",
			"number",
			"select",
			"multiselect",
			"date",
			"boolean",
			"url",
			"email",
		]),
		options: z.optional(z.array(z.string())).describe("For select/multiselect"),
		required: z.optional(z.boolean()).default(false),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "fieldDefinitions.manage");
		return propose("create_field", args, {
			title: `Create ${args.fieldType} field: ${args.label}`,
			fields: [
				{ label: "Entity", value: args.entityType },
				{ label: "Label", value: args.label },
				{ label: "Type", value: args.fieldType },
				{ label: "Required", value: args.required ? "Yes" : "No" },
			],
		});
	},
});

registerTool({
	name: "commit_create_field",
	layer: "fields",
	permission: "fieldDefinitions.manage",
	confirmation: "none",
	description: "Internal: commit field creation.",
	schema: z.object({
		entityType: z.enum(["lead", "contact", "deal", "company"]),
		label: z.string(),
		fieldType: z.string(),
		options: z.optional(z.array(z.string())),
		required: z.optional(z.boolean()),
	}),
	execute: async (args) =>
		runTool(async () => {
			const { ctx, orgId, permissions } = getCtx();
			requirePermission(permissions, "fieldDefinitions.manage");
			const result = await toolMutation(getCtx(), "crm/fields/fieldDefinitions/mutations:create", {
				orgId,
				...args,
			});
			return {
				ok: true as const,
				data: result,
				display: `✅ Field "${args.label}" created.`,
			};
		}),
});
