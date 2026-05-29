/**
 * convex/ai/tools/dashboard/renderWidget.ts
 *
 * Stage 5 — render_widget tool. Pins an AI-rendered widget cell on the
 * calling user's dashboard (per-user, 24h TTL).
 *
 * Calls `dashboard/ephemeralCells/mutations:pinForAI`. The cell shows
 * up in `<AIPinnedRow>` above the regular dashboard layout. The user
 * can dismiss it (× button) or promote it to their permanent layout
 * via the "Pin to my dashboard" button.
 *
 * Permission: `ai.use`. Confirmation: twoStep. Approval category:
 * `settings` is too restrictive (per locked decision #26 hard-locked
 * categories always ask). We use a NEW `ask_user` flavour... no,
 * we'll fall through `confirmation: twoStep` only since this is an
 * AI-scoped write the user wants visibility into the propose card.
 */

import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { optionalString, propose, requirePermission, runTool, toolMutation } from "../_shared";
import { getDashboardCtx } from "./_context";

const SUPPORTED_WIDGETS = [
	"pipeline.salesPanel",
	"invoices.aging",
	"properties.funnel",
	"deals.arrCohort",
	"calendar.weekAhead",
	"activity.recent",
	"messages.recent",
	"tasks.list",
	"today.focus",
	"calendar.mini",
] as const;

registerTool({
	name: "render_widget",
	layer: "dashboard",
	permission: "ai.use",
	confirmation: "twoStep",
	approvalCategory: "create_record",
	description: "Pin an AI-rendered widget on the calling user's dashboard for the next 24 hours.",
	instruction: {
		whenToCall:
			"Use when the user says 'show me X on my dashboard', 'pin this chart', 'add Y to my view', or 'render the pipeline funnel inline'. The tool surfaces a propose card; user approval pins the widget for 24h on THEIR dashboard only (per-user, never org-wide).",
		whenNotToCall:
			"the user wants to permanently change the workspace dashboard for everyone (use Settings → Dashboard) OR the user wants the data inline in chat (use the analytical layer's read tools instead — analyze_metric, list_pipelines, get_dashboard_summary).",
		preflight: ["list_widgets"],
		requiredClarifications: ["widget"],
		synonyms: [
			"pin chart",
			"show on dashboard",
			"add a tile",
			"render",
			"drop on the dashboard",
		],
		goodExample: {
			description: "User: 'Pin the sales pipeline panel above my dashboard.'",
			args: {
				widget: "pipeline.salesPanel",
				title: "Sales pipeline (pinned by AI)",
			},
		},
		badExample: {
			description: "User: 'Permanently add this widget to everyone's dashboard.'",
			args: { widget: "pipeline.salesPanel" },
			whyBad: "render_widget is per-user 24h pin only. AI cannot write the org-wide layout. Tell the user to use Settings → Dashboard for permanent edits.",
		},
	},
	runbook: {
		onSuccess:
			"Reply with ONE concise sentence ('Pinned the sales pipeline above your dashboard for 24 hours.'). The propose card already showed the widget preview.",
		onValidationError:
			"Group all failed fields and call ask_user_input ONCE. Don't retry with the same args.",
		onPermissionDenied:
			"Tell the user they need ai.use permission and suggest contacting an admin.",
		suggestNext: "annotate_widget",
	},
	schema: z.object({
		widget: z
			.enum(SUPPORTED_WIDGETS)
			.describe(
				"Widget kind to pin. Must be one of the registered widgets — call list_widgets if unsure.",
			),
		title: optionalString().describe("Optional custom title (≤80 chars)."),
	}),
	execute: async (args) => {
		const { permissions } = getDashboardCtx();
		requirePermission(permissions, "ai.use");
		return propose("render_widget", args, {
			title: `Pin ${args.widget} to your dashboard`,
			fields: [
				{ label: "Widget", value: args.widget },
				{ label: "Title", value: args.title ?? "(default label)" },
				{ label: "Visible to", value: "Only you" },
				{ label: "Lifetime", value: "24 hours (or until you dismiss)" },
			],
		});
	},
});

registerTool({
	name: "commit_render_widget",
	layer: "dashboard",
	permission: "ai.use",
	confirmation: "none",
	description:
		"Internal: commit a pre-approved render_widget call. Do not call without prior render_widget approval.",
	schema: z.object({
		widget: z.enum(SUPPORTED_WIDGETS),
		title: optionalString(),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getDashboardCtx();
			requirePermission(tc.permissions, "ai.use");
			const cellId = (await toolMutation(tc, "dashboard/ephemeralCells/mutations:pin", {
				orgId: tc.orgId,
				widgetKey: args.widget,
				title: args.title,
				args: { widget: args.widget, title: args.title },
				conversationId: tc.conversationId,
			})) as string;
			return {
				ok: true as const,
				data: { cellId, widget: args.widget },
				summary: {
					headline: `Pinned ${args.widget} above your dashboard.`,
					table: [
						{ label: "Widget", value: args.widget },
						{ label: "Lifetime", value: "24 hours" },
						{ label: "Scope", value: "Visible only to you" },
					],
					suggestedNext: [
						{
							label: "Annotate this widget",
							intent: `Annotate the ${args.widget} widget with a note.`,
						},
						{
							label: "Pin permanently",
							intent: "Open my dashboard so I can pin this to my permanent layout.",
						},
					],
				},
			};
		}),
});
