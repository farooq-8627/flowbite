/**
 * convex/ai/tools/notesReminders.ts
 *
 * Always-on note and reminder tools (no confirmation needed — low-stakes writes):
 *   add_note, create_reminder, create_followup, complete_reminder
 */
import { z } from "zod";
import { registerTool } from "../toolRegistry";
import { requirePermission, runTool, type ToolContext, toolMutation } from "./_shared";

let _toolCtx: ToolContext | null = null;
export function setNotesRemindersContext(ctx: ToolContext): void {
	_toolCtx = ctx;
}
function getCtx(): ToolContext {
	if (!_toolCtx) throw new Error("Tool context not initialized");
	return _toolCtx;
}

registerTool({
	name: "add_note",
	layer: "always",
	permission: "notes.create",
	confirmation: "none",
	description: `
Add a text note to a lead, contact, deal, or company.
Notes are visible to all team members with notes.view permission.
  `.trim(),
	schema: z.object({
		entityType: z.enum(["lead", "contact", "deal", "company"]),
		entityCode: z.string().describe("Entity code (P-XXX, D-XXX, C-XXX)."),
		content: z.string().describe("The note text. Markdown supported."),
		isInternal: z
			.boolean()
			.default(false)
			.describe("If true, hidden from client/partner portals."),
	}),
	execute: async ({ entityType, entityCode, content, isInternal }) => {
		return runTool(async () => {
			const { ctx, orgId, permissions } = getCtx();
			requirePermission(permissions, "notes.create");
			const result = await toolMutation(ctx, "crm/shared/notes/mutations:create", {
				orgId,
				entityType,
				entityCode,
				content,
				isInternal,
				authorType: "ai",
			});
			return {
				ok: true as const,
				data: result,
				display: `📝 Note added to ${entityType} ${entityCode}.`,
			};
		});
	},
});

registerTool({
	name: "create_reminder",
	layer: "always",
	permission: "reminders.create",
	confirmation: "none",
	description: `
Create a reminder for a specific date/time.
Can be linked to an entity (lead, contact, deal) or standalone.
Types: call, email, meeting, follow_up, custom.
  `.trim(),
	schema: z.object({
		title: z.string(),
		dueAt: z.number().describe("Due timestamp in milliseconds (Unix ms)."),
		reminderType: z
			.enum(["call", "email", "meeting", "follow_up", "custom"])
			.default("follow_up"),
		entityType: z.optional(z.enum(["lead", "contact", "deal", "company"])),
		entityCode: z.optional(z.string()),
		notes: z.optional(z.string()),
		assignedTo: z.optional(z.string()).describe("userId to assign this reminder to."),
	}),
	execute: async (args) => {
		return runTool(async () => {
			const { ctx, orgId, userId, permissions } = getCtx();
			requirePermission(permissions, "reminders.create");
			const result = await toolMutation(ctx, "crm/shared/reminders/mutations:create", {
				orgId,
				assignedTo: userId,
				...args,
			});
			return {
				ok: true as const,
				data: result,
				display: `🔔 Reminder created: ${args.title}`,
			};
		});
	},
});

registerTool({
	name: "create_followup",
	layer: "always",
	permission: "reminders.create",
	confirmation: "none",
	description: `
Create a follow-up reminder for a specific lead or contact.
Uses the org's follow-up cadence defaults for timing.
Preferred over create_reminder for CRM follow-ups — it sets source:"followup" and applies default offsets.
  `.trim(),
	schema: z.object({
		personCode: z
			.string()
			.describe("Person code of the lead/contact to follow up with (P-XXX)."),
		title: z.string().describe("Follow-up task description."),
		dueAt: z
			.optional(z.number())
			.describe("Override due date (ms). If omitted, uses org default offset."),
		notes: z.optional(z.string()),
		priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
	}),
	execute: async (args) => {
		return runTool(async () => {
			const { ctx, orgId, userId, permissions } = getCtx();
			requirePermission(permissions, "reminders.create");
			const result = await toolMutation(
				ctx,
				"crm/shared/reminders/mutations:createFollowup",
				{ orgId, actorUserId: userId, ...args },
			);
			return {
				ok: true as const,
				data: result,
				display: `✅ Follow-up created for ${args.personCode}.`,
			};
		});
	},
});

registerTool({
	name: "complete_reminder",
	layer: "always",
	permission: "reminders.manage",
	confirmation: "none",
	description: "Mark a reminder as completed.",
	schema: z.object({
		reminderId: z.string().describe("Id of the reminder to mark complete."),
		completionNote: z.optional(z.string()).describe("Optional note about the completion."),
	}),
	execute: async ({ reminderId, completionNote }) => {
		return runTool(async () => {
			const { ctx, orgId, permissions } = getCtx();
			requirePermission(permissions, "reminders.manage");
			await toolMutation(ctx, "crm/shared/reminders/mutations:complete", {
				orgId,
				reminderId,
				completionNote,
			});
			return {
				ok: true as const,
				data: { reminderId },
				display: `✅ Reminder marked complete.`,
			};
		});
	},
});
