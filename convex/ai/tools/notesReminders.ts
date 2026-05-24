/**
 * convex/ai/tools/notesReminders.ts
 *
 * Always-on note and reminder tools (no confirmation needed — low-stakes writes):
 *   add_note, create_reminder, create_followup, complete_reminder,
 *   complete_followup_by_code, cancel_followup_by_code
 */
import { z } from "zod";
import { codeString, entityTypeEnum } from "../../_shared/synonyms";
import { registerTool } from "../toolRegistry";
import { coerceInt, requirePermission, runTool, type ToolContext, toolMutation } from "./_shared";

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
	description: "Attach a text note to a lead, contact, deal, or company.",
	instruction: {
		whenToCall:
			"Use any time the user wants to capture context about a record — meeting recap, call summary, internal observation. Notes are visible to all team members with notes.view.",
		whenNotToCall:
			"the content is a task with a due date (call create_followup or create_reminder) OR is sensitive customer data covered by RBAC (use the relevant entity field).",
		preflight: ["search_crm"],
		requiredClarifications: ["entityCode", "content"],
		synonyms: ["log", "annotation", "remark", "comment"],
		goodExample: {
			description:
				"User: 'Add a note to P-001: had a great call, they want to see Q3 numbers next week.'",
			args: {
				entityType: "lead",
				entityCode: "P-001",
				content: "Had a great call. Wants Q3 numbers next week.",
				isInternal: false,
			},
		},
		badExample: {
			description: "User: 'Add a note.'",
			args: { entityType: "lead", entityCode: "", content: "" },
			whyBad: "Both entityCode and content are required. Resolve the entity via search_crm; ask the user for the note text.",
		},
	},
	runbook: {
		onSuccess:
			"The note card renders below — say one short sentence confirming the note attached. Don't restate the content.",
		onValidationError:
			"If the entityCode doesn't resolve, call search_crm first. Don't retry with the same code.",
		onPermissionDenied:
			"Tell the user they need notes.create permission. Suggest contacting an admin.",
	},
	schema: z.object({
		entityType: entityTypeEnum(),
		entityCode: z.string().describe("Entity code (P-XXX, D-XXX, C-XXX)."),
		content: z.string().describe("The note text. Markdown supported."),
		isInternal: z
			.boolean()
			.default(false)
			.describe("If true, hidden from client/partner portals."),
	}),
	execute: async ({ entityType, entityCode, content, isInternal }) => {
		return runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "notes.create");
			const result = (await toolMutation(getCtx(), "crm/shared/notes/mutations:create", {
				orgId,
				entityType,
				entityCode,
				content,
				isInternal,
				authorType: "ai",
			})) as string; // notes.create returns the new noteId directly
			const preview = content.length > 80 ? `${content.slice(0, 77)}…` : content;
			return {
				ok: true as const,
				data: { noteId: result },
				display: {
					kind: "note" as const,
					noteId: result,
				},
				summary: {
					headline: `Added note to ${entityCode}`,
					table: [
						{ label: "Attached to", value: entityCode },
						{ label: "Visibility", value: isInternal ? "Internal" : "Shared" },
						{ label: "Excerpt", value: preview },
					],
					suggestedNext: [
						{
							label: "Schedule follow-up",
							intent: `Schedule a follow-up call with ${entityCode} for next week`,
						},
					],
				},
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
	instruction: {
		whenToCall:
			"Use for time-bound reminders not tied to a specific person — internal tasks, calendar events, vague nudges. Pass `dueAt` (Unix ms), and optionally an `entityType` + `entityCode` if the reminder is loosely linked to a lead/deal/company.",
		whenNotToCall:
			"the reminder is a CRM follow-up tied to a specific person — call `create_followup` instead, which auto-applies cadence defaults and surfaces in the person's profile.",
		requiredClarifications: ["title", "dueAt"],
		synonyms: ["set reminder", "remind me", "schedule a task", "calendar event"],
		goodExample: {
			description: "User: 'Remind me to send the quarterly report tomorrow at 9 am.'",
			args: {
				title: "Send quarterly report",
				dueAt: 1716537600000,
				reminderType: "custom",
			},
		},
		badExample: {
			description: "User: 'Follow up with P-001 next week.'",
			args: { title: "Follow up", dueAt: 1716537600000, entityCode: "P-001" },
			whyBad: "This is a person-tied follow-up. Call create_followup so it inherits the cadence defaults and shows up on the person profile.",
		},
	},
	runbook: {
		onSuccess:
			"Confirm in one short sentence with the due-date in human-readable form (e.g. 'Tomorrow at 9am'). The reminder card renders below.",
		onValidationError:
			"If dueAt is missing or in the past, ask the user for a date. Don't retry with the same args.",
		onPermissionDenied:
			"Tell the user they need reminders.create permission. Suggest contacting an admin.",
	},
	schema: z.object({
		title: z.string(),
		dueAt: coerceInt((n) =>
			n.describe("Due timestamp in milliseconds (Unix ms)."),
		) as unknown as z.ZodNumber,
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
			const { orgId, userId, permissions } = getCtx();
			requirePermission(permissions, "reminders.create");
			const result = (await toolMutation(getCtx(), "crm/shared/reminders/mutations:create", {
				orgId,
				assignedTo: userId,
				...args,
			})) as { reminderId: string };
			const dueDate = new Date(args.dueAt);
			return {
				ok: true as const,
				data: result,
				display: {
					kind: "reminder" as const,
					reminderId: result.reminderId,
				},
				summary: {
					headline: `Reminder set: ${args.title}`,
					table: [
						{
							label: "Due",
							value: dueDate.toLocaleString(),
						},
						{
							label: "Type",
							value: args.reminderType,
						},
						...(args.entityCode
							? [{ label: "Linked to", value: args.entityCode }]
							: []),
					],
					suggestedNext: [
						{
							label: "Add a note",
							intent: args.entityCode
								? `Add a note to ${args.entityCode}`
								: "Add a note about this",
						},
					],
				},
			};
		});
	},
});

