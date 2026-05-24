/**
 * convex/ai/subagents/types.ts
 *
 * Week 2.1 — `PHASE-3-AI-AUDIT.md §6 Week 2` & §2.4 (Salesforce subagents,
 * Anthropic Routing pattern).
 *
 * Each subagent is a POJO that declares:
 *   - `id`               — stable identifier (`crm_action`, `qa`, …). Persisted
 *                          on `aiMessages.subagent` so we can grep the activity
 *                          log by specialist.
 *   - `displayName`      — human-readable; used in audit cards / UI.
 *   - `description`      — semantic descriptor consumed by the classifier in
 *                          `router.ts`. Salesforce's "≤10 actions per subagent"
 *                          rule applies here too: descriptions MUST be
 *                          semantically distinct so the classifier can route
 *                          unambiguously (audit §2.4).
 *   - `systemPromptHint` — appended to the per-subagent system prompt block;
 *                          frames the role for the model in 2-3 sentences.
 *   - `allowedTools`     — array of tool names. The orchestrator filters the
 *                          full registry down to this set before exposing it
 *                          to the model. `"*"` means "every tool the role +
 *                          tier already allow" (used by the catch-all
 *                          `crm_action` so we don't have to maintain a 30-name
 *                          list when adding new tools).
 *   - `requiredPermissions` — every permission in this list must be present
 *                          on the calling user OR the router falls back to
 *                          the catch-all subagent. Lets us hide `settings`
 *                          from non-admins.
 *   - `modelTierFloor`   — minimum tier for the SUBAGENT itself (not the
 *                          classifier). `"small"` lets cheap models drive,
 *                          `"standard"` forces an upgrade. Defaults to small.
 *
 * The router runs a small classifier model (Haiku-class) against the user's
 * latest turn + last assistant message + route context, returns `{id,
 * confidence}`, and the orchestrator loads only that subagent's prompt +
 * tools. See `convex/ai/orchestrator/router.ts`.
 */

import type { ModelTier } from "../models";

export type SubagentId = "crm_action" | "qa" | "enrichment" | "csv_import" | "settings";

export type Subagent = {
	id: SubagentId;
	displayName: string;
	description: string;
	systemPromptHint: string;
	/**
	 * Tool names the subagent is allowed to call. `"*"` is a wildcard meaning
	 * "every tool the user's role + tier already exposes" — used by the
	 * catch-all `crm_action` subagent so adding a new always-on tool doesn't
	 * require touching the subagent definitions.
	 */
	allowedTools: string[] | "*";
	/**
	 * If any of these permissions are missing, the router demotes to the
	 * fallback subagent (`crm_action`). Empty list = no restriction.
	 */
	requiredPermissions: string[];
	/**
	 * Minimum tier the SUBAGENT itself runs at. Independent of the small
	 * classifier model used by the router. Defaults to `small` so all
	 * subagents are usable on Haiku/Llama-3.3 BYOK setups.
	 */
	modelTierFloor?: ModelTier;
};
