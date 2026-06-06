"use node";
/**
 * convex/ai/availableModels.ts
 *
 * Node-runtime helpers that surface the set of providers usable from the
 * platform side (i.e. via `process.env.*_API_KEY`). The V8 query
 * `keys:listAvailableProviders` covers BYOK; this action covers the env-var
 * side. The frontend merges the two in `useAvailableProviders`.
 *
 * Why a Node action: only Node functions can read `process.env` (V8 queries
 * see a frozen empty env). We expose this as an `action` so authenticated
 * callers can list which providers have platform fallback configured.
 *
 * Returns provider IDs only — never the key value or any hint.
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import { ERRORS } from "../_shared/errors";
import { PROVIDER_IDS, type ProviderId } from "./encryptionTypes";
import { getPlatformKey } from "./models";

/**
 * Returns the list of providers usable from the platform side — the union of:
 *   - providers whose platform env-var key is set (`getPlatformKey`), and
 *   - providers with an active owner-managed key in `platformAiKeys`
 *     (added via the Owner panel → AI keys).
 *
 * This is what lets a user with NO BYOK key see the platform's models in the
 * chat picker: the owner sets a key once in the panel and every member can
 * pick from that provider's models. Auth-gated to any signed-in user (no PII
 * or secret material is leaked — provider ids only).
 */
export const listPlatformProviders = action({
	args: {},
	handler: async (ctx): Promise<ProviderId[]> => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new ConvexError(ERRORS.UNAUTHORIZED);
		const dbProviderIds = (await ctx.runQuery(
			internal._platform.aiKeys.queries.listActivePlatformProviderIds,
			{},
		)) as string[];
		const dbProviders = new Set(dbProviderIds);
		return PROVIDER_IDS.filter((p) => getPlatformKey(p) !== null || dbProviders.has(p));
	},
});

/**
 * Documented mapping from provider id to the env var the platform reads.
 * Kept here (V8-safe constants) so the admin page can render it.
 */
export const ENV_VAR_NAME: Record<ProviderId, string> = {
	anthropic: "ANTHROPIC_API_KEY",
	openai: "OPENAI_API_KEY",
	google: "GOOGLE_GENERATIVE_AI_API_KEY",
	xai: "XAI_API_KEY",
	groq: "GROQ_API_KEY",
	mistral: "MISTRAL_API_KEY",
	openrouter: "OPENROUTER_API_KEY",
	nvidia: "NVIDIA_API_KEY",
	moonshot: "MOONSHOT_API_KEY",
	custom: "(N/A — BYOK only)",
};

/**
 * Platform-admin only: returns each provider plus a boolean `isSet` flag,
 * suitable for an "AI providers" admin page that shows env-var status.
 *
 * Gated by `users.platformRole === "super_admin"`.
 */
export const adminListProviderStatus = action({
	args: {},
	handler: async (
		ctx,
	): Promise<Array<{ provider: ProviderId; envVar: string; isSet: boolean }>> => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new ConvexError(ERRORS.UNAUTHORIZED);

		const user = await ctx.runQuery(internal.users.queries.getById, { userId });
		if (!user || user.platformRole !== "super_admin") {
			throw new ConvexError(ERRORS.SUPER_ADMIN_REQUIRED);
		}

		return PROVIDER_IDS.map((p) => ({
			provider: p,
			envVar: ENV_VAR_NAME[p],
			isSet: getPlatformKey(p) !== null,
		}));
	},
});
