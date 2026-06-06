/**
 * V8 sister file to `runtime/autonomous.ts` (which is `"use node"`).
 *
 * Convex requires `internalQuery` / `internalMutation` to live in V8 files
 * (not `"use node"`), so the engine's debounce marker reads/writes live
 * here. The Node engine imports them via `internal.ai.runtime.autonomousState.*`.
 *
 * This file also owns the pure helpers + constants that the engine reuses
 * — keeping them V8-side means tests + the wrapper can import them without
 * pulling in `@ai-sdk/*`.
 */
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { internalMutation, internalQuery } from "../../_generated/server";

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * Debounce window: skip a new autonomous turn for the same conversation
 * within this many milliseconds. The lead's WhatsApp box can fire several
 * messages in quick succession; we want one turn that sees the union of
 * recent context, not one per message.
 */
export const DEBOUNCE_MS = 8_000;

/** Marker tool name used by the audit / debounce rows. */
export const AUTONOMOUS_TURN_MARKER = "(autonomous_turn)";

/** Per-event TTL on the marker rows — 30 days, matches `telemetry.ts`. */
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// ─── Pure helpers ──────────────────────────────────────────────────────────

/**
 * Compose the autonomous prompt the model receives. The PROJECT drive +
 * "## Autonomy mode" block are added by the host (`runtime/host.ts`); this
 * helper only carries the user-prompt position — i.e. the transcript and
 * the goals checklist. Must stay tight (every token here is per-turn).
 */
export function buildAutonomousPrompt(args: {
	transcript: string;
	idempotencyKey?: string;
}): string {
	const lines = [
		"You are observing a conversation transcript with a lead/customer. Reason over the FULL transcript before acting.",
		"",
		"Goals (in order):",
		"  1. Dedup → call `search_crm` with the lead's name + phone/email BEFORE any `create_lead`. If a match exists, prefer `update_entity` over creating a duplicate.",
		"  2. Create the lead ONLY when name + (phone OR email) are present in the transcript. With less signal, record an `add_note` summarising the inbound and stop.",
		"  3. Capture typed fields visible in the transcript via `update_entity` after the lead exists (budget, area, propertyType, etc., per `describe_entity`).",
		'  4. Schedule any time-bound follow-ups via `create_task` (`type:"followup"`).',
		"  5. Persist a short summary via `add_note`.",
		"",
		"Never message the customer in this turn. Ask the AGENT only — and only when a required field is missing/ambiguous.",
		"",
		"Transcript:",
		args.transcript.trim(),
	];
	if (args.idempotencyKey) {
		lines.push("", `Idempotency key: ${args.idempotencyKey}`);
	}
	return lines.join("\n");
}

/**
 * Pure: returns true when at least one supplied marker row matches the
 * conversation AND fell within `windowMs` of `now`. Caller-supplied list
 * keeps the helper unit-testable; production fetches via
 * `recentAutonomousTurns`.
 */
export function hasRecentAutonomousTurn(
	events: ReadonlyArray<{
		startedAt: number;
		conversationId?: Id<"aiConversations"> | null | undefined;
	}>,
	conversationId: Id<"aiConversations">,
	now: number,
	windowMs: number = DEBOUNCE_MS,
): boolean {
	return events.some((e) => e.conversationId === conversationId && now - e.startedAt < windowMs);
}

// ─── Internal queries / mutations ──────────────────────────────────────────

/**
 * List recent autonomous-turn marker rows for an org. Bounded by the
 * `by_org_and_tool_and_started` index — `(orgId, toolName, startedAt)` —
 * so the read touches only rows in the (small) recent window.
 */
export const recentAutonomousTurns = internalQuery({
	args: {
		orgId: v.id("orgs"),
		sinceMs: v.number(),
	},
	handler: async (ctx, args) => {
		const sinceTs = Date.now() - args.sinceMs;
		const rows = await ctx.db
			.query("aiToolEvents")
			.withIndex("by_org_and_tool_and_started", (q) =>
				q
					.eq("orgId", args.orgId)
					.eq("toolName", AUTONOMOUS_TURN_MARKER)
					.gte("startedAt", sinceTs),
			)
			.take(50);
		return rows.map((r) => ({
			startedAt: r.startedAt,
			conversationId: r.conversationId,
			triggeredBy: r.triggeredBy,
		}));
	},
});

/**
 * Write a marker row for a finished autonomous turn. Doubles as the
 * debounce surface (`recentAutonomousTurns`) and the per-turn audit row.
 */
export const recordAutonomousTurn = internalMutation({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		conversationId: v.optional(v.id("aiConversations")),
		startedAt: v.number(),
		durationMs: v.number(),
		ok: v.boolean(),
		triggeredBy: v.string(),
		inputTokens: v.optional(v.number()),
		outputTokens: v.optional(v.number()),
		errorMessage: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		await ctx.db.insert("aiToolEvents", {
			orgId: args.orgId,
			userId: args.userId,
			conversationId: args.conversationId,
			toolName: AUTONOMOUS_TURN_MARKER,
			layer: "autonomous",
			startedAt: args.startedAt,
			durationMs: args.durationMs,
			ok: args.ok,
			errorMessage: args.errorMessage?.slice(0, 500),
			inputTokens: args.inputTokens,
			outputTokens: args.outputTokens,
			triggeredBy: args.triggeredBy,
			expiresAt: now + RETENTION_MS,
		});
	},
});
