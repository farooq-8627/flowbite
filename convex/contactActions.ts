"use node";

/**
 * Contact email action — convex/contactActions.ts
 *
 * Internal action scheduled by `contact.submit`. Sends the enquiry to the
 * operator via the project's existing Resend integration (`lib/email.ts`).
 * Delivery target is `CONTACT_TO_EMAIL` (Convex deployment env). If unset,
 * the submission is still saved (by the mutation) — we just record
 * `skipped_no_recipient`.
 *
 * To receive emails, set in the Convex deployment env:
 *   npx convex env set CONTACT_TO_EMAIL "you@yourdomain.com"
 *   (RESEND_API_KEY + RESEND_FROM_EMAIL must already be configured.)
 */
import { v } from "convex/values";
import { sendEmail } from "../lib/email";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

const INTEREST_LABELS: Record<string, string> = {
	product: "Using the product",
	"custom-crm": "A custom CRM for my business",
	"custom-website": "A custom website / web app",
	migration: "Migrating from another CRM",
	other: "Something else",
};

function esc(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export const sendContactEmail = internalAction({
	args: {
		submissionId: v.id("contactSubmissions"),
		name: v.string(),
		email: v.string(),
		company: v.optional(v.string()),
		interest: v.string(),
		message: v.string(),
	},
	handler: async (ctx, args) => {
		const to = process.env.CONTACT_TO_EMAIL;
		if (!to) {
			console.warn("[contact] CONTACT_TO_EMAIL not set — submission saved, email skipped");
			await ctx.runMutation(internal.contact.markEmailStatus, {
				submissionId: args.submissionId,
				status: "skipped_no_recipient",
			});
			return;
		}

		const appName = process.env.APP_PUBLIC_NAME ?? "Orbitly";
		const interestLabel = INTEREST_LABELS[args.interest] ?? args.interest;
		const result = await sendEmail({
			to,
			replyTo: args.email,
			subject: `New ${appName} enquiry — ${interestLabel}`,
			html: `<h2>New enquiry from the ${appName} landing page</h2>
<p><strong>Name:</strong> ${esc(args.name)}</p>
<p><strong>Email:</strong> ${esc(args.email)}</p>
<p><strong>Company:</strong> ${esc(args.company || "—")}</p>
<p><strong>Interested in:</strong> ${esc(interestLabel)}</p>
<p><strong>Message:</strong></p>
<p>${esc(args.message).replace(/\n/g, "<br/>")}</p>`,
		});

		if (!result.ok) console.error("[contact] email send failed", result);
		await ctx.runMutation(internal.contact.markEmailStatus, {
			submissionId: args.submissionId,
			status: result.ok ? "sent" : "failed",
		});
	},
});