registerTool({
	name: "create_followup",
	layer: "always",
	permission: "reminders.create",
	confirmation: "none",
	description:
		"Create a follow-up reminder for a specific lead/contact (preferred over create_reminder for CRM follow-ups).",
	instruction: {
		whenToCall:
			"Use whenever the user asks to follow up with a person — call back, email, check in, meeting reminder. Auto-applies the org's follow-up cadence defaults if no dueAt is given.",
		whenNotToCall:
			"the reminder is org-internal and not tied to a person (call create_reminder) OR the user wants to schedule a calendar event in a specific timeslot (use create_reminder with reminderType=meeting).",
		preflight: ["search_crm"],
		requiredClarifications: ["personCode", "title"],
		synonyms: ["follow up", "check in", "next-touch", "call back"],
		goodExample: {
			description: "User: 'Schedule a follow-up call with P-001 for next week.'",
			args: {
				personCode: "P-001",
				title: "Follow-up call",
				priority: "normal",
			},
		},
		badExample: {
			description: "User: 'Follow up with Sarah.'",
			args: { personCode: "Sarah", title: "" },
			whyBad: "personCode must be a P-XXX code, not a name. Resolve via search_crm first.",
		},
	},
	runbook: {
		onSuccess:
			"Confirm in one short sentence with the human-readable due date. The reminder card renders below.",
		onValidationError:
			"If personCode doesn't resolve, call search_crm first. Don't retry with the same code.",
	},
	schema: z.object({
		personCode: z
			.string()
			.describe("Person code of the lead/contact to follow up with (P-XXX)."),
		title: z.string().describe("Follow-up task description."),
		dueAt: z
			.optional(coerceInt() as unknown as z.ZodNumber)
			.describe("Override due date (ms). If omitted, uses org default offset."),
		notes: z.optional(z.string()),
		priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
	}),
	execute: async (args) => {
		return runTool(async () => {
			const { orgId, userId, permissions } = getCtx();
			requirePermission(permissions, "reminders.create");
			const result = (await toolMutation(
				getCtx(),
				"crm/shared/reminders/mutations:createFollowup",
				{ orgId, actorUserId: userId, ...args },
			)) as { reminderId: string; followUpCode?: string };
			const dueLabel = args.dueAt ? new Date(args.dueAt).toLocaleString() : "Default cadence";
			return {
				ok: true as const,
				data: result,
				display: {
					kind: "reminder" as const,
					reminderId: result.reminderId,
				},
				summary: {
					headline: result.followUpCode
						? `Created follow-up ${result.followUpCode}: ${args.title}`
						: `Created follow-up: ${args.title}`,
					table: [
						{ label: "For", value: args.personCode },
						{ label: "Title", value: args.title },
						{ label: "Due", value: dueLabel },
						{ label: "Priority", value: args.priority ?? "normal" },
					],
					suggestedNext: [
						{
							label: "Add note",
							intent: `Add a note to ${args.personCode} with the call agenda`,
						},
						{
							label: "Open record",
							intent: `Show me ${args.personCode}'s details`,
						},
					],
				},
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
	instruction: {
		whenToCall:
			"User says they finished a reminder ('done', 'completed', 'taken care of', 'finished R-...'). Pass the reminder's `reminderId` from a prior list/search.",
		whenNotToCall:
			"the user is referring to a follow-up by its public FU-XXX code — call `complete_followup_by_code` instead, which resolves the code server-side.",
		preflight: ["search_crm"],
		requiredClarifications: ["reminderId"],
		synonyms: ["done", "complete", "mark complete", "finished"],
		goodExample: {
			description: "User: 'Mark that reminder done.' (after model just listed reminders)",
			args: { reminderId: "kg2j..." },
		},
		badExample: {
			description: "User: 'Cancel FU-003.'",
			args: { reminderId: "FU-003" },
			whyBad: "FU-003 is a follow-up code, not a reminderId. Use cancel_followup_by_code.",
		},
	},
	runbook: {
		onSuccess:
			"Confirm in one short sentence (e.g. 'Marked complete.'). The reminder card already shows the new state.",
		onPermissionDenied:
			"Tell the user they need reminders.manage permission. Suggest contacting an admin.",
	},
	schema: z.object({
		reminderId: z.string().describe("Id of the reminder to mark complete."),
		completionNote: z.optional(z.string()).describe("Optional note about the completion."),
	}),
	execute: async ({ reminderId, completionNote: _completionNote }) => {
		return runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "reminders.manage");
			// `completionNote` is a UX convenience surfaced to the model
			// in case the user mentions a closing remark — but the
			// underlying `complete` mutation doesn't accept it (the note
			// would belong on `update.note`). We deliberately drop it
			// here rather than forward and trigger an
			// `ArgumentValidationError`. If the user really wants the
			// note attached, the model should call `add_note` separately.
			await toolMutation(getCtx(), "crm/shared/reminders/mutations:complete", {
				orgId,
				reminderId,
			});
			return {
				ok: true as const,
				data: { reminderId },
				display: {
					kind: "reminder" as const,
					reminderId,
				},
				summary: {
					headline: "Reminder marked complete",
					suggestedNext: [
						{
							label: "Schedule the next one",
							intent: "Set a follow-up reminder",
						},
					],
				},
			};
		});
	},
});

// ─── Code-keyed follow-up actions (P1.5) ─────────────────────────────────────
//
// PHASE-3-AI-AUDIT.md §6 audit row 4. Users say "Cancel FU-003" — they
// don't know the internal `reminderId`. These tools translate the
// public follow-up code into the internal id and invoke the matching
// reminder mutation. Code parsing uses `codeString()` so `fu003`,
// `FU 3`, and `fu-3` all resolve to `FU-003`.

registerTool({
	name: "complete_followup_by_code",
	layer: "always",
	permission: "reminders.manage",
	confirmation: "none",
	description:
		"Mark a follow-up complete using its public code (FU-001 / FU-042 / …). Users see this code in the timeline; they don't know the internal reminderId.",
	instruction: {
		whenToCall:
			"User refers to a follow-up by its public FU-XXX code and says it's done ('completed FU-003', 'mark FU-7 as called').",
		whenNotToCall:
			"the user is talking about a generic reminder (no FU prefix) — use `complete_reminder` with the reminderId. If the FU code doesn't resolve, do NOT retry with a different code; surface the failure.",
		requiredClarifications: ["followUpCode"],
		synonyms: ["mark followup done", "complete FU", "finished follow-up"],
		goodExample: {
			description: "User: 'Mark FU-003 as completed.'",
			args: { followUpCode: "FU-003" },
		},
		badExample: {
			description: "User: 'Mark the followup with Sarah done.'",
			args: { followUpCode: "Sarah" },
			whyBad: "followUpCode must be FU-XXX. Resolve via list_followups_for_person on the person first.",
		},
	},
	runbook: {
		onSuccess:
			"Confirm in one short sentence using the followUpCode. If `alreadyCompleted: true`, mention it was already done.",
		onValidationError:
			"If the code doesn't resolve, do NOT retry — call search_crm to find the right person, then list_followups_for_person.",
		onPermissionDenied:
			"Tell the user they need reminders.manage permission OR be assigned to the follow-up.",
	},
	schema: z.object({
		followUpCode: codeString().describe("Follow-up code (FU-XXX)."),
	}),
	execute: async ({ followUpCode }) => {
		return runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "reminders.manage");
			const result = (await toolMutation(
				getCtx(),
				"crm/shared/reminders/mutations:completeByFollowUpCode",
				{ orgId, followUpCode },
			)) as { followUpCode: string; reminderId: string; alreadyCompleted: boolean };
			return {
				ok: true as const,
				data: result,
				display: {
					kind: "reminder" as const,
					reminderId: result.reminderId,
				},
				summary: {
					headline: result.alreadyCompleted
						? `${result.followUpCode} was already complete`
						: `Completed ${result.followUpCode}`,
					suggestedNext: [
						{
							label: "Schedule next follow-up",
							intent: "Set a follow-up reminder",
						},
					],
				},
			};
		});
	},
});

