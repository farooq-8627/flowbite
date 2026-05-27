"use server";

/**
 * Owner-panel auth — Next.js server actions.
 *
 * These actions are the bridge between the client-side OTP form and the
 * Convex mutations. The server is the only context that:
 *   - Holds the Convex Auth token (via `convexAuthNextjsToken()`).
 *   - Holds the cookie-signing secret (`OWNER_OTP_COOKIE_SECRET`).
 *   - Can `set` the httpOnly `owner_otp_verified` cookie.
 *
 * Defence-in-depth notes
 * ──────────────────────
 *   - Both actions resolve the user via the auth token; we never trust
 *     a userId argument from the client. The Convex mutation also runs
 *     `requirePlatformOwner(ctx)` so any tampering is double-checked.
 *   - The cookie is set with `httpOnly + Secure + SameSite=Lax` and
 *     `Max-Age = expiresAt - now`. Cookie + credential expire together.
 *   - On error we return a structured result; the form surfaces it via
 *     `useFormState`. We never throw out of the action — that produces
 *     opaque 500 pages which give attackers more signal than a
 *     consistent `{ ok: false, message }` envelope.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §2.5 + §10 stage 1.
 */
import { convexAuthNextjsToken } from "@convex-dev/auth/nextjs/server";
import { fetchMutation } from "convex/nextjs";
import { cookies, headers } from "next/headers";
import { api } from "@/convex/_generated/api";
import { normalizeError } from "@/lib/normalizeError";
import {
	OWNER_OTP_COOKIE_NAME,
	ownerOtpCookieOptions,
	signOwnerOtpCookie,
} from "@/lib/owner-otp-cookie";

export type RequestOtpResult =
	| { ok: true; expiresAt: number; ttlMs: number; email: string }
	| { ok: false; message: string };

export type VerifyOtpResult = { ok: true; expiresAt: number } | { ok: false; message: string };

/** Best-effort request metadata — captured so the email can show "this came from <IP>". */
async function getRequestMeta(): Promise<{ ip?: string; userAgent?: string }> {
	const headerStore = await headers();
	// Common forwarded-for chain — first hop wins. Fall back to direct
	// remote address when running behind no proxy.
	const forwarded = headerStore.get("x-forwarded-for") ?? headerStore.get("x-real-ip") ?? "";
	const ip = forwarded.split(",")[0]?.trim();
	const userAgent = headerStore.get("user-agent") ?? undefined;
	return {
		ip: ip && ip.length > 0 ? ip : undefined,
		userAgent,
	};
}

/**
 * Issue a fresh OTP. Calls the Convex mutation with the user's auth
 * token + best-effort request metadata. Errors collapse to a single
 * generic copy — we don't surface "no platform role" vs "rate limited"
 * because either signal lets an attacker probe owner status.
 */
export async function requestOwnerOtpAction(): Promise<RequestOtpResult> {
	const token = await convexAuthNextjsToken();
	if (!token) {
		return { ok: false, message: "Sign in first to request a verification code." };
	}

	const meta = await getRequestMeta();
	try {
		const result = await fetchMutation(
			api._platform.otp.mutations.requestOtp,
			{ ip: meta.ip, userAgent: meta.userAgent },
			{ token },
		);
		return {
			ok: true,
			expiresAt: result.expiresAt,
			ttlMs: result.ttlMs,
			email: result.email,
		};
	} catch (err) {
		return {
			ok: false,
			message: normalizeError(err, "Couldn't send a verification code. Try again."),
		};
	}
}

/**
 * Verify the user-typed code. On success:
 *   1. Convex marks the OTP row consumed + writes the `owner.session.start` audit row.
 *   2. We sign a cookie binding (userId, expiresAt) to the cookie secret.
 *   3. We `set` the cookie with `httpOnly + Secure + SameSite=Lax`.
 *
 * The caller (the auth page) reads `result.ok` and routes accordingly.
 * We deliberately don't redirect from inside the action — a client-
 * driven `router.push` keeps the URL change visible and avoids an
 * extra round-trip through the Next.js redirect plumbing.
 */
export async function verifyOwnerOtpAction(formData: FormData): Promise<VerifyOtpResult> {
	const token = await convexAuthNextjsToken();
	if (!token) {
		return { ok: false, message: "Sign in first." };
	}

	const code = String(formData.get("code") ?? "").replace(/\D+/g, "");
	if (code.length !== 6) {
		return { ok: false, message: "Enter the 6-digit code from your email." };
	}

	const meta = await getRequestMeta();
	let result: { ok: true; userId: string; expiresAt: number };
	try {
		result = await fetchMutation(
			api._platform.otp.mutations.verifyOtp,
			{ code, ip: meta.ip, userAgent: meta.userAgent },
			{ token },
		);
	} catch (err) {
		return {
			ok: false,
			message: normalizeError(err, "We couldn't verify that code."),
		};
	}

	const cookieValue = await signOwnerOtpCookie({
		userId: result.userId,
		expiresAt: result.expiresAt,
	});
	if (!cookieValue) {
		return {
			ok: false,
			message: "OWNER_OTP_COOKIE_SECRET is not configured. Set it (≥16 chars) and try again.",
		};
	}

	const store = await cookies();
	store.set(OWNER_OTP_COOKIE_NAME, cookieValue, ownerOtpCookieOptions(result.expiresAt));

	return { ok: true, expiresAt: result.expiresAt };
}
