/**
 * ResendOTPPasswordReset — Convex Auth password-reset OTP provider.
 *
 * Plugs into the `Password({ reset: ... })` config in `convex/auth.ts`.
 * Convex Auth invokes `sendVerificationRequest` whenever a user calls
 * `signIn("password", { flow: "reset", email })` and again with a
 * non-empty `code` for `flow: "reset-verification"`.
 *
 * Token format: 8-digit numeric OTP.
 *
 * IMPORTANT: This module uses the canonical Convex Auth `Email`
 * provider (from `@convex-dev/auth/providers/Email`) — NOT the
 * `Resend` provider from `@auth/core/providers/resend`. The Convex
 * Auth provider runs cleanly inside Convex's V8 isolate; the
 * Auth.js OAuth provider does not. The `resend` SDK is dynamically
 * imported inside the callback (the callback runs in Node).
 *
 * Source pattern: https://github.com/get-convex/convex-auth-example/blob/main/convex/passwordReset/ResendOTPPasswordReset.ts
 */

import { Email } from "@convex-dev/auth/providers/Email";

export const ResendOTPPasswordReset = Email({
	id: "resend-otp-password-reset",
	apiKey: process.env.RESEND_API_KEY,
	async generateVerificationToken() {
		// 8-digit numeric OTP — easy to type, hard to brute-force inside
		// the 1-hour window Convex Auth allows.
		const bytes = new Uint8Array(8);
		crypto.getRandomValues(bytes);
		return Array.from(bytes)
			.map((b) => (b % 10).toString())
			.join("");
	},
	async sendVerificationRequest({ identifier: email, provider, token, expires }) {
		const apiKey = (provider as { apiKey?: string }).apiKey ?? process.env.RESEND_API_KEY;
		if (!apiKey) {
			console.warn("[auth.reset] RESEND_API_KEY unset — skipping email send.");
			return;
		}

		// Lazy-load the Resend SDK + email template — keeps the V8
		// bundle small (this callback only runs from a Node action).
		const { Resend: ResendAPI } = await import("resend");
		const { renderPasswordResetEmail, getEmailFrom } = await import("../lib/email");

		const resend = new ResendAPI(apiKey);
		const expiresAt = expires instanceof Date ? expires.getTime() : Date.now() + 3600_000;

		const { subject, html, text } = renderPasswordResetEmail({
			resetUrl: token,
			expiresAt,
		});

		// Embed the OTP code prominently — the template was originally
		// built for link-flow; this swap makes the code the focus.
		const otpHtml = html.replace(
			'<a href="' + token,
			`<div style="font-size:28px;font-weight:700;letter-spacing:0.15em;background:#f1f5f9;padding:14px 18px;border-radius:8px;text-align:center;margin:0 0 12px 0;">${token}</div><a hidden="" href="`,
		);
		const otpText = `Your password reset code: ${token}\n\n${text}`;

		const { error } = await resend.emails.send({
			from: getEmailFrom(),
			to: [email],
			subject,
			html: otpHtml,
			text: otpText,
		});
		if (error) {
			throw new Error(`Could not send password reset email: ${error.message}`);
		}
	},
});
