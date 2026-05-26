/**
 * convex/ai/tools/analytics/refreshBriefing.ts
 *
 * Stage 7 (`/SPRINT-PLAN.md`) — atomic, rate-limited (5/min/user) tool
 * that schedules a fresh daily briefing for the calling user. Wraps the
 * existing `refreshNowForAI` mutation in `briefingsPublic.ts`.
 *
 * Cost class: `normal`. The briefing itself is Haiku-tier so a single
 * fire is cheap, but the 5/min cap on the rate limiter keeps a runaway
 * model from burning through token budget.
 */

import { z } from "zod";
import { registerTool } from "../../toolRegistry";
import { runTool, toolMutation } from "../_shared";
import { getAnalyticsCtx } from "./_context";

registerTool({
	name: "refresh_briefing",
	layer: "analytics",
	permission: "ai.briefingRefresh",
	confirmation: "none",
	costClass: "normal",
	instruction: {
		whenToCall:
			"Use when the user explicitly asks to regenerate / refresh / re-run their briefing. Schedules the briefing action; the new briefing replaces the cached one within ~30 seconds.",
		whenNotToCall:
			"Don't use to READ the briefing (use get_briefing). Don't use the org's weekly insight refresh — the weekly cron runs Sundays and isn't user-triggerable.",
		preflight: [],
		synonyms: ["refresh briefing", "regenerate briefing", "re-run my briefing"],
		goodExample: {
			description: "User says 'refresh my morning briefing'.",
			args: {},
		},
	},
	description: "Stub — overridden by buildToolDescription via instruction.",
	runbook: {
		onSuccess:
			"Tell the user the briefing has been scheduled and will appear in ~30 seconds. Don't pretend the briefing is ready — read get_briefing on the next turn if the user asks.",
		onPermissionDenied:
			"Tell the user only members with the `ai.briefingRefresh` permission can manually refresh.",
	},
	example: {},
	schema: z.object({}),
	execute: async () =>
		runTool(async () => {
			const tc = getAnalyticsCtx();
			await toolMutation(tc, "ai/briefingsPublic:refreshNow", { orgId: tc.orgId });
			return {
				ok: true as const,
				data: { scheduled: true },
				display: {
					kind: "text" as const,
					text: "Briefing refresh scheduled. The new briefing will appear in your dashboard within ~30 seconds.",
				},
			};
		}),
});
