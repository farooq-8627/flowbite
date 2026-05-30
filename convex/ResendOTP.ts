/**
 * ResendOTP — Convex Auth email-verification OTP provider.
 *
 * Plugs into the `Password({ verify: ... })` config in `convex/auth.ts`.
 * When a user signs up via password, Convex Auth invokes
 * `sendVerificationRequest` to send the OTP, returns a non-signed-in
 * response, and the client redirects to `/verify-email?email=...`. The
 * user enters the code and the SDK calls
 * `signIn("password", { flow: "email-verification", email, code })`,
 * which authenticates them.
 *
 * Token format: 8-digit numeric OTP.
 *
 * IMPORTANT: This module uses the canonical Convex Auth `Email`
 * provider (from `@convex-dev/auth/providers/Email`) — NOT the Auth.js
 * `Resend` provider. The Convex Auth provider runs cleanly inside
 * Convex's V8 isolate; the Auth.js OAuth provider does not. The `resend`
 * SDK is dynamically imported inside the callback (it's safe to import
 * here because the callback only runs from a Convex action context where
 * outbound HTTP is allowed).
 *
 * Source pattern: https://labs.convex.dev/auth/config/passwords#email-verification
 */

import { Email } from "@convex-dev/auth/providers/Email";

export const ResendOTP = Email({
	id: "resend-otp",
	apiKey: process.env.RESEND_API_KEY,
	// 1-hour TTL — same window Convex Auth allows by default. Long enough
	// for users who context-switch between tabs/devices, short enough that
	// stolen codes can't be replayed days later.
	maxAge: 60 * 60,
	async generateVerificationToken() {
		// 8-digit numeric OTP — easy to type on mobile, hard to brute-force
		// inside the 1-hour window. Same shape as the password-reset code so
		// the verify-email + reset-password forms can share input styling.
		const bytes = new Uint8Array(8);
		crypto.getRandomValues(bytes);
		return Array.from(bytes)
			.map((b) => (b % 10).toString())
			.join("");
	},
	async sendVerificationRequest({ identifier: email, provider, token, expires }) {
		const apiKey = (provider as { apiKey?: string }).apiKey ?? process.env.RESEND_API_KEY;
		if (!apiKey) {
			// Loud + visible — without this, signups silently never complete.
			// In dev, set RESEND_API_KEY in your Convex deployment env vars
			// (`npx convex env set RESEND_API_KEY re_xxx`).
			throw new Error(
				"RESEND_API_KEY is not set on the Convex deployment. Email verification cannot send.",
			);
		}

		// Lazy-load the Resend SDK + email helpers — keeps the V8 bundle
		// small (this callback only runs in actions).
		const { Resend: ResendAPI } = await import("resend");
		const { getEmailFrom } = await import("../lib/email");

		const resend = new ResendAPI(apiKey);
		const expiresAt = expires instanceof Date ? expires.getTime() : Date.now() + 3600_000;
		const expiresOn = new Date(expiresAt).toUTCString();

		const subject = "Verify your email";
		const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
          <tr><td style="padding:32px 40px 16px 40px;">
            <p style="margin:0 0 8px 0;font-size:14px;color:#64748b;">Verify your email</p>
            <h1 style="margin:0;font-size:22px;line-height:1.3;color:#0f172a;">Confirm it's really you</h1>
          </td></tr>
          <tr><td style="padding:0 40px 8px 40px;font-size:15px;line-height:1.6;color:#334155;">
            <p style="margin:0 0 16px 0;">Use the code below to finish creating your account.</p>
          </td></tr>
          <tr><td style="padding:0 40px 24px 40px;">
            <div style="font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:0.4em;background:#0f172a;color:#ffffff;padding:18px 22px;border-radius:8px;text-align:center;">${token}</div>
          </td></tr>
          <tr><td style="padding:0 40px 32px 40px;border-top:1px solid #e2e8f0;">
            <p style="margin:24px 0 0 0;font-size:12px;color:#64748b;line-height:1.5;">This code expires on ${expiresOn}. If you didn't try to sign up, you can safely ignore this email.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
		const text = [
			`Your verification code: ${token}`,
			"",
			"Use it to finish creating your account.",
			`The code expires on ${expiresOn}.`,
			"",
			"If you didn't try to sign up, you can safely ignore this email.",
		].join("\n");

		const { error } = await resend.emails.send({
			from: getEmailFrom(),
			to: [email],
			subject,
			html,
			text,
		});
		if (error) {
			throw new Error(`Could not send verification email: ${error.message}`);
		}
	},
});
