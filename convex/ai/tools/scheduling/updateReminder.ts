/**
 * convex/ai/tools/scheduling/updateReminder.ts
 *
 * Stage 3 of /SPRINT-PLAN.md (2026-05-26). Two-step reminder edit:
 *
 *   update_reminder (propose) → confirmation card with patch summary
 *      ↓ user approves
 *   commit_update_reminder    → calls reminders/mutations:updateForAI
 *
 * Mirrors the shape of `complete_reminder` but accepts patch fields
 * (`title`, `note`, `dueAt`, `assignedTo`, `priority`).
 *
 * Targeting:
 *   - `followUpCode` (FU-XXX) — preferred, what users see in the timeline.
 *   - `reminderId`   — escape hatch when the AI already has the raw id
 *                       from a prior list query (`list_followups`).
 *
 * Permission: assignee OR `reminders.manage`. The mutation re-verifies at
 * write time, so the tool-surface filter just uses `reminders.manage` as
 * the strongest gate (admins always pass; assignees need the runtime
 * fallback inside the mutation).
 */
import { z } from "zod";
import { internal } from "../../../_generated/api";
import type { CascadeImpactResult } from "../../queries/cascadeImpact";
import { registerTool } from "../../toolRegistry";
import {
	coerceInt,
	optionalNumber,
	optionalString,
	propose,
	requirePermission,
	runTool,
	toolMutation,
} from "../_shared";
import { getSchedulingCtx } from "./_context";

const PRIORITY_ENUM = z.enum(["low", "normal", "high", "urgent"]);

const schema = z
	.object({
		followUpCode: optionalString().describe(
			"Public follow-up code (FU-XXX). Preferred over reminderId.",
		),
		reminderId: optionalString().describe(
			"Raw Convex _id. Use only when you have it from a prior list query.",
		),
		title: optionalString().describe("New reminder title."),
		note: optionalString().describe("New free-form note."),
		dueAt: optionalNumber(coerceInt() as never).describe(
			"New due timestamp in milliseconds (Unix ms).",
		),
		assignedTo: optionalString().describe(
			"User _id of the new assignee. Use list_members to resolve.",
		),
		priority: z
			.optional(PRIORITY_ENUM)
			.describe("Priority chip — low / normal / high / urgent."),
	})
	.refine((v) => !!v.followUpCode || !!v.reminderId, {
		message: "Pass exactly one of followUpCode or reminderId.",
	})
	.refine(
		(v) =>
			v.title !== undefined ||
			v.note !== undefined ||
			v.dueAt !== undefined ||
			v.assignedTo !== undefined ||
			v.priority !== undefined,
		{ message: "At least one of title / note / dueAt / assignedTo / priority must be set." },
	);

registerTool({
	name: "update_reminder",
	layer: "always",
	permission: "reminders.manage",
	confirmation: "twoStep",
	description:
		"Edit a reminder's title, note, due date, assignee, or priority. Pass followUpCode (FU-XXX) or reminderId.",
	instruction: {
		whenToCall:
			"User asks to push / postpone / reschedule / change / reassign / re-prioritise a reminder. Always show the confirmation card before writing.",
		whenNotToCall:
			"the user wants to mark the reminder DONE (use complete_reminder or complete_followup_by_code) OR delete it (use delete_entity with entityType='reminder').",
		preflight: ["list_followups", "list_followups_for_person"],
		requiredClarifications: ["followUpCode"],
		synonyms: [
			"push reminder",
			"postpone reminder",
			"reschedule reminder",
			"reassign reminder",
			"change priority",
		],
		goodExample: {
			description: "User: 'Push FU-003 to next Tuesday at 10am.' (model converts to ms)",
			args: { followUpCode: "FU-003", dueAt: 1716537600000 },
		},
		badExample: {
			description: "User: 'Reschedule the followup with Sarah.'",
			args: { followUpCode: "Sarah" },
			whyBad: "followUpCode must be FU-XXX. Call list_followups_for_person first to find the right code.",
		},
	},
	runbook: {
		onSuccess:
			"Reply with one short sentence using the followUpCode + the human-readable change ('Pushed FU-003 to Tuesday 10am.').",
		onValidationError:
			"If the code doesn't resolve, do NOT retry — call list_followups_for_person on the right person first.",
		onPermissionDenied:
			"Tell the user they need reminders.manage permission OR be assigned to the reminder.",
	},
	schema,
	execute: async (args) => {
		return runTool(async () => {
			const tc = getSchedulingCtx();
			requirePermission(tc.permissions, "reminders.manage");

			// Resolve via cascadeImpact when followUpCode supplied, so the
			// propose card can show the reminder's current title.
			let displayLabel: string;
			let resolvedReminderId: string | undefined = args.reminderId;

			if (args.followUpCode && !args.reminderId) {
				const impact = (await tc.ctx.runQuery(
					internal.ai.queries.cascadeImpact.getEntityCascadeImpact,
					{
						orgId: tc.orgId,
						userId: tc.userId,
						entityType: "reminder" as const,
						followUpCode: args.followUpCode,
					},
				)) as CascadeImpactResult;
				if (impact.kind === "not_found") {
					return {
						ok: false as const,
						code: "NOT_FOUND",
						error: `No reminder found for ${args.followUpCode}. Call list_followups_for_person first.`,
					};
				}
				resolvedReminderId = impact.entityId;
				displayLabel = `${impact.canonicalCode ?? impact.entityId} (${impact.displayName})`;
			} else {
				displayLabel = args.reminderId ?? args.followUpCode ?? "(unknown)";
			}

			const patchParts: string[] = [];
			if (args.title !== undefined) patchParts.push(`title="${args.title}"`);
			if (args.note !== undefined) {
				const preview = args.note.length > 60 ? `${args.note.slice(0, 60)}…` : args.note;
				patchParts.push(`note="${preview}"`);
			}
			if (args.dueAt !== undefined) {
				const dueDate = new Date(args.dueAt);
				patchParts.push(`due=${dueDate.toLocaleString()}`);
			}
			if (args.assignedTo !== undefined) patchParts.push(`assignedTo=${args.assignedTo}`);
			if (args.priority !== undefined) patchParts.push(`priority=${args.priority}`);

			return propose(
				"update_reminder",
				{ ...args, reminderId: resolvedReminderId },
				{
					title: `Update reminder ${displayLabel}`,
					fields: [
						{ label: "Reminder", value: displayLabel },
						{ label: "Patch", value: patchParts.join(" · ") },
					],
				},
			);
		});
	},
});

