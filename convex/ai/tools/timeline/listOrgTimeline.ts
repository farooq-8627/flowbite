/**
 * convex/ai/tools/timeline/listOrgTimeline.ts
 *
 * Stage 4 of /SPRINT-PLAN.md (2026-05-26). Read-only `list_org_timeline`
 * tool — surfaces the org-wide activity feed for "what happened today?"
 * questions.
 *
 * Wraps `crm/shared/timeline/queries:getForOrg` (which gates on
 * `activityLogs.viewOrg` permission). Atomic — no propose / commit.
 *
 * For per-person ("what happened with Sarah this week?") use the existing
 * timeline UI on the profile page; the AI typically answers that via
 * search_crm + get_entity_detail. The dedicated org-wide tool is the
 * natural pairing for "give me a daily standup summary".
 */
import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { coerceInt, requirePermission, runTool, toolQuery } from "../_shared";
import { getTimelineCtx } from "./_context";

type TimelineRow = {
	_id: string;
	action: string;
	actorType?: string;
	createdAt: number;
	description?: string;
	personCode?: string;
	entityType?: string;
	entityId?: string;
	_color: string;
	_kind: string;
};

const ACTOR_ENUM = z.enum(["user", "ai", "system"]);

registerTool({
	name: "list_org_timeline",
	layer: "timeline",
	permission: "activityLogs.viewOrg",
	confirmation: "none",
	description:
		"List the org-wide activity feed (created / updated / stage-changed / converted / deleted). Optionally filter by actor (user vs AI vs system).",
	instruction: {
		whenToCall:
			"User asks 'what happened today?' / 'recent activity' / 'show me everything that changed' / 'what did the AI do' / 'what did Sara do this morning'. Use this for org-wide questions; for per-person history use search_crm + get_entity_detail instead.",
		whenNotToCall:
			"the user wants notes (use list_messages or search_crm) OR a single entity's history (the entity detail panel surfaces it).",
		synonyms: [
			"what happened",
			"recent activity",
			"daily standup",
			"who did what",
			"audit log",
		],
		goodExample: {
			description: "User: 'What did the AI do today?'",
			args: { actorType: "ai", limit: 50 },
		},
		badExample: {
			description: "User: 'What happened with Sara?'",
			args: {},
			whyBad: "Per-person timeline lives on the profile page; for the AI, prefer search_crm or get_entity_detail with the personCode.",
		},
	},
	runbook: {
		onSuccess:
			"Reply with 1-3 short bullet sentences summarising the most-recent activities. The structured table already lists them.",
		onValidationError: "If actorType is malformed, drop it and retry without the filter.",
		onEmpty:
			"Tell the user no activity is recorded for the requested filter and suggest broadening (drop the actorType or increase the limit).",
		onPermissionDenied:
			"Tell the user they need activityLogs.viewOrg permission. Suggest contacting an admin.",
	},
	schema: z.object({
		actorType: z
			.optional(ACTOR_ENUM)
			.describe("Filter by who performed the action — 'user', 'ai', or 'system'."),
		limit: coerceInt((n) => n.min(1).max(200).default(50)).describe(
			"Maximum number of entries. Default 50.",
		),
	}),
	execute: async (args) =>
		runTool(async () => {
			const tc = getTimelineCtx();
			requirePermission(tc.permissions, "activityLogs.viewOrg");

			const rows = (await toolQuery(tc, "crm/shared/timeline/queries:getForOrg", {
				orgId: tc.orgId,
				limit: args.limit ?? 50,
				actorType: args.actorType,
			})) as TimelineRow[];

			const headline =
				rows.length === 0
					? `No org activity in scope.`
					: `${rows.length} recent ${args.actorType ?? "all"}-actor entr${rows.length === 1 ? "y" : "ies"}.`;

			return {
				ok: true as const,
				data: { count: rows.length, entries: rows },
				summary: {
					headline,
					table: rows.slice(0, 10).map((r) => ({
						label: new Date(r.createdAt).toISOString().slice(11, 16),
						value: `${r.actorType ?? "user"} · ${r.description ?? r.action}`,
					})),
				},
			};
		}),
});
