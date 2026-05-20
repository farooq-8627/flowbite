"use node";

/**
 * Invitation actions — convex/invitations/actions.ts
 *
 * Mutations cannot make outbound HTTP calls (they're deterministic +
 * transactional). The "send the invitation email" effect therefore lives in
 * an internal action, scheduled by `invitations.create` after the row is
 * inserted.
 *
 * Soft-failure semantics: if RESEND_API_KEY is unset OR Resend returns an
 * error, the action logs to the activity log and returns. The mutation
 * itself never fails because of email — the inviter still gets the accept
 * URL via the mutation's return value, and they can copy it manually.
 */
import { v } from "convex/values";
import { getAppPublicUrl, renderInvitationEmail, sendEmail } from "../../lib/email";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";

export const sendInvitationEmail = internalAction({
	args: {
		invitationId: v.id("invitations"),
	},
	handler: async (ctx, args) => {
		const data = await ctx.runQuery(internal.invitations.queries.getForEmail, {
			invitationId: args.invitationId,
		});
		if (!data) return { ok: false, reason: "not_found" as const };

		const acceptUrl = `${getAppPublicUrl()}/join/${data.token}`;
		const email = renderInvitationEmail({
			orgName: data.orgName,
			role: data.role,
			inviterName: data.inviterName,
			inviterEmail: data.inviterEmail,
			acceptUrl,
			expiresAt: data.expiresAt,
			appName: process.env.APP_PUBLIC_NAME ?? "Orbitly",
		});

		const result = await sendEmail({
			to: data.email,
			subject: email.subject,
			html: email.html,
			text: email.text,
			replyTo: data.inviterEmail ?? undefined,
		});

		// Audit + telemetry: record success / soft-failure on the activity log.
		await ctx.runMutation(internal.invitations.mutations.recordEmailDelivery, {
			invitationId: args.invitationId,
			ok: result.ok,
			detail: result.ok
				? `sent (id=${result.id})`
				: result.reason === "missing_api_key"
					? "skipped: RESEND_API_KEY not configured"
					: `failed: ${result.error ?? "unknown error"}`,
		});

		return result;
	},
});
