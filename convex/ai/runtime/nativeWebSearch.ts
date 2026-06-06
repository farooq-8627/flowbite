"use node";
/**
 * Native server-side web search wiring.
 *
 * Some providers expose web search as a SERVER-SIDE tool the model invokes
 * inline without round-tripping through our action — citations + snippets
 * appear in the response with no extra wiring. We layer this on TOP of the
 * Firecrawl-backed `web_search` capability (registered in
 * `convex/ai/creative/capabilities.ts`) so:
 *
 *   • On Anthropic / OpenAI Responses API → the model picks the fastest
 *     surface (typically native, since latency + citations are richer).
 *   • On Google → grounding is enabled via `providerOptions.google.useSearchGrounding`
 *     so the model's responses are search-grounded automatically.
 *   • On every other provider (Groq, Mistral, NVIDIA, Moonshot, OpenRouter,
 *     xAI, custom OpenAI-compat) → only the Firecrawl-backed `web_search`
 *     capability is available. Fallback works on every model.
 *
 * The native tools are passed to `streamText({ tools })` as PROVIDER-DEFINED
 * tools — the AI SDK forwards them to the provider unchanged; we do not
 * implement an `execute()`. Names use the `_native` suffix so they can
 * coexist with our Firecrawl-backed `web_search` capability without
 * collision.
 *
 * Sources:
 * - Anthropic web_search tool:
 *   https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/web-search-tool
 * - AI SDK Anthropic provider tools:
 *   https://ai-sdk.dev/providers/ai-sdk-providers/anthropic#web-search
 * - OpenAI Responses API web search:
 *   https://platform.openai.com/docs/guides/tools-web-search
 * - AI SDK OpenAI provider tools:
 *   https://ai-sdk.dev/providers/ai-sdk-providers/openai#web-search-tool
 * - Google Gemini grounding:
 *   https://ai.google.dev/gemini-api/docs/grounding
 * - AI SDK Google provider grounding:
 *   https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai#search-grounding
 */
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";

import type { ProviderId } from "../encryptionTypes";

/**
 * Provider-defined tool dict to merge into `streamText({ tools })`. Keys
 * use the `_native` suffix so the model sees them as separate tools from
 * our Firecrawl-backed `web_search` and the system prompt can describe
 * the choice.
 *
 * Empty when the provider has no native server-side search OR when
 * grounding is enabled via `providerOptions` instead (Google).
 */
export function nativeSearchTools(provider: ProviderId | string): Record<string, unknown> {
	switch (provider) {
		case "anthropic":
			// Anthropic's server-side web search returns the tool's results
			// as a normal toolResult chunk; the model answers with citations
			// inline. `maxUses` caps invocations per turn so a model can't
			// burn the whole step budget on searches.
			return {
				web_search_native: anthropic.tools.webSearch_20250305({ maxUses: 5 }),
			};
		case "openai":
			// OpenAI's Responses API exposes a server-side `web_search` tool.
			// The Chat Completions path doesn't (it requires the model to
			// call our Firecrawl-backed `web_search` instead). The AI SDK
			// raises a friendly error if the model doesn't support it, but
			// only at runtime — we still ship it because top-tier OpenAI
			// models all use the Responses API in this codebase.
			return {
				web_search_native: openai.tools.webSearchPreview({}),
			};
		default:
			return {};
	}
}

/**
 * Provider options to merge into `streamText({ providerOptions })`. Used
 * for Gemini grounding (a provider option, not a tool the model invokes).
 *
 * Empty when no provider-specific options apply.
 *
 * Shape mirrors AI SDK's `SharedV3ProviderOptions` — `Record<string, JSONObject>`.
 */
export function nativeSearchProviderOptions(
	provider: ProviderId | string,
): Record<string, Record<string, boolean | number | string>> {
	switch (provider) {
		case "google":
			// Setting `useSearchGrounding` makes Gemini ground every response
			// in live web search, with no tool name the model has to call.
			// Citations land on the `providerMetadata.google.groundingMetadata`
			// payload; the assistant text already contains inline-cited
			// snippets from Google's grounding service.
			return { google: { useSearchGrounding: true } };
		default:
			return {};
	}
}

/**
 * Whether this provider exposes native web search the model can call inline.
 * Used by the system-prompt builder to mention `web_search_native` only on
 * providers that actually expose it.
 */
export function providerHasNativeWebSearch(provider: ProviderId | string): boolean {
	return provider === "anthropic" || provider === "openai" || provider === "google";
}
