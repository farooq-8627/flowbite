"use node";

/**
 * Owner-panel OTP — outbound email action.
 *
 * Convex mutations cannot make network calls; the Resend send happens
 * in this Node action which is scheduled by `requestOtp` immediately
 * (`runAfter(0, ...)`).
 *
 * Soft-failure semantics: when Resend is unconfigured (`RESEND_API_KEY`
 * unset) the action logs a warning and returns. The OTP row still
 * exists in the DB so a developer running locally can read the code
 * out of `npx convex run` if they need to test the verify path.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §2.5 step 4.
 */
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";

export const sendOwnerOtpEmail = internalAction({
	args: {
		otpId: v.id("platformOwnerOtps"),
		code: v.string(),
	},
	handler: async (ctx, args) => {
		// Lazy-import the email helpers — keeps the V8 bundle small (this
		// callback only runs from a Node action). Same pattern as
		// `convex/invitations/actions.ts`.
		const { sendEmail, renderOwnerOtpEmail } = await import("../../../lib/email");

		const ownerOtp = await ctx.runQuery(internal._platform.otp.queries.getOwnerOtpRow, {
			otpId: args.otpId,
		});
		if (!ownerOtp) {
			console.warn("[owner.otp] sendOwnerOtpEmail: row vanished before send.");
			return { ok: false as const, reason: "row_missing" as const };
		}

		const { subject, html, text } = renderOwnerOtpEmail({
			code: args.code,
			expiresAt: ownerOtp.expiresAt,
			requestIp: ownerOtp.ip ?? null,
			requestUserAgent: ownerOtp.userAgent ?? null,
			appName: process.env.APP_PUBLIC_NAME ?? "Orbitly",
		});

		const result = await sendEmail({
			to: ownerOtp.email,
			subject,
			html,
			text,
		});

		if (!result.ok) {
			console.warn(
				`[owner.otp] sendOwnerOtpEmail: ${result.reason}${
					"error" in result && result.error ? ` — ${result.error}` : ""
				}`,
			);
		}

		return result;
	},
});
