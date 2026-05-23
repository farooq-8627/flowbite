"use node";
/**
 * convex/ai/orchestrator/suggestionGenerator.ts
 *
 * Sprint 5 — generate 2-3 short follow-up prompts after the assistant
 * finishes a turn. Persisted on `aiMessages.suggestions` and rendered
 * as clickable chips above the composer.
 *
 * Cost discipline:
 *   - Uses the BRIEFING tier model (Haiku-class) — not the user's chat
 *     model. Suggestions are background polish, not hot-path output.
 *   - Caps output at ~200 tokens.
 *   - Bails silently when no platform key is configured for the
 *     briefing provider — chat still works, just no chips.
 *
 * Output contract: pure string array. The model is told to return JSON
 * but we strip code fences and fall back to splitting on newlines if
 * parsing fails. Worst case: empty array → no chips.
 */
import { generateText } from "ai";
import type { ProviderId } from "../encryptionTypes";
import {
	buildLanguageModel,
	getPlatformKey,
	MODEL_REGISTRY,
	PLATFORM_BRIEFING_MODEL,
} from "../models";

export type SuggestionInput = {
	/** Last 1-2 user prompts to anchor the suggestions. */
	userMessages: string[];
	/** The assistant's latest reply. */
	assistantReply: string;
};

/**
 * Generate 2-3 follow-up suggestion strings. Always returns an array
 * (possibly empty). Errors are logged + swallowed — chat already
 * succeeded; failed suggestions must NEVER bubble.
 */
export async function generateSuggestions(input: SuggestionInput): Promise<string[]> {
	// Trim inputs aggressively — the suggester only needs the gist.
	const lastUser = (input.userMessages.at(-1) ?? "").slice(0, 600);
	const replySnippet = input.assistantReply.slice(0, 1200);
	if (!lastUser && !replySnippet) return [];

	const briefingModelKey = process.env.AI_BRIEFING_MODEL ?? PLATFORM_BRIEFING_MODEL;
	const info = MODEL_REGISTRY[briefingModelKey] ?? MODEL_REGISTRY[PLATFORM_BRIEFING_MODEL];
	const apiKey = getPlatformKey(info.provider as ProviderId);
	if (!apiKey) return []; // platform billing not configured — no chips.

	const prompt = `You're suggesting 2-3 short next-prompt ideas a CRM user might want to ask after this exchange.

LAST USER MESSAGE
${lastUser}

ASSISTANT REPLY
${replySnippet}

TASK
Reply with ONLY a JSON array of 2-3 strings — no prose, no code fences. Each string is a prompt the user might type next.

Rules:
- Keep each suggestion under 8 words.
- Make them ACTIONABLE (e.g. "Set a reminder for next week", "Find similar leads").
- Don't repeat what the assistant just did.
- Output ONLY the JSON array.`;

	try {
		const model = buildLanguageModel({
			provider: info.provider as ProviderId,
			modelId: info.modelId,
			apiKey,
		});

		const result = await generateText({
			model: model as Parameters<typeof generateText>[0]["model"],
			prompt,
			temperature: 0.5,
			maxOutputTokens: 200,
		});

		const cleaned = result.text
			.trim()
			.replace(/^```(?:json)?\s*/i, "")
			.replace(/```\s*$/i, "")
			.trim();

		try {
			const parsed = JSON.parse(cleaned);
			if (Array.isArray(parsed)) {
				return parsed
					.filter((s): s is string => typeof s === "string" && s.length > 0)
					.slice(0, 3)
					.map((s) => s.trim());
			}
		} catch {
			// fall through to line-split fallback
		}

		// Fallback: split on newlines, take up to 3 short non-empty lines.
		return cleaned
			.split(/\r?\n/)
			.map((s) => s.replace(/^[\s\-*•"]+|["\s,]+$/g, "").trim())
			.filter((s) => s.length > 0 && s.length < 80)
			.slice(0, 3);
	} catch (err) {
		console.warn("[suggestionGenerator] failed:", err);
		return [];
	}
}
