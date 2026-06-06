/**
 * Timeline capability — read-only org-wide activity feed for the AI.
 *
 * Surface (1 cap in the `timeline` group):
 *
 *   list_org_timeline    org-wide activity log (created / updated / stage_changed
 *                        / converted / deleted / etc.) with optional actorType
 *                        filter (user / ai / system).
 *
 * Per-person history is intentionally NOT exposed as its own AI tool — the
 * profile page surfaces it for humans, and for the AI `search_crm` +
 * `get_entity_detail` (with the personCode) is the natural pairing. The
 * dedicated org-wide tool exists for "daily standup" / "what changed today?"
 * style questions.
 *
 * Backed by `internal.crm.shared.timeline.queries.getForOrgForAI` (already
 * RBAC-checked via `requireRole(member.permissions, "activityLogs.viewOrg")`).
 */
import { z } from "zod";
import { internal } from "../../../_generated/api";
import { defineCapability } from "../../../ai/registry/define";
import { defineGroup } from "../../../ai/registry/groups";
import { ok } from "../../../ai/registry/result";

const ACTOR_TYPE = z.enum(["user", "ai", "system"]);

// ─── Group playbook ─────────────────────────────────────────────────────────

defineGroup({
	name: "timeline",
	playbook: `Use \`list_org_timeline\` for org-wide questions ("what happened today?", "recent activity", "what did the AI do this morning"). Optionally filter by \`actorType\` ('user' / 'ai' / 'system'). For per-person history, prefer \`search_crm\` + \`get_entity_detail\` — the timeline tool isn't scoped to a person.

Permission: \`activityLogs.viewOrg\` — admins/owners only by default. If the caller doesn't have it, the wrapper returns \`denied\` before the query runs.`,
});

// ─── list_org_timeline ──────────────────────────────────────────────────────

const listOrgTimeline = defineCapability<{
	actorType?: "user" | "ai" | "system";
	limit?: number;
}>({
	name: "list_org_timeline",
	module: "timeline",
	group: "timeline",
	permission: "activityLogs.viewOrg",
	risk: "safe",
	channels: ["chat", "mcp", "rest"], // not whatsapp — admin surface.
	spec: {
		whenToCall:
			"Org-wide activity feed. Use for 'what happened today?', 'recent activity', 'who did what', 'what did the AI do', 'audit log', 'daily standup'. Optionally filter by actor.",
		whenNotToCall:
			"the user wants ONE person's history — use search_crm + get_entity_detail with the personCode. The user wants notes (use list_org_notes / search_crm). Per-entity timelines are exposed via the entity detail panels, not this tool.",
		synonyms: [
			"what happened",
			"recent activity",
			"daily standup",
			"who did what",
			"audit log",
		],
		goodExample: { actorType: "ai", limit: 50 },
		badExample: {
			args: {},
			why: "no filter is fine, but if the user said 'what did the AI do', pass actorType:'ai' so the answer matches their intent.",
		},
	},
	drive: {
		onSuccess:
			"Reply with 1-3 short bullet sentences summarising the most-recent activities. The structured table already lists them.",
		onEmpty:
			"Tell the user no activity is recorded for the requested filter and suggest broadening (drop the actorType or increase the limit).",
	},
	input: z.object({
		actorType: ACTOR_TYPE.optional().describe(
			"Filter by who performed the action. 'user' = a person, 'ai' = the AI agent, 'system' = a cron/trigger.",
		),
		limit: z
			.number()
			.int()
			.min(1)
			.max(200)
			.optional()
			.default(50)
			.describe("Max entries returned. Default 50."),
	}),
	run: async (cap, args) => {
		const { ctx, principal } = cap;
		const rows = (await ctx.runQuery(internal.crm.shared.timeline.queries.getForOrgForAI, {
			orgId: principal.orgId,
			userId: principal.userId,
			actorType: args.actorType,
			limit: args.limit ?? 50,
		})) as Array<{
			_id: string;
			action: string;
			actorType?: string;
			createdAt: number;
			description?: string;
			personCode?: string;
			entityType?: string;
		}>;

		if (rows.length === 0) {
			return ok({
				headline: "No org activity in scope.",
				facts: [
					"Try without the actorType filter, or increase the limit to look further back.",
				],
				data: { count: 0, entries: [] as unknown[] },
			});
		}

		const top = rows.slice(0, 10);
		return ok({
			headline: `${rows.length} recent ${args.actorType ?? "all"}-actor entr${rows.length === 1 ? "y" : "ies"}.`,
			changes: top.map((r) => ({
				label: new Date(r.createdAt).toISOString().slice(11, 16),
				value: `${r.actorType ?? "user"} · ${r.description ?? r.action}${r.personCode ? ` (${r.personCode})` : ""}`,
				emphasis: "unchanged" as const,
			})),
			data: { count: rows.length, entries: rows },
		});
	},
});

// ─── Public surface ─────────────────────────────────────────────────────────

export const TIMELINE_CAPABILITIES = [listOrgTimeline];
