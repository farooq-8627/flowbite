/**
 * convex/ai/tools/dashboard/annotateWidget.ts
 *
 * Stage 5 — annotate_widget tool. Writes an org-wide annotation chip
 * (visible to everyone, dismissable per-user) anchored to a widget
 * and/or a deal.
 *
 * Calls `dashboard/annotations/mutations:createFromTool`.
 */

import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { optionalString, propose, requirePermission, runTool, toolMutation } from "../_shared";
import { getDashboardCtx } from "./_context";

registerTool({
	name: "annotate_widget",
	layer: "dashboard",
	permission: "ai.use",
	confirmation: "twoStep",
	approvalCategory: "create_record",
	description:
		"Pin a small annotation chip on a dashboard widget or in AI Pulse. Org-wide visibility, per-user dismissable.",
	instruction: {
		whenToCall:
			"Use when the user says 'note that …', 'add a chip explaining X', 'annotate the pipeline', 'flag this on the dashboard'. The chip surfaces to every member but each user can dismiss it independently. Anchor to a specific widgetKey when possible; leave widgetKey empty for AI Pulse-only chips.",
		whenNotToCall:
			"the user wants a private note on a record (use add_note) OR a 1:1 message (use send_message) OR a permanent dashboard change (use Settings → Dashboard).",
		preflight: ["list_widgets"],
		requiredClarifications: ["note"],
		synonyms: ["note that", "add a chip", "annotate", "flag", "surface this", "pin a comment"],
		goodExample: {
			description:
				"User: 'Annotate the pipeline panel: Q3 forecast dropped 22% — likely the stage-3 stall on D-007/D-012.'",
			args: {
				widget: "pipeline.salesPanel",
				severity: "warning",
				note: "Q3 forecast dropped 22% — stage-3 stall on D-007 and D-012.",
				suggestedIntent: "Investigate the stage-3 stall on D-007 and D-012.",
			},
		},
		badExample: {
			description: "User: 'Annotate this thing.'",
			args: { note: "" },
			whyBad: "No note text. Call ask_user_input first to get the body.",
		},
	},
	runbook: {
		onSuccess:
			"Reply with ONE concise sentence ('Pinned the chip on the sales pipeline panel.'). Don't restate the note body.",
		onValidationError: "Call ask_user_input ONCE for missing fields.",
		suggestNext: "render_widget",
	},
	schema: z.object({
		widget: optionalString().describe(
			"Optional widget key to anchor the chip on (e.g. pipeline.salesPanel). Empty = AI Pulse only.",
		),
		dealCode: optionalString().describe(
			"Optional deal code to anchor the chip on (e.g. D-007).",
		),
		severity: z
			.enum(["info", "warning", "critical"])
			.default("info")
			.describe("Chip colour: info (slate), warning (amber), critical (red). Default info."),
		note: z.string().min(1).max(200).describe("1-line headline for the chip."),
		facts: z
			.array(z.string().min(1).max(200))
			.optional()
			.describe("Optional bullet observations (≤5 entries)."),
		suggestedIntent: optionalString().describe(
			"Optional pre-filled chat composer text on Investigate click (≤300 chars).",
		),
	}),
	execute: async (args) => {
		const { permissions } = getDashboardCtx();
		requirePermission(permissions, "ai.use");
		return propose("annotate_widget", args, {
			title: `Pin ${args.severity} chip${args.widget ? ` on ${args.widget}` : ""}`,
			fields: [
				{ label: "Widget", value: args.widget ?? "(AI Pulse only)" },
				{ label: "Severity", value: args.severity },
				{ label: "Note", value: args.note },
				...(args.dealCode ? [{ label: "Deal", value: args.dealCode }] : []),
				...(args.facts && args.facts.length > 0
					? [{ label: "Facts", value: args.facts.slice(0, 3).join(" · ") }]
					: []),
			],
		});
	},
});

registerTool({
	name: "commit_annotate_widget",
	layer: "dashboard",
	permission: "ai.use",
	confirmation: "none",
	description: "Internal: commit a pre-approved annotate_widget call.",
	schema: z.object({
		widget: optionalString(),
		dealCode: optionalString(),
		severity: z.enum(["info", "warning", "critical"]).default("info"),
		note: z.string().min(1).max(200),
		facts: z.array(z.string().min(1).max(200)).optional(),
		suggestedIntent: optionalString(),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getDashboardCtx();
			requirePermission(tc.permissions, "ai.use");

			// Resolve dealCode → dealId if provided.
			let dealId: string | undefined;
			if (args.dealCode) {
				const deal = (await tc.ctx.runQuery(
					"crm/entities/deals/queries:getByDealCodeForAI" as never,
					{
						orgId: tc.orgId,
						userId: tc.userId,
						dealCode: args.dealCode,
					} as never,
				)) as { _id: string } | null;
				if (!deal) {
					return {
						ok: false as const,
						error: `No deal with code '${args.dealCode}' exists in this workspace.`,
					};
				}
				dealId = deal._id;
			}

			const annotationId = (await toolMutation(
				tc,
				"dashboard/annotations/mutations:createFromTool",
				{
					orgId: tc.orgId,
					conversationId: tc.conversationId,
					widgetKey: args.widget ?? "",
					dealId,
					severity: args.severity,
					note: args.note,
					facts: args.facts,
					suggestedIntent: args.suggestedIntent,
				},
			)) as string;

			return {
				ok: true as const,
				data: { annotationId },
				summary: {
					headline: args.widget
						? `Pinned a ${args.severity} chip on ${args.widget}.`
						: `Pinned a ${args.severity} note in AI Pulse.`,
					table: [
						{ label: "Note", value: args.note },
						{ label: "Severity", value: args.severity },
					],
					suggestedNext: args.suggestedIntent
						? [{ label: "Investigate", intent: args.suggestedIntent }]
						: [],
				},
			};
		}),
});
