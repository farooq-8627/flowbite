/**
 * Contact-form handlers — convex/contact.ts
 *
 * `submit` is the public mutation the landing page calls. It ALWAYS saves the
 * enquiry to the `contactSubmissions` table (so nothing is lost and you can
 * see every submission in the Convex dashboard → Data → contactSubmissions),
 * then schedules `sendContactEmail` to email the operator. The email side is
 * best-effort: it only sends when `CONTACT_TO_EMAIL` is set in the Convex
 * deployment env (and uses the existing `RESEND_API_KEY`). `emailStatus`
 * records what happened.
 *
 * SECURITY: unauthenticated endpoint. Has a honeypot + validation + length
 * caps; rate-limiting / CAPTCHA is still pending (Future-Enhancements.md §B.36).
 */
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";

export const submit = mutation({
	args: {
		name: v.string(),
		email: v.string(),
		company: v.optional(v.string()),
		interest: v.string(),
		message: v.string(),
		website: v.optional(v.string()), // honeypot — must be empty
	},
	handler: async (ctx, args): Promise<{ ok: boolean }> => {
		// Honeypot tripped → pretend success and drop silently.
		if (args.website && args.website.length > 0) return { ok: true };

		const name = args.name.trim().slice(0, 100);
		const email = args.email.trim().slice(0, 200);
		const message = args.message.trim().slice(0, 4000);
		const company = (args.company ?? "").trim().slice(0, 150) || undefined;
		if (name.length < 2 || message.length < 10 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
			throw new ConvexError({
				code: "INVALID",
				message: "Please fill in the form correctly.",
			});
		}

		const now = Date.now();
		const submissionId = await ctx.db.insert("contactSubmissions", {
			name,
			email,
			company,
			interest: args.interest,
			message,
			emailStatus: "skipped_no_recipient", // provisional — the email action updates this
			createdAt: now,
			updatedAt: now,
		});

		await ctx.scheduler.runAfter(0, internal.contactActions.sendContactEmail, {
			submissionId,
			name,
			email,
			company,
			interest: args.interest,
			message,
		});

		return { ok: true };
	},
});

/** Internal — called by the email action to record the delivery outcome. */
export const markEmailStatus = internalMutation({
	args: {
		submissionId: v.id("contactSubmissions"),
		status: v.union(v.literal("sent"), v.literal("skipped_no_recipient"), v.literal("failed")),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(args.submissionId, { emailStatus: args.status });
	},
});
