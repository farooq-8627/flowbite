/**
 * Seed the 4 built-in WhatsApp templates into `whatsappTemplates`.
 *
 * Idempotent: each (templateId, orgId=undefined) pair is created only
 * when missing. Re-running the migration is a no-op even after admins
 * have customised an org override — built-ins live on a separate row
 * (`orgId === undefined`) so the seed never clobbers customer data.
 *
 * Running:
 *   npx convex run _migrations/2026_06_05_seedDefaultWhatsappTemplates:run '{"dryRun": true}'
 *   npx convex run _migrations/2026_06_05_seedDefaultWhatsappTemplates:run '{}'
 *
 * Seed source: `convex/ai/channels/whatsappTemplates.ts:DEFAULT_WHATSAPP_TEMPLATES`.
 * That const stays as the canonical seed input — never as a runtime
 * fallback. Once this migration has run, every read at the AI runtime
 * hits the `whatsappTemplates` table directly (B.40 acceptance).
 *
 * Spec: `Future-Enhancements.md §B.40` (now ✅ shipped).
 */

import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { DEFAULT_WHATSAPP_TEMPLATES } from "../ai/channels/whatsappTemplates";

export const run = internalMutation({
	args: { dryRun: v.optional(v.boolean()) },
	handler: async (ctx, args) => {
		const dryRun = args.dryRun === true;
		const now = Date.now();
		const summary: Array<{ templateId: string; action: "inserted" | "skipped" }> = [];

		for (const seed of DEFAULT_WHATSAPP_TEMPLATES) {
			// `by_template_org` index keys on (templateId, orgId). For built-in
			// rows orgId is undefined; Convex stores undefined as missing in
			// the index, and `.eq("orgId", undefined)` matches that bucket.
			const existing = await ctx.db
				.query("whatsappTemplates")
				.withIndex("by_template_org", (q) =>
					q.eq("templateId", seed.id).eq("orgId", undefined),
				)
				.unique();

			if (existing) {
				summary.push({ templateId: seed.id, action: "skipped" });
				continue;
			}

			if (!dryRun) {
				await ctx.db.insert("whatsappTemplates", {
					templateId: seed.id,
					orgId: undefined,
					label: seed.label,
					description: seed.description,
					category: seed.category,
					body: seed.body,
					variables: seed.variables.map((vv) => ({
						name: vv.name,
						description: vv.description,
						defaultValue: vv.defaultValue,
					})),
					contentSid: seed.contentSid,
					approvalStatus: seed.contentSid ? "approved" : "draft",
					isBuiltIn: true,
					active: true,
					updatedBy: undefined,
					createdAt: now,
					updatedAt: now,
				});
			}
			summary.push({ templateId: seed.id, action: "inserted" });
		}

		return { ok: true, dryRun, summary };
	},
});