registerTool({
	name: "commit_update_reminder",
	layer: "always",
	permission: "reminders.manage",
	confirmation: "none",
	description:
		"Internal: commit a pre-approved update_reminder call. Do not call without prior update_reminder approval.",
	schema: z
		.object({
			followUpCode: optionalString(),
			reminderId: optionalString(),
			title: optionalString(),
			note: optionalString(),
			dueAt: optionalNumber(coerceInt() as never),
			assignedTo: optionalString(),
			priority: z.optional(PRIORITY_ENUM),
		})
		.refine((v) => !!v.followUpCode || !!v.reminderId, {
			message: "Pass exactly one of followUpCode or reminderId.",
		}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getSchedulingCtx();
			requirePermission(tc.permissions, "reminders.manage");

			// Resolve to reminderId if only followUpCode was supplied.
			let reminderId = args.reminderId;
			let canonicalCode: string | undefined;
			if (!reminderId && args.followUpCode) {
				const impact = (await tc.ctx.runQuery(
					internal.ai.queries.cascadeImpact.getEntityCascadeImpact,
					{
						orgId: tc.orgId,
						userId: tc.userId,
						entityType: "reminder" as const,
						followUpCode: args.followUpCode,
					},
				)) as CascadeImpactResult;
				if (impact.kind === "not_found") {
					return {
						ok: false as const,
						code: "NOT_FOUND",
						error: `No reminder found for ${args.followUpCode}.`,
					};
				}
				reminderId = impact.entityId;
				canonicalCode = impact.canonicalCode;
			}
			if (!reminderId) {
				return {
					ok: false as const,
					code: "INVALID_ARGS",
					error: "No reminder identifier resolved — pass followUpCode or reminderId.",
				};
			}

			await toolMutation(tc, "crm/shared/reminders/mutations:update", {
				orgId: tc.orgId,
				reminderId,
				...(args.title !== undefined ? { title: args.title } : {}),
				...(args.note !== undefined ? { note: args.note } : {}),
				...(args.dueAt !== undefined ? { dueAt: args.dueAt } : {}),
				...(args.assignedTo !== undefined ? { assignedTo: args.assignedTo } : {}),
				...(args.priority !== undefined ? { priority: args.priority } : {}),
			});

			const summaryRows: Array<{ label: string; value: string }> = [
				{ label: "Reminder", value: canonicalCode ?? reminderId },
			];
			if (args.title !== undefined) summaryRows.push({ label: "Title", value: args.title });
			if (args.dueAt !== undefined) {
				summaryRows.push({
					label: "New due",
					value: new Date(args.dueAt).toLocaleString(),
				});
			}
			if (args.priority !== undefined) {
				summaryRows.push({ label: "Priority", value: args.priority });
			}
			if (args.assignedTo !== undefined) {
				summaryRows.push({ label: "Assigned to", value: args.assignedTo });
			}

			return {
				ok: true as const,
				data: { reminderId, followUpCode: canonicalCode },
				display: {
					kind: "reminder" as const,
					reminderId,
				},
				summary: {
					headline: `Updated reminder ${canonicalCode ?? reminderId}`,
					table: summaryRows,
					suggestedNext: [
						{
							label: "Mark complete",
							intent: canonicalCode
								? `Mark ${canonicalCode} complete`
								: "Mark this reminder complete",
						},
						{
							label: "Cancel it",
							intent: canonicalCode
								? `Cancel ${canonicalCode}`
								: "Cancel this reminder",
						},
					],
				},
			};
		}),
});
