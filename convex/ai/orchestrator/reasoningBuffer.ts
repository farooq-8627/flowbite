/**
 * convex/ai/orchestrator/reasoningBuffer.ts
 *
 * Helpers for the reasoning panel that bound the cost of dumping tool
 * errors and chain-of-thought traces into the DB.
 *
 * Why a separate file: previously baked into processChat. Splitting it
 * out lets `messages.ts::patchThinkingState` reuse the same hard cap
 * constant (REASONING_HARD_CAP) that the live stream loop relies on,
 * and makes the truncation semantics easy to tweak in one place.
 */

/** Cap a tool-error before it lands in the reasoning panel. */
export const REASONING_ERROR_CAP = 280;

/** Total reasoning budget across an entire turn (8 KB). */
export const REASONING_HARD_CAP = 8_000;

/** Marker we append when the budget is reached. */
export const REASONING_TRUNCATION_MARKER =
	"\n… [reasoning truncated — too many steps, see chat for outcome] …";

/**
 * Format a tool error for the reasoning panel.
 *
 * Tool errors are often multi-KB Zod validation blobs ({path, message,
 * expected, received} per failed field, JSON-stringified). Dumping them
 * verbatim into the reasoning panel:
 *   - Overflows the chat sidebar horizontally (single tokens hundreds of chars long).
 *   - Burns reasoning-budget — a single error can fill the 8KB cap on its own.
 *   - Confuses the model — it reads its own JSON dump and tends to retry.
 *
 * We extract the error message, strip JSON arrays/objects, and cap to ~280 chars.
 * The model still gets the full structured error in the tool-result payload —
 * this only affects what the user sees in the reasoning panel.
 */
export function formatToolErrorForReasoning(rawMsg: string): string {
	const oneLine = rawMsg.replace(/\s+/g, " ").trim();

	// If it looks like a Zod error JSON ("[ { ... } ]"), summarise the field paths.
	const zodMatch = oneLine.match(/^[^[]*\[\s*\{[\s\S]*\}\s*\]/);
	if (zodMatch) {
		const fieldMatches = oneLine.match(/"path"\s*:\s*\[\s*"([^"]+)"/g);
		if (fieldMatches && fieldMatches.length > 0) {
			const fields = fieldMatches
				.map((m) => m.match(/"([^"]+)"\s*\]?\s*$/)?.[1])
				.filter(Boolean)
				.slice(0, 8);
			return `validation failed on: ${fields.join(", ")}`;
		}
	}

	if (oneLine.length <= REASONING_ERROR_CAP) return oneLine;
	return `${oneLine.slice(0, REASONING_ERROR_CAP)}… (truncated)`;
}
