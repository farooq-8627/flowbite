/**
 * One-shot migration (2026-05-19) — set `org.settings.defaultCurrency` for
 * orgs that don't have one yet.
 *
 * Why
 * ───
 * Existing orgs created before the currency picker shipped don't have a
 * `defaultCurrency` value. The dashboard + deal-value formatters then fall
 * back to `"USD"` (see `orgs/queries.ts::getDashboardStats`). For a
 * real-estate workspace targeting the UAE market that is materially wrong
 * — every figure is shown in the wrong currency.
 *
 * What
 * ────
 * For each org the caller targets, sets `settings.defaultCurrency` to the
 * provided ISO 4217 code (e.g. "AED", "INR", "EUR"). Idempotent — already
 * matching values are left alone.
 *
 * Usage
 * ─────
 *   # Set the currency on a single org:
 *   npx convex run _migrations/setOrgDefaultCurrency:run \
 *     '{"orgId":"<id>","currency":"AED"}'
 *
 *   # Set the currency on every org missing one:
 *   npx convex run _migrations/setOrgDefaultCurrency:run \
 *     '{"currency":"AED","onlyMissing":true}'
 *
 * The Settings → CRM page is the long-term home for this — when a workspace
 * admin opens that page, the currency picker writes through `orgs.update`.
 * This migration covers existing rows whose admins haven't visited the
 * settings page yet.
 */

import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";

const SUPPORTED_CURRENCIES = new Set(["USD", "EUR", "GBP", "AED", "INR", "SAR", "AUD", "CAD"]);

export const run = internalMutation({
	args: {
		currency: v.string(),
		orgId: v.optional(v.id("orgs")),
		onlyMissing: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const code = args.currency.trim().toUpperCase();
		if (!SUPPORTED_CURRENCIES.has(code)) {
			throw new ConvexError(
				`Unsupported currency code "${args.currency}". Supported: ${[...SUPPORTED_CURRENCIES].join(", ")}.`,
			);
		}

		const orgs = args.orgId
			? [await ctx.db.get(args.orgId)].filter((o): o is NonNullable<typeof o> => !!o)
			: await ctx.db.query("orgs").collect();

		const now = Date.now();
		const report: Array<{
			orgId: Id<"orgs">;
			orgName: string;
			before: string | null;
			after: string;
			changed: boolean;
		}> = [];

		for (const org of orgs) {
			const existing = org.settings?.defaultCurrency ?? null;

			// Only-missing mode skips orgs that already have *any* value.
			if (args.onlyMissing && existing) {
				report.push({
					orgId: org._id,
					orgName: org.name,
					before: existing,
					after: existing,
					changed: false,
				});
				continue;
			}

			if (existing === code) {
				report.push({
					orgId: org._id,
					orgName: org.name,
					before: existing,
					after: code,
					changed: false,
				});
				continue;
			}

			await ctx.db.patch(org._id, {
				settings: {
					...(org.settings ?? {}),
					defaultCurrency: code,
				},
				updatedAt: now,
			});

			report.push({
				orgId: org._id,
				orgName: org.name,
				before: existing,
				after: code,
				changed: true,
			});
		}

		return {
			updated: report.filter((r) => r.changed).length,
			total: report.length,
			report,
		};
	},
});
