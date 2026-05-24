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

	// Workspace-settings phrasing (admin verbs paired with config nouns).
	const settingsVerbs = /(rename|change|set|update|edit|configure|invite|remove|create)/;
	const settingsNouns =
		/(label|labels|currency|timezone|pipeline|stage|workflow|field|fields|member|members|invitation|tag|saved\s*view|note\s*category|template|workspace|settings|permission|role)/;
	if (settingsVerbs.test(m) && settingsNouns.test(m)) {
		return { id: "settings", confidence: 0.65 };
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
