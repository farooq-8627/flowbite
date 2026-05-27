"use node";
/**
 * convex/ai/orchestrator/router.ts
 *
 * Week 2.2 — small-model classifier (`PHASE-3-AI-AUDIT.md §6 Week 2`,
 * Anthropic Routing pattern from §2.1, Salesforce Topic Selector from
 * §2.4).
 *
 * Picks ONE subagent for the user's latest turn. Goal:
 *   - Route Q&A questions to the read-only `qa` subagent (Haiku-fast,
 *     no risk of `create_field` hallucination).
 *   - Route admin requests to `settings` (auto-demote on missing perm).
 *   - Route enrichment / csv hints to their respective specialists so
 *     they hit "this ships in Week N" placeholders rather than the
 *     generic catch-all.
 *   - Fall back to `crm_action` for everything else.
 *
 * Cost discipline (mirrors `suggestionGenerator.ts`):
 *   - Uses the BRIEFING tier model (Haiku-class), not the chat model.
 *   - Caps output at 200 tokens.
 *   - Bails to a heuristic shortlist when no platform key is configured
 *     for the briefing provider — chat still works, just with the
 *     deterministic regex router.
 *   - Hard 4-second wall-clock timeout. Past that we fall back —
 *     classifier latency must NEVER block the user.
 *
 * The router NEVER throws. Every failure path returns a `{subagent,
 * confidence, source}` so the caller doesn't need a try/catch.
 */
import { generateText } from "ai";
import type { ProviderId } from "../encryptionTypes";
import {
	buildLanguageModel,
	getPlatformKey,
	MODEL_REGISTRY,
	PLATFORM_BRIEFING_MODEL,
} from "../models";
import {
	FALLBACK_SUBAGENT_ID,
	resolveSubagentForUser,
	SUBAGENT_IDS,
	SUBAGENTS,
	type Subagent,
	type SubagentId,
} from "../subagents";

export type RouterDecision = {
	/** The actually-loaded subagent (after permission demotion). */
	subagent: Subagent;
	/** The classifier's first-pick id BEFORE permission demotion. */
	requested: SubagentId;
	/** Whether the user lacked one of the requested subagent's permissions. */
	demoted: boolean;
	/** Heuristic / classifier confidence in [0,1]. 0.5 is the demote threshold. */
	confidence: number;
	/** Where the decision came from — useful for telemetry + debugging. */
	source: "heuristic" | "classifier" | "fallback";
};

const CLASSIFIER_TIMEOUT_MS = 4000;
const CONFIDENCE_FALLBACK_FLOOR = 0.6;

/**
 * Build the classifier prompt. Includes a JSON-only directive +
 * one-line semantic descriptors per subagent (audit §2.4 — descriptions
 * MUST be semantically distinct).
 */
function buildClassifierPrompt(args: {
	userMessage: string;
	priorAssistant: string | null;
	routeContextSummary: string | null;
}): string {
	const subagentList = SUBAGENT_IDS.map((id) => {
		const sub = SUBAGENTS[id];
		return `- "${sub.id}" — ${sub.description}`;
	}).join("\n");

	const priorBlock = args.priorAssistant
		? `\nLAST ASSISTANT REPLY (truncated)\n${args.priorAssistant.slice(0, 600)}\n`
		: "";

	const ctxBlock = args.routeContextSummary
		? `\nROUTE CONTEXT\n${args.routeContextSummary.slice(0, 400)}\n`
		: "";

	return `You are a routing classifier for a CRM assistant. Pick the ONE subagent that should handle the user's latest message.

SUBAGENTS
${subagentList}

USER MESSAGE
${args.userMessage.slice(0, 1200)}
${priorBlock}${ctxBlock}
RULES
- Pick exactly one subagent id from: ${SUBAGENT_IDS.map((id) => `"${id}"`).join(", ")}.
- Return ONLY a JSON object with shape {"subagent": "<id>", "confidence": <0..1>}.
- No prose, no code fences.
- "qa" is for read-only questions only — NEVER for create / update / delete.
- "settings" is for workspace-config changes — NEVER for individual records.
- When in doubt, pick "crm_action".
`;
}

/**
 * Heuristic shortlist used when the LLM classifier is unavailable
 * (no key, timed out, parse error). Pattern order matters: more-specific
 * rules first.
 *
 * Stage 3-A H1 fix (2026-05-26): the original settings rule fired on any
 * `(create|update|...) ... (stage|pipeline|tag|...)` pair, which caught
 * messages like *"create a followup for p-007 on this thursday for next
 * stage work please"* — `create` matches settingsVerbs, `stage` (in "next
 * stage work") matches settingsNouns, confidence 0.65 ≥ floor 0.6, so the
 * heuristic locked the request to the `settings` subagent whose narrow
 * allow-list does NOT include `create_followup`. The fix:
 *   1. Add an explicit CRM-action heuristic BEFORE settings — followup /
 *      remind / note / tag this / convert / move to / send msg / draft /
 *      summarise verbs all pin to `crm_action @ 0.75` and skip the
 *      settings heuristic entirely.
 *   2. Tighten the settings rule: it must match a verb-noun BIGRAM that
 *      is unambiguous (e.g. "rename pipeline", "add stage to ... pipeline",
 *      "create new pipeline", "manage role", "delete tag") rather than a
 *      simple disjunction. Bare nouns "stage" / "pipeline" / "tag" /
 *      "field" no longer trigger settings on their own.
 */
