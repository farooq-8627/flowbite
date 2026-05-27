/**
 * Owner-panel OTP cookie — HMAC sign + verify.
 *
 * SERVER-ONLY. The cookie value is constructed in a server action after
 * `verifyOtp` succeeds; the layout reads + verifies it on every owner-
 * panel request. The signing secret (`OWNER_OTP_COOKIE_SECRET`) is held
 * in `process.env` and never reaches the client bundle.
 *
 * Format
 * ──────
 *   v1.<userId>.<expiresAt>.<hmacHex>
 *
 *   - `v1`         — version prefix (lets us roll the format without
 *                    invalidating live sessions if we have to).
 *   - `userId`     — the Convex user id we authenticated.
 *   - `expiresAt`  — millisecond timestamp; layout rejects after this.
 *   - `hmacHex`    — HMAC-SHA-256(secret, "v1.<userId>.<expiresAt>") in hex.
 *
 * Why HMAC instead of "store the nonce in the DB"
 * ────────────────────────────────────────────────
 * Reading a row on every owner-panel page hit is fine — the panel is
 * low-traffic. We chose HMAC because:
 *   1. It removes a DB roundtrip from the layout's hot path.
 *   2. The secret is operator-controlled (env), so a DB compromise alone
 *      does not let an attacker mint cookies.
 *   3. The OTP row STILL exists (`platformOwnerOtps`) for audit /
 *      revoke-by-DB. The cookie binds to the row's `expiresAt`
 *      timestamp so the cookie and the credential expire together.
 *
 * Fail-closed: if `OWNER_OTP_COOKIE_SECRET` is unset, both `sign` and
 * `verify` throw / return null. The layout treats that as "OTP step
 * required" and redirects to the auth page — same behaviour as a
 * missing cookie.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §2.5 (steps 5–6).
 */
import "server-only";

import type { ResponseCookie } from "next/dist/compiled/@edge-runtime/cookies";
import { cookies } from "next/headers";

export const OWNER_OTP_COOKIE_NAME = "owner_otp_verified";
const COOKIE_VERSION = "v1" as const;

function getSecret(): Uint8Array | null {
	const raw = process.env.OWNER_OTP_COOKIE_SECRET ?? "";
	const trimmed = raw.trim();
	if (trimmed.length < 16) return null; // require ≥16 chars — short secrets are rejected
	// Use TextEncoder + copy into a fresh ArrayBuffer so the resulting
	// Uint8Array has a `buffer: ArrayBuffer` (not `ArrayBufferLike`),
	// which `crypto.subtle.importKey` needs in strict TS lib settings.
	const encoded = new TextEncoder().encode(trimmed);
	const buf = new ArrayBuffer(encoded.byteLength);
	const view = new Uint8Array(buf);
	view.set(encoded);
	return view;
}

function bytesToHex(buffer: ArrayBuffer): string {
	const view = new Uint8Array(buffer);
	let out = "";
	for (let i = 0; i < view.length; i += 1) {
		const b = view[i] ?? 0;
		out += b.toString(16).padStart(2, "0");
	}
	return out;
}

async function hmac(payload: string): Promise<string | null> {
	const secret = getSecret();
	if (!secret) return null;
	// Cast to BufferSource — the Uint8Array we built backs a fresh
	// ArrayBuffer (not SharedArrayBuffer) but TS's lib types narrow to
	// `ArrayBufferLike` which they reject. Same pattern as
	// `convex/http.ts::lemonSqueezyWebhook`.
	const key = await crypto.subtle.importKey(
		"raw",
		secret as BufferSource,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const payloadBytes = new TextEncoder().encode(payload);
	const sigBuffer = await crypto.subtle.sign("HMAC", key, payloadBytes as BufferSource);
	return bytesToHex(sigBuffer);
}

/** Constant-time hex string compare. */
function ctEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let mismatch = 0;
	for (let i = 0; i < a.length; i += 1) {
		mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return mismatch === 0;
}

// ─── sign ────────────────────────────────────────────────────────────────────

export type OwnerOtpCookiePayload = {
	userId: string;
	expiresAt: number;
};

/**
 * Compute the cookie value for a freshly-verified OTP. Returns `null`
 * if the signing secret is unset (caller treats this as a hard failure
 * and surfaces a setup error to the operator).
 */
export async function signOwnerOtpCookie(payload: OwnerOtpCookiePayload): Promise<string | null> {
	const inner = `${COOKIE_VERSION}.${payload.userId}.${payload.expiresAt}`;
	const sig = await hmac(inner);
	if (!sig) return null;
	return `${inner}.${sig}`;
}

// ─── verify ──────────────────────────────────────────────────────────────────

/**
 * Parse + verify the cookie value. Returns `null` if any check fails:
 *   - secret unset
 *   - malformed format
 *   - HMAC mismatch (forged or wrong-secret cookie)
 *   - expired (`expiresAt <= now`)
 *
 * Optional `expectedUserId` cross-checks the cookie's userId against the
 * authenticated user — defends against a stale cookie surviving past a
 * sign-in change.
 */
export async function verifyOwnerOtpCookie(
	value: string | null | undefined,
	expectedUserId?: string,
): Promise<OwnerOtpCookiePayload | null> {
	if (!value) return null;
	const parts = value.split(".");
	if (parts.length !== 4) return null;
	const [version, userId, expiresAtStr, sig] = parts;
	if (version !== COOKIE_VERSION) return null;
	if (!userId || !expiresAtStr || !sig) return null;

	const expiresAt = Number.parseInt(expiresAtStr, 10);
	if (!Number.isFinite(expiresAt)) return null;
	if (expiresAt <= Date.now()) return null;

	if (expectedUserId && expectedUserId !== userId) return null;

	const expectedSig = await hmac(`${version}.${userId}.${expiresAt}`);
	if (!expectedSig) return null;
	if (!ctEqual(expectedSig, sig)) return null;

	return { userId, expiresAt };
}

// ─── cookie store helpers (used by server actions + layouts) ─────────────────

/**
 * Default cookie options for the owner-OTP cookie.
 *
 * - `httpOnly: true`   — JS can't read or set the cookie.
 * - `secure: true`     — never transmitted over plain HTTP in production.
 * - `sameSite: "lax"`  — protects against most CSRF without breaking
 *                        the redirect from the auth page.
 * - `path: "/"`        — available on every owner-panel route under the slug.
 *
 * Caller passes `expiresAt` so the cookie's max-age matches the HMAC
 * payload — both expire together.
 */
export function ownerOtpCookieOptions(expiresAt: number): Partial<ResponseCookie> {
	const maxAge = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
	return {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "lax",
		path: "/",
		maxAge,
	};
}

/**
 * Read the OTP cookie from the current request. Returns the raw value or
 * `undefined`. The layout passes the result to `verifyOwnerOtpCookie`.
 */
export async function readOwnerOtpCookie(): Promise<string | undefined> {
	const store = await cookies();
	return store.get(OWNER_OTP_COOKIE_NAME)?.value;
}
