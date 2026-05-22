/**
 * convex/ai/encryptionTypes.ts
 *
 * V8-safe sibling of encryption.ts.
 *
 * encryption.ts uses `node:crypto` and is marked "use node", so it can ONLY
 * be imported from files that also opt into the Node.js runtime. V8 queries /
 * mutations that need the *types* or the pure provider-detection helpers
 * import from this file instead — keeping `node:crypto` out of the V8 bundle.
 *
 * What lives here (pure, deterministic, V8-safe):
 *   - ProviderId union
 *   - PROVIDER_IDS list (for UI dropdowns)
 *   - detectProvider(apiKey)
 *   - keyHint(apiKey)
 *
 * What lives in encryption.ts ("use node" only):
 *   - encryptApiKey(plaintext)
 *   - decryptApiKey(payload)
 */

export type ProviderId =
	| "anthropic"
	| "openai"
	| "google"
	| "xai"
	| "groq"
	| "mistral"
	| "openrouter"
	| "nvidia"
	| "moonshot"
	| "custom";

/**
 * Canonical list of provider ids — used to populate the BYOK provider
 * dropdown and to enumerate platform env vars on the admin page.
 */
export const PROVIDER_IDS: readonly ProviderId[] = [
	"anthropic",
	"openai",
	"google",
	"xai",
	"groq",
	"mistral",
	"openrouter",
	"nvidia",
	"moonshot",
	"custom",
] as const;

/**
 * Auto-detect provider from key prefix patterns where possible.
 * Pure string inspection — safe in both V8 and Node runtimes.
 *
 * NOTE: many providers use the generic `sk-…` prefix (OpenAI, Moonshot,
 * Together AI, Fireworks, etc.). For those we return "custom" and let the
 * UI ask the user to pick the provider explicitly via the BYOK form.
 */
export function detectProvider(apiKey: string): ProviderId {
	if (apiKey.startsWith("sk-ant-")) return "anthropic";
	if (apiKey.startsWith("sk-proj-")) return "openai";
	if (apiKey.startsWith("gsk_")) return "groq";
	if (apiKey.startsWith("xai-")) return "xai";
	if (apiKey.startsWith("AIza")) return "google";
	if (apiKey.startsWith("sk-or-")) return "openrouter";
	if (apiKey.startsWith("nvapi-")) return "nvidia";
	if (apiKey.startsWith("mist-") || apiKey.startsWith("MSK_")) return "mistral";
	// Ambiguous `sk-…` keys (OpenAI legacy + Moonshot/Kimi + others) cannot
	// be reliably distinguished by prefix. Fall back to "custom" so the UI
	// can require the user to pick a provider explicitly.
	return "custom";
}

/**
 * Returns the last 4 characters of an API key for UI display hint.
 * e.g. "sk-ant-api03-...xyz" → "...xyz"
 *
 * Pure string slice — safe in both V8 and Node runtimes.
 */
export function keyHint(plaintext: string): string {
	return `...${plaintext.slice(-4)}`;
}
