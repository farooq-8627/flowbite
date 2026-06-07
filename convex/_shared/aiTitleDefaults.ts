/**
 * convex/_shared/aiTitleDefaults.ts
 *
 * SSOT for "default" `aiConversations.title` values that the auto-titler
 * is allowed to overwrite. Imported by:
 *   - `convex/ai/titleGeneration.ts:autoTitle` — pre-call short-circuit
 *   - `convex/ai/conversations.ts:setAutoTitleInternal` — write-side guard
 *   - `convex/ai/messages.ts:sendMessage` — decides whether to re-schedule
 *     auto-title on later turns (when the first message produced "New chat")
 *
 * Why this is a SSOT.
 *   The auto-title prompt in `titleGeneration.ts` explicitly tells the
 *   model "if vague, output 'New chat'". Small/free models (e.g. NVIDIA
 *   Llama-3.3-70B free, OpenRouter's GLM 4.5 Air free) over-trigger that
 *   branch — they label legitimately-clear prompts as vague and lock the
 *   conversation at "New chat" forever. Without this list, both the
 *   pre-call short-circuit AND the DB-write guard treat "New chat" as a
 *   user-set rename and refuse to overwrite it on the next user turn.
 *
 *   `Untitled conversation` is the legacy V1 placeholder; "New chat"
 *   matches the prompt verbatim; "New Chat" is the title-cased variant
 *   ("Title case." rule in the title-prompt). All three are "default
 *   placeholder" — re-titling on a clearer message is allowed.
 *
 * Pure constants + pure helper. Safe to import from Node actions
 * (`titleGeneration.ts` uses `"use node"`) and from V8 mutation files
 * (`conversations.ts`, `messages.ts`).
 */

/** Lowercased set of titles the auto-titler is allowed to overwrite. */
const DEFAULT_TITLE_SET = new Set<string>(["untitled conversation", "new chat"]);

/**
 * `true` when the title is empty / null / undefined OR exactly matches a
 * placeholder we know the auto-titler emitted itself. Comparison is
 * case-insensitive + whitespace-trimmed because models occasionally
 * vary capitalisation despite the "Title case" rule.
 */
export function isDefaultConversationTitle(title: string | undefined | null): boolean {
	const trimmed = (title ?? "").trim();
	if (trimmed.length === 0) return true;
	return DEFAULT_TITLE_SET.has(trimmed.toLowerCase());
}