registerTool({
	name: "cancel_followup_by_code",
	layer: "always",
	permission: "reminders.manage",
	confirmation: "none",
	description:
		"Cancel (delete) a follow-up using its public code (FU-001 / FU-042 / …). Cancellation is permanent — there is no undo. Use complete_followup_by_code if the work was actually done.",
	instruction: {
		whenToCall:
			"User explicitly says cancel/delete/remove a follow-up by its FU-XXX code. If the user said 'completed' or 'done', use complete_followup_by_code instead — cancellation is destructive.",
		whenNotToCall:
			"the work was actually done — use complete_followup_by_code so the timeline records completion. Also don't call when the code doesn't resolve; surface the failure.",
		requiredClarifications: ["followUpCode"],
		synonyms: ["cancel followup", "delete follow-up", "remove FU", "drop the followup"],
		goodExample: {
			description: "User: 'Cancel FU-003, the deal fell through.'",
			args: { followUpCode: "FU-003" },
		},
		badExample: {
			description: "User: 'Mark FU-003 as done.'",
			args: { followUpCode: "FU-003" },
			whyBad: "User said 'done', not 'cancel'. Call complete_followup_by_code instead so the activity log records completion.",
		},
	},
	runbook: {
		onSuccess:
			"Confirm in one short sentence using the followUpCode (e.g. 'Cancelled FU-003.').",
		onValidationError:
			"If the code doesn't resolve, do NOT retry — call search_crm to find the right person, then list_followups_for_person.",
		onPermissionDenied:
			"Tell the user they need reminders.manage permission OR be assigned to the follow-up.",
	},
	schema: z.object({
		followUpCode: codeString().describe("Follow-up code (FU-XXX)."),
	}),
	execute: async ({ followUpCode }) => {
		return runTool(async () => {
			const { orgId, permissions } = getCtx();
			requirePermission(permissions, "reminders.manage");
			const result = (await toolMutation(
				getCtx(),
				"crm/shared/reminders/mutations:cancelByFollowUpCode",
				{ orgId, followUpCode },
			)) as { followUpCode: string; reminderId: string };
			return {
				ok: true as const,
				data: result,
				display: `🗑 Cancelled follow-up ${result.followUpCode}.`,
				summary: {
					headline: `Cancelled ${result.followUpCode}`,
					table: [{ label: "Status", value: "Cancelled (permanent)" }],
				},
			};
		});
	},
});
