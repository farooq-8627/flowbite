/**
 * core/ai/components/reasoning/parseReasoning.ts
 *
 * Convert the append-only `reasoning` string (written by the Convex
 * orchestrator's `streamLoop.ts`) into a structured list of cards. The
 * orchestrator emits these line shapes alongside free-form chain-of-thought:
 *
 *     → Calling `<toolName>`…
 *     ✓ `<toolName>` returned.
 *     ✗ `<toolName>` failed: <one-line-message>
 *
 * Anything that doesn't match a tool-line is treated as plain "thinking"
 * text and groups with adjacent thinking lines into a single card.
 *
 * The parser is intentionally tolerant: malformed lines fall through into
 * the current "thinking" buffer rather than being dropped, so the user
 * sees raw output if the orchestrator changes its log format.
 */

export type ParsedStep =
	| {
			kind: "thinking";
			text: string;
	  }
	| {
			kind: "tool-call";
			toolName: string;
			status: "in_progress" | "success" | "error";
			error?: string;
	  };

const TOOL_START_RE = /^→\s*Calling\s+`([^`]+)`…?$/u;
const TOOL_OK_RE = /^✓\s*`([^`]+)`\s+returned\.?$/u;
const TOOL_ERR_RE = /^✗\s*`([^`]+)`\s+failed:\s*(.*)$/u;

/**
 * Parse the append-only reasoning string into a list of chronological
 * steps. Adjacent thinking-text lines collapse into a single card. Tool
 * calls collapse start/success or start/error pairs into one card with
 * the final status.
 *
 * The current `thinkingState` arg lets us mark the LAST tool-call card as
 * "in_progress" when the orchestrator is between `→ Calling …` and
 * `✓ … returned`.
 */
export function parseReasoning(
	reasoning: string | null | undefined,
	currentState?:
		| "thinking"
		| "calling_tool"
		| "streaming"
		| "awaiting_approval"
		| "done"
		| "error",
	activeTool?: string | null,
): ParsedStep[] {
	if (!reasoning) return [];

	const lines = reasoning.split(/\r?\n/);
	const steps: ParsedStep[] = [];
	let thinkingBuf: string[] = [];

	const flushThinking = () => {
		if (thinkingBuf.length === 0) return;
		const text = thinkingBuf.join("\n").trim();
		if (text.length > 0) steps.push({ kind: "thinking", text });
		thinkingBuf = [];
	};

	const findOpenToolCard = (toolName: string): number => {
		// Walk back to find the most recent in-progress card for this tool.
		for (let i = steps.length - 1; i >= 0; i--) {
			const s = steps[i];
			if (s.kind === "tool-call" && s.toolName === toolName && s.status === "in_progress") {
				return i;
			}
		}
		return -1;
	};

	for (const raw of lines) {
		const line = raw.trim();
		if (line.length === 0) {
			// blank line — end the current thinking paragraph
			flushThinking();
			continue;
		}

		const startMatch = line.match(TOOL_START_RE);
		if (startMatch) {
			flushThinking();
			steps.push({
				kind: "tool-call",
				toolName: startMatch[1],
				status: "in_progress",
			});
			continue;
		}

		const okMatch = line.match(TOOL_OK_RE);
		if (okMatch) {
			const idx = findOpenToolCard(okMatch[1]);
			if (idx >= 0) {
				steps[idx] = { kind: "tool-call", toolName: okMatch[1], status: "success" };
			} else {
				steps.push({ kind: "tool-call", toolName: okMatch[1], status: "success" });
			}
			continue;
		}

		const errMatch = line.match(TOOL_ERR_RE);
		if (errMatch) {
			const idx = findOpenToolCard(errMatch[1]);
			const errStep: ParsedStep = {
				kind: "tool-call",
				toolName: errMatch[1],
				status: "error",
				error: errMatch[2].trim() || "Tool call failed.",
			};
			if (idx >= 0) {
				steps[idx] = errStep;
			} else {
				steps.push(errStep);
			}
			continue;
		}

		// Plain text — accumulate into the current thinking card.
		thinkingBuf.push(raw);
	}

	flushThinking();

	// Re-mark the active tool as in_progress if the orchestrator says so —
	// covers a race where `→ Calling …` already emitted but the parser
	// merged it into a thinking buffer.
	if (currentState === "calling_tool" && activeTool) {
		const last = steps.at(-1);
		if (
			!last ||
			last.kind !== "tool-call" ||
			last.toolName !== activeTool ||
			last.status !== "in_progress"
		) {
			steps.push({ kind: "tool-call", toolName: activeTool, status: "in_progress" });
		}
	}

	return steps;
}