function heuristicClassify(message: string): { id: SubagentId; confidence: number } {
	const m = message.toLowerCase();

	// CSV / spreadsheet phrasing → csv_import.
	if (
		/\b(csv|spreadsheet|\.csv|excel|xlsx|import\s+(my|the)?\s*(contacts|leads|file|sheet))\b/i.test(
			message,
		)
	) {
		return { id: "csv_import", confidence: 0.7 };
	}

	// Enrichment phrasing.
	if (
		/\b(enrich|enrichment|find\s+(?:the\s+)?(?:email|phone|linkedin)|look\s*up\s+(?:on\s+linkedin)|fill\s+in\s+missing)\b/i.test(
			message,
		)
	) {
		return { id: "enrichment", confidence: 0.7 };
	}

	// Stage 3-A H1 — CRM-action verbs pin to `crm_action` BEFORE the
	// settings heuristic so collisions like "create a followup ... next
	// stage" can never get routed to settings. The verbs are deliberately
	// the high-frequency CRM gestures (follow-ups, reminders, notes,
	// tags-on-records, conversions, stage moves, messaging, drafting,
	// summarising). Whitespace tolerance: \b on both ends, plus optional
	// hyphen/space between "follow" and "up".
	if (
		/\b(follow[\s-]?up|followup|remind\s+me|remind\s+(?:them|him|her|us|the)|set\s+a\s+reminder|create\s+a?\s*(?:followup|follow[\s-]?up|reminder)|add\s+(?:a\s+)?note|note\s+for|note\s+on|call\s+back|check\s+in\s+with|nudge|tag\s+this|attach\s+to|convert\s+(?:this|the|to)|move\s+(?:to|d-\d+|the\s+deal)|send\s+(?:a?\s*)?(?:message|msg)|dm\s+(?!sara|user|them)?|draft\s+(?:a|me)?|write\s+(?:a|me)?\s+(?:message|msg|email|note)|summari[sz]e|recap|qualify|disqualify|push\s+(?:the|my)?\s*reminder|reschedule)\b/.test(
			m,
		)
	) {
		return { id: "crm_action", confidence: 0.75 };
	}

	// Workspace-settings phrasing — verb-noun BIGRAMS only, not loose
	// disjunctions. Each pattern is unambiguous: "rename pipeline" can ONLY
	// mean editing the pipeline definition, never operating on a deal.
	// Allow descriptive words between `the` and the noun: "rename the Sales
	// pipeline to Renewals" must still match (the/Sales/pipeline tokens).
	if (
		/\b(rename\s+(?:the\s+)?(?:[\w-]+\s+){0,3}(?:pipeline|stage|label|tag|workflow|field|role|note\s+category)|change\s+(?:the\s+)?(?:[\w-]+\s+){0,3}(?:currency|timezone|workspace|org)|set\s+(?:the\s+)?(?:[\w-]+\s+){0,3}(?:default\s+(?:pipeline|stage|note\s+category)|workspace|org\s+name|currency|timezone)|update\s+(?:the\s+)?(?:[\w-]+\s+){0,3}(?:workspace|org\s+settings|currency|timezone|pipeline\s+definition)|edit\s+(?:the\s+)?(?:[\w-]+\s+){0,3}(?:pipeline|stage|workspace|org|role|tag|label|field\s+definition|saved\s+view)|configure\s+(?:the\s+)?(?:[\w-]+\s+){0,3}(?:pipeline|workspace|org|notification)|add\s+(?:a\s+|the\s+)?(?:[\w-]+\s+){0,3}(?:stage\s+to|tag\s+(?:named|called)|field\s+(?:to|named|called)|saved\s+view\s+(?:named|called)|role\s+(?:named|called)|member\b|invitation)|remove\s+(?:the\s+)?(?:[\w-]+\s+){0,3}(?:stage|tag|field|saved\s+view|role|member|invitation|note\s+category)|create\s+(?:a\s+|new\s+|a\s+new\s+|the\s+)?(?:[\w-]+\s+){0,3}(?:pipeline|stage|tag|field|saved\s+view|role|note\s+category|invitation)|delete\s+(?:the\s+)?(?:[\w-]+\s+){0,3}(?:pipeline|stage|tag|field|saved\s+view|role|member|invitation|note\s+category)|invite\s+(?:a\s+|the\s+)?(?:member|user|teammate)|invite\s+\S+@\S+|manage\s+(?:role|tag|saved\s+view|member|permission)|reorder\s+(?:stages|tags|fields|note\s+categories)|apply\s+(?:the\s+)?(?:[\w-]+\s+){0,3}template)\b/.test(
			m,
		)
	) {
		return { id: "settings", confidence: 0.7 };
	}

	// Pure read questions ("what / which / who / how many / can I / show me / list").
	if (
		/^(what|which|who|how\s+many|can\s+i|show\s+me|list|find|search|do\s+i\s+have|are\s+there)\b/i.test(
			message.trim(),
		)
	) {
		// "show me + entity" without a write verb still routes here.
		if (!/(create|add|update|edit|delete|remove|move|invite)\b/i.test(m)) {
			return { id: "qa", confidence: 0.62 };
		}
	}

	return { id: FALLBACK_SUBAGENT_ID, confidence: 0.4 };
}

