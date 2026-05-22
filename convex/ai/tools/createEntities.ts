/**
 * convex/ai/tools/createEntities.ts
 *
 * Always-on create tools (all two-step confirmation):
 *   create_lead, create_contact, create_company, create_deal
 */
import { z } from "zod";
import { registerTool } from "../toolRegistry";
import { propose, requirePermission, runTool, type ToolContext, toolMutation } from "./_shared";

let _toolCtx: ToolContext | null = null;
export function setCreateEntitiesContext(ctx: ToolContext): void {
	_toolCtx = ctx;
}
function getCtx(): ToolContext {
	if (!_toolCtx) throw new Error("Tool context not initialized");
	return _toolCtx;
}

// ─── create_lead ─────────────────────────────────────────────────────────────

registerTool({
	name: "create_lead",
	layer: "always",
	permission: "leads.create",
	confirmation: "twoStep",
	description: `
Create a new lead (prospective customer). ALWAYS search_crm first to check for duplicates.
Shows a preview and asks for user confirmation before writing.
  `.trim(),
	schema: z.object({
		displayName: z.string().describe("Full name of the lead."),
		email: z.optional(z.string().email()),
		phone: z.optional(z.string()),
		source: z.string().default("manual").describe("Lead source: manual, referral, web, etc."),
		assignedTo: z.optional(z.string()).describe("userId to assign this lead to."),
		notes: z.optional(z.string()).describe("Initial note to attach."),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "leads.create");
		// Two-step: return a proposal. processChat handles the commit after user approves.
		return propose("create_lead", args, {
			title: `Create lead: ${args.displayName}`,
			fields: [
				{ label: "Name", value: args.displayName },
				{ label: "Email", value: args.email ?? "—" },
				{ label: "Phone", value: args.phone ?? "—" },
				{ label: "Source", value: args.source },
				{ label: "Notes", value: args.notes ?? "—" },
			],
		});
	},
});

// ─── commit_create_lead (called by processChat after approval) ────────────────

registerTool({
	name: "commit_create_lead",
	layer: "always",
	permission: "leads.create",
	confirmation: "none",
	description:
		"Internal: commit a pre-approved lead creation. Do not call without prior create_lead approval.",
	schema: z.object({
		displayName: z.string(),
		email: z.optional(z.string()),
		phone: z.optional(z.string()),
		source: z.string().default("manual"),
		assignedTo: z.optional(z.string()),
	}),
	execute: async (args) => {
		return runTool(async () => {
			const { ctx, orgId, permissions } = getCtx();
			requirePermission(permissions, "leads.create");
			const result = await toolMutation(ctx, "crm/entities/leads/mutations:create", {
				orgId,
				...args,
			});
			return {
				ok: true as const,
				data: result,
				display: `✅ Lead created: ${args.displayName}`,
			};
		});
	},
});

// ─── create_contact ───────────────────────────────────────────────────────────

registerTool({
	name: "create_contact",
	layer: "always",
	permission: "contacts.create",
	confirmation: "twoStep",
	description: `
Create a new contact (qualified person already in a relationship with the business).
Shows a preview and asks for confirmation before writing.
  `.trim(),
	schema: z.object({
		firstName: z.string(),
		lastName: z.string(),
		email: z.string().email(),
		phone: z.optional(z.string()),
		jobTitle: z.optional(z.string()),
		companyId: z.optional(z.string()),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "contacts.create");
		return propose("create_contact", args, {
			title: `Create contact: ${args.firstName} ${args.lastName}`,
			fields: [
				{ label: "Name", value: `${args.firstName} ${args.lastName}` },
				{ label: "Email", value: args.email },
				{ label: "Phone", value: args.phone ?? "—" },
				{ label: "Job Title", value: args.jobTitle ?? "—" },
			],
		});
	},
});

registerTool({
	name: "commit_create_contact",
	layer: "always",
	permission: "contacts.create",
	confirmation: "none",
	description: "Internal: commit a pre-approved contact creation.",
	schema: z.object({
		firstName: z.string(),
		lastName: z.string(),
		email: z.string(),
		phone: z.optional(z.string()),
		jobTitle: z.optional(z.string()),
		companyId: z.optional(z.string()),
	}),
	execute: async (args) => {
		return runTool(async () => {
			const { ctx, orgId, permissions } = getCtx();
			requirePermission(permissions, "contacts.create");
			const result = await toolMutation(ctx, "crm/entities/contacts/mutations:create", {
				orgId,
				...args,
			});
			return {
				ok: true as const,
				data: result,
				display: `✅ Contact created: ${args.firstName} ${args.lastName}`,
			};
		});
	},
});

// ─── create_company ───────────────────────────────────────────────────────────

registerTool({
	name: "create_company",
	layer: "always",
	permission: "companies.create",
	confirmation: "twoStep",
	description: "Create a new company/account. Shows preview before writing.",
	schema: z.object({
		name: z.string(),
		website: z.optional(z.string()),
		industry: z.optional(z.string()),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "companies.create");
		return propose("create_company", args, {
			title: `Create company: ${args.name}`,
			fields: [
				{ label: "Name", value: args.name },
				{ label: "Website", value: args.website ?? "—" },
				{ label: "Industry", value: args.industry ?? "—" },
			],
		});
	},
});

registerTool({
	name: "commit_create_company",
	layer: "always",
	permission: "companies.create",
	confirmation: "none",
	description: "Internal: commit a pre-approved company creation.",
	schema: z.object({
		name: z.string(),
		website: z.optional(z.string()),
		industry: z.optional(z.string()),
	}),
	execute: async (args) => {
		return runTool(async () => {
			const { ctx, orgId, permissions } = getCtx();
			requirePermission(permissions, "companies.create");
			const result = await toolMutation(ctx, "crm/entities/companies/mutations:create", {
				orgId,
				...args,
			});
			return { ok: true as const, data: result, display: `✅ Company created: ${args.name}` };
		});
	},
});

// ─── create_deal ──────────────────────────────────────────────────────────────

registerTool({
	name: "create_deal",
	layer: "always",
	permission: "deals.create",
	confirmation: "twoStep",
	description: "Create a new deal. Shows preview before writing.",
	schema: z.object({
		title: z.string(),
		value: z.optional(z.number()),
		pipelineId: z.optional(z.string()),
		personCode: z.optional(z.string()).describe("Associated person (P-XXX code)."),
		expectedCloseDate: z.optional(z.number()),
	}),
	execute: async (args) => {
		const { permissions } = getCtx();
		requirePermission(permissions, "deals.create");
		return propose("create_deal", args, {
			title: `Create deal: ${args.title}`,
			fields: [
				{ label: "Title", value: args.title },
				{ label: "Value", value: args.value ?? "—" },
				{ label: "Person", value: args.personCode ?? "—" },
			],
		});
	},
});

registerTool({
	name: "commit_create_deal",
	layer: "always",
	permission: "deals.create",
	confirmation: "none",
	description: "Internal: commit a pre-approved deal creation.",
	schema: z.object({
		title: z.string(),
		value: z.optional(z.number()),
		pipelineId: z.optional(z.string()),
		personCode: z.optional(z.string()),
		expectedCloseDate: z.optional(z.number()),
	}),
	execute: async (args) => {
		return runTool(async () => {
			const { ctx, orgId, permissions } = getCtx();
			requirePermission(permissions, "deals.create");
			const result = await toolMutation(ctx, "crm/entities/deals/mutations:create", {
				orgId,
				...args,
			});
			return { ok: true as const, data: result, display: `✅ Deal created: ${args.title}` };
		});
	},
});
