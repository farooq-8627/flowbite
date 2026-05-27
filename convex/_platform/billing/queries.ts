/**
 * Owner-panel billing-settings queries — convex/_platform/billing/queries.ts
 *
 * Read-only inspection of which billing env vars are configured. NEVER
 * returns the actual values (those would be secrets) — only `present`
 * booleans. The owner uses this to confirm production env is wired up
 * without exposing keys to the client bundle.
 *
 * Editing the env vars themselves is out of scope for v1 (Tier B —
 * deferred to `Future-Enhancements.md`); operators set them in the
 * Convex dashboard.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §5 row 4.
 */
import { query } from "../../_generated/server";
import { requirePlatformOwner } from "../ownerAuth";

const LEMONSQUEEZY_KEYS = [
	"LEMONSQUEEZY_API_KEY",
	"LEMONSQUEEZY_STORE_ID",
	"LEMONSQUEEZY_WEBHOOK_SECRET",
	"LEMONSQUEEZY_VARIANT_ID_FREE",
	"LEMONSQUEEZY_VARIANT_ID_STARTER",
	"LEMONSQUEEZY_VARIANT_ID_PRO",
	"LEMONSQUEEZY_VARIANT_ID_ENTERPRISE",
];

const RAZORPAY_KEYS = ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"];

const RESEND_KEYS = ["RESEND_API_KEY", "RESEND_FROM_EMAIL", "APP_PUBLIC_URL"];

function summarise(keys: ReadonlyArray<string>): Array<{ key: string; present: boolean }> {
	return keys.map((key) => ({
		key,
		present: Boolean(process.env[key]?.trim()),
	}));
}

/**
 * Return a per-provider summary of env-var presence. Each entry is
 * `{ key, present }` — never the actual value.
 */
export const getProviderConfig = query({
	args: {},
	handler: async (ctx) => {
		await requirePlatformOwner(ctx);
		return {
			lemonSqueezy: summarise(LEMONSQUEEZY_KEYS),
			razorpay: summarise(RAZORPAY_KEYS),
			email: summarise(RESEND_KEYS),
		};
	},
});