type ClassifyArgs = {
	userMessage: string;
	priorAssistant: string | null;
	routeContextSummary: string | null;
	permissions: string[];
};

/**
 * Pick a subagent. Always returns a decision — never throws.
 *
 * Strategy: heuristic first (cheap, deterministic), then classifier when
 * heuristic confidence is below the floor. Demotion happens after the
 * classifier so the router never picks a subagent the user can't use.
 */
export async function classifyRequest(args: ClassifyArgs): Promise<RouterDecision> {
	const heur = heuristicClassify(args.userMessage);

	// If the heuristic is highly confident, skip the LLM entirely. Saves
	// 200-400ms on every routed turn.
	if (heur.confidence >= CONFIDENCE_FALLBACK_FLOOR) {
		const { subagent, demoted } = resolveSubagentForUser({
			requested: heur.id,
			permissions: args.permissions,
		});
		return {
			subagent,
			requested: heur.id,
			demoted,
			confidence: heur.confidence,
			source: "heuristic",
		};
	}

	// Try the classifier. It needs the briefing platform key.
	const briefingModelKey = process.env.AI_BRIEFING_MODEL ?? PLATFORM_BRIEFING_MODEL;
	const info = MODEL_REGISTRY[briefingModelKey] ?? MODEL_REGISTRY[PLATFORM_BRIEFING_MODEL];
	const apiKey = getPlatformKey(info.provider as ProviderId);

	if (!apiKey) {
		// No briefing key set → return the heuristic verdict, marked as
		// fallback so telemetry can see "we never reached the classifier".
		const { subagent, demoted } = resolveSubagentForUser({
			requested: heur.id,
			permissions: args.permissions,
		});
		return {
			subagent,
			requested: heur.id,
			demoted,
			confidence: heur.confidence,
			source: "fallback",
		};
	}

	const prompt = buildClassifierPrompt({
		userMessage: args.userMessage,
		priorAssistant: args.priorAssistant,
		routeContextSummary: args.routeContextSummary,
	});

	try {
		const model = buildLanguageModel({
			provider: info.provider as ProviderId,
			modelId: info.modelId,
			apiKey,
		});

		const result = await Promise.race([
			generateText({
				model: model as Parameters<typeof generateText>[0]["model"],
				prompt,
				temperature: 0.0,
				maxOutputTokens: 200,
			}),
			new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new Error("router classifier timeout")),
					CLASSIFIER_TIMEOUT_MS,
				),
			),
		]);

		const cleaned = result.text
			.trim()
			.replace(/^```(?:json)?\s*/i, "")
			.replace(/```\s*$/i, "")
			.trim();

		const parsed = safeParseDecision(cleaned);
		if (!parsed) {
			const { subagent, demoted } = resolveSubagentForUser({
				requested: heur.id,
				permissions: args.permissions,
			});
			return {
				subagent,
				requested: heur.id,
				demoted,
				confidence: heur.confidence,
				source: "fallback",
			};
		}

		const { subagent, demoted } = resolveSubagentForUser({
			requested: parsed.id,
			permissions: args.permissions,
		});
		return {
			subagent,
			requested: parsed.id,
			demoted,
			confidence: parsed.confidence,
			source: "classifier",
		};
	} catch (err) {
		console.warn("[router] classifier failed:", err);
		const { subagent, demoted } = resolveSubagentForUser({
			requested: heur.id,
			permissions: args.permissions,
		});
		return {
			subagent,
			requested: heur.id,
			demoted,
			confidence: heur.confidence,
			source: "fallback",
		};
	}
}

function safeParseDecision(raw: string): { id: SubagentId; confidence: number } | null {
	try {
		const obj = JSON.parse(raw) as { subagent?: unknown; confidence?: unknown };
		const idCandidate = typeof obj.subagent === "string" ? obj.subagent : "";
		const confCandidate = typeof obj.confidence === "number" ? obj.confidence : 0.5;
		if (!SUBAGENT_IDS.includes(idCandidate as SubagentId)) return null;
		const clamped = Math.min(1, Math.max(0, confCandidate));
		return { id: idCandidate as SubagentId, confidence: clamped };
	} catch {
		return null;
	}
}

// Exported for the agentScorer test harness.
export { heuristicClassify };
