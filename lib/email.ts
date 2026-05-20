/**
 * Email helper — Resend wrapper.
 *
 * Used from Convex actions ("use node" runtime). Mutations cannot make
 * outbound HTTP calls — every email send must be scheduled as an internal
 * action that imports from this module.
 *
 * Env contract (Convex dashboard env vars, NOT NEXT_PUBLIC_*):
 *   RESEND_API_KEY     — required to actually send. If unset, sendEmail()
 *                        returns { ok: false, reason: "missing_api_key" }
 *                        and the mutation that scheduled it logs a warning.
 *                        The user-visible flow still works because the
 *                        accept URL is always returned to the UI.
 *   RESEND_FROM_EMAIL  — sender address. Defaults to "no-reply@orbitly.app".
 *                        For Resend's free tier you must use a verified domain.
 *                        Set this in `npx convex env set`.
 *   APP_PUBLIC_URL     — base URL the email links use (e.g. "https://orbitly.app").
 *                        Defaults to "http://localhost:3000". Convex backend
 *                        cannot read NEXT_PUBLIC_APP_URL — it has its own
 *                        env scope.
 *
 * Set via:
 *   npx convex env set RESEND_API_KEY    "re_xxx"
 *   npx convex env set RESEND_FROM_EMAIL "Orbitly <invites@yourdomain.com>"
 *   npx convex env set APP_PUBLIC_URL    "https://orbitly.app"
 */
import { Resend } from "resend";

const DEFAULT_FROM = "Orbitly <no-reply@orbitly.app>";

export type SendEmailResult =
	| { ok: true; id: string }
	| { ok: false; reason: "missing_api_key" }
	| { ok: false; reason: "send_failed"; error: string };

/** Returns the configured public URL (used by emails to build absolute links). */
export function getAppPublicUrl(): string {
	const url = process.env.APP_PUBLIC_URL ?? "http://localhost:3000";
	return url.replace(/\/$/, "");
}

/** Returns the configured "from" address for transactional email. */
export function getEmailFrom(): string {
	return process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM;
}

/**
 * Send a transactional email via Resend.
 *
 * Soft-failure semantics: when `RESEND_API_KEY` is unset (typical in dev)
 * we return `{ ok: false, reason: "missing_api_key" }` so the calling
 * action can log a warning and the inviter still gets the accept URL via
 * the mutation's return value. We never throw — the user-visible flow
 * cannot be broken by an email config gap.
 */
export async function sendEmail(args: {
	to: string | string[];
	subject: string;
	html: string;
	from?: string;
	/** Optional plain-text fallback; auto-derived from html if omitted. */
	text?: string;
	replyTo?: string | string[];
}): Promise<SendEmailResult> {
	const apiKey = process.env.RESEND_API_KEY;
	if (!apiKey) return { ok: false, reason: "missing_api_key" };

	try {
		const resend = new Resend(apiKey);
		const result = await resend.emails.send({
			from: args.from ?? getEmailFrom(),
			to: args.to,
			subject: args.subject,
			html: args.html,
			text: args.text,
			replyTo: args.replyTo,
		});
		if (result.error) {
			return { ok: false, reason: "send_failed", error: result.error.message };
		}
		return { ok: true, id: result.data?.id ?? "" };
	} catch (err) {
		return {
			ok: false,
			reason: "send_failed",
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

// ─── Templates ──────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
	return s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/**
 * Build the HTML body for an invitation email.
 *
 * Plain HTML, no external assets, no fonts beyond system stack — works in
 * Gmail / Apple Mail / Outlook with no reflow surprises. The accept URL is
 * the canonical route the JoinOrgPage already handles
 * (`/{locale}/join/{token}`); we let middleware redirect unauthenticated
 * users through sign-in and back.
 */
export function renderInvitationEmail(args: {
	orgName: string;
	role: "admin" | "member" | "viewer";
	inviterName?: string | null;
	inviterEmail?: string | null;
	acceptUrl: string;
	expiresAt: number;
	appName?: string;
}): { subject: string; html: string; text: string } {
	const appName = args.appName ?? "Orbitly";
	const inviter =
		args.inviterName?.trim() || args.inviterEmail?.trim() || `Someone at ${args.orgName}`;
	const expiresOn = new Date(args.expiresAt).toUTCString();
	const subject = `${inviter} invited you to ${args.orgName} on ${appName}`;

	const safeOrg = escapeHtml(args.orgName);
	const safeInviter = escapeHtml(inviter);
	const safeRole = escapeHtml(args.role);
	const safeUrl = escapeHtml(args.acceptUrl);

	const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
            <tr>
              <td style="padding:32px 40px 16px 40px;">
                <p style="margin:0 0 8px 0;font-size:14px;color:#64748b;">${escapeHtml(appName)}</p>
                <h1 style="margin:0;font-size:22px;line-height:1.3;color:#0f172a;">You're invited to join ${safeOrg}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 8px 40px;font-size:15px;line-height:1.6;color:#334155;">
                <p style="margin:0 0 16px 0;">${safeInviter} invited you to join <strong>${safeOrg}</strong> as a <strong>${safeRole}</strong>.</p>
                <p style="margin:0 0 24px 0;">Click the button below to accept and join the workspace.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 24px 40px;">
                <a href="${safeUrl}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px;font-size:15px;">Accept invitation</a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 32px 40px;">
                <p style="margin:0 0 8px 0;font-size:13px;color:#64748b;">Or copy this link:</p>
                <p style="margin:0;font-size:13px;color:#0f172a;word-break:break-all;"><a href="${safeUrl}" style="color:#0f172a;">${safeUrl}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 40px 32px 40px;border-top:1px solid #e2e8f0;">
                <p style="margin:24px 0 0 0;font-size:12px;color:#64748b;line-height:1.5;">This invitation expires on ${escapeHtml(expiresOn)}. If you weren't expecting this email, you can safely ignore it.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

	const text = [
		`${inviter} invited you to join ${args.orgName} on ${appName} as a ${args.role}.`,
		"",
		"Accept the invitation:",
		args.acceptUrl,
		"",
		`This link expires on ${expiresOn}.`,
	].join("\n");

	return { subject, html, text };
}
