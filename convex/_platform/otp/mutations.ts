/**
 * Owner-panel OTP mutations — convex/_platform/otp/mutations.ts
 *
 * Stage 1 (PLATFORM-OWNER-PANEL.md §2.5). Layer 4 of the panel's defence-
 * in-depth gate: even after the user authenticates and matches the email
 * allow-list, they must redeem a fresh email-OTP every 15 minutes before
 * the layout will render any owner-panel content.
 *
 * Mutation pattern (PLATFORM-OWNER-PANEL.md §8):
 *
 *   1. requirePlatformOwner(ctx)         — gate (no platformRole? 404)
 *   2. enforceRateLimit                  — 5 OTP requests per 15 minutes
 *   3. read-modify-write                 — insert / mark consumed
 *   4. logPlatformAction                 — audit trail
 *
 * Why we DON'T accept `userId` as an arg
 * --------------------------------------
 * `requestOtp` and `verifyOtp` are PUBLIC mutations the auth page calls.
 * Trusting the client to identify itself would defeat the whole gate —
 * an attacker could request an OTP "for" any owner email. Instead we
 * resolve the calling user via `requirePlatformOwner(ctx)` which reads
 * the auth identity from the Convex Auth session cookie. The user has
 * to be signed in AND on the email allow-list AND have `platformRole`
 * set; an unauthenticated request fails with the same 404 the layout
 * would surface.
 *
 * Storage shape
 * -------------
 * We never store the plaintext code. Each row carries a per-row salt
 * and `codeHash = sha256(salt + ":" + code)`. The hash uses the Web
 * Crypto API (`crypto.subtle`) which is available in the Convex V8
 * runtime — same primitive as `convex/http.ts::lemonSqueezyWebhook`.
 *
 * Single-use property
 * -------------------
 * `verifyOtp` patches the row to `consumed = true` BEFORE returning. A
 * replay attempt finds the row but the `consumed === false` index
 * predicate excludes it. We also race-protect against concurrent
 * verifies by failing closed if the row is already consumed in the
 * narrow window between read and patch.
 */
import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { internalMutation, type MutationCtx, mutation } from "../../_generated/server";
import { ERRORS } from "../../_shared/errors";
import { enforceRateLimit } from "../../_shared/rateLimit";
import { logPlatformAction } from "../audit/helpers";
import { requirePlatformOwner } from "../ownerAuth";

// ─── Constants ────────────────────────────────────────────────────────────────

/** OTP TTL — 15 minutes per locked decision L4. */
export const OTP_TTL_MS = 15 * 60 * 1000;

/** Maximum number of OTP requests per user per 15-minute window. */
const OTP_REQUEST_LIMIT = 5;

/** Length of the OTP code in digits. */
const OTP_CODE_LENGTH = 6;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const HEX_ALPHABET = "0123456789abcdef" as const;

function bytesToHex(buffer: Uint8Array | ArrayBuffer): string {
	const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	let out = "";
	for (let i = 0; i < view.length; i += 1) {
		const b = view[i] ?? 0;
		out += HEX_ALPHABET[(b >> 4) & 0x0f];
		out += HEX_ALPHABET[b & 0x0f];
	}
	return out;
}

/** Generate a numeric OTP. Uses `crypto.getRandomValues` for unbiased entropy. */
function generateOtpCode(length: number = OTP_CODE_LENGTH): string {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	let out = "";
	for (let i = 0; i < length; i += 1) {
		// Modulo bias is acceptable here — the universe is 0-9 and the
		// bytes are 0-255; the worst-case bias on '0' is 6/256 ≈ 2.3%
		// over a uniform 1/10 = 10%. Constant-time concerns don't apply
		// to OTP generation (only verification).
		out += ((bytes[i] ?? 0) % 10).toString();
	}
	return out;
}

/** Generate a 32-hex-char salt (16 bytes). */
function generateSalt(): string {
	const bytes = new Uint8Array(16);
	crypto.getRandomValues(bytes);
	return bytesToHex(bytes);
}

/** sha256(salt + ":" + code) → hex. Web Crypto API works in Convex V8. */
async function hashOtp(salt: string, code: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(`${salt}:${code}`);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return bytesToHex(digest);
}

/** Constant-time string comparison (prevents byte-wise timing leaks). */
function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let mismatch = 0;
	for (let i = 0; i < a.length; i += 1) {
		mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return mismatch === 0;
}

/**
 * Mark every OTHER active OTP row for `userId` as consumed. Called when
 * a fresh OTP is issued so the previous one is invalidated immediately
 * — prevents an attacker who steals the email from racing to redeem an
 * older code.
 */
async function invalidatePreviousOtps(
	ctx: MutationCtx,
	userId: Id<"users">,
	now: number,
): Promise<void> {
	const previous = await ctx.db
		.query("platformOwnerOtps")
		.withIndex("by_user_active", (q) => q.eq("userId", userId).eq("consumed", false))
		.collect();
	for (const row of previous) {
		await ctx.db.patch(row._id, { consumed: true, consumedAt: now });
	}
}

// ─── requestOtp ──────────────────────────────────────────────────────────────

/**
 * Issue a fresh OTP code for the calling owner. Sends the email via the
 * `sendOwnerOtpEmail` Node action. Returns ONLY metadata — never the
 * plaintext code.
 *
 * Rate-limited at 5 requests / 15 minutes per user (`scope: "owner.otp.request"`).
 * Soft-failure on email send: if Resend is mis-configured the row still
 * exists so the user can re-request without waiting. The rate limiter
 * keeps the total volume bounded.
 */
export const requestOtp = mutation({
	args: {
		ip: v.optional(v.string()),
		userAgent: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);

		await enforceRateLimit(ctx, {
			scope: "owner.otp.request",
			key: `${userId}`,
			max: OTP_REQUEST_LIMIT,
			periodMs: OTP_TTL_MS,
		});

		const now = Date.now();
		const expiresAt = now + OTP_TTL_MS;
		const code = generateOtpCode();
		const salt = generateSalt();
		const codeHash = await hashOtp(salt, code);

		// Single-issue invariant — invalidate any prior unconsumed rows
		// before issuing a new one. Stops a stolen mailbox from racing
		// to use an older code if a new one was just requested.
		await invalidatePreviousOtps(ctx, userId, now);

		const otpId = await ctx.db.insert("platformOwnerOtps", {
			userId,
			codeHash,
			salt,
			consumed: false,
			expiresAt,
			ip: args.ip,
			userAgent: args.userAgent,
			createdAt: now,
		});

		// Schedule the Resend send via Node action — mutations cannot
		// make outbound HTTP calls. The action receives the plaintext
		// code by reference (the doc id is enough; the action re-reads
		// the row, but plaintext is generated here so we have to pass
		// it through). Codes never enter logs.
		await ctx.scheduler.runAfter(0, internal._platform.otp.actions.sendOwnerOtpEmail, {
			otpId,
			code,
		});

		return {
			ok: true as const,
			expiresAt,
			// Pure metadata for the UI countdown — no leak risk.
			ttlMs: OTP_TTL_MS,
			email: user.email,
		};
	},
});

// ─── verifyOtp ───────────────────────────────────────────────────────────────

/**
 * Verify the user-typed code against the latest unconsumed row. Marks
 * the row consumed on success and emits an `owner.session.start` audit
 * row (S6 in PLATFORM-OWNER-PANEL.md §13).
 *
 * Returns `{ ok: true, expiresAt, userId }` on success — the Next.js
 * server action reads `expiresAt` and signs the cookie. We do NOT
 * include the row id (would let an attacker trivially correlate
 * cookies to DB rows).
 *
 * Rate-limited at 10 attempts / 15 min per user — covers brute-force
 * probing.
 */
export const verifyOtp = mutation({
	args: {
		code: v.string(),
		ip: v.optional(v.string()),
		userAgent: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);

		await enforceRateLimit(ctx, {
			scope: "owner.otp.verify",
			key: `${userId}`,
			max: 10,
			periodMs: OTP_TTL_MS,
		});

		// Sanity-strip the input — the auth page already constrains it
		// to digits but a defensive normalise here costs nothing.
		const normalised = args.code.replace(/\D+/g, "");
		if (normalised.length !== OTP_CODE_LENGTH) {
			throw new ConvexError(`${ERRORS.INVALID_ARGS} (expected ${OTP_CODE_LENGTH} digits)`);
		}

		const now = Date.now();

		// Latest unconsumed row for this user. The index on
		// `(userId, consumed)` keeps this O(1).
		const candidate = await ctx.db
			.query("platformOwnerOtps")
			.withIndex("by_user_active", (q) => q.eq("userId", userId).eq("consumed", false))
			.order("desc")
			.first();

		if (!candidate) {
			throw new ConvexError("No active code. Request a new one and try again.");
		}

		if (candidate.expiresAt <= now) {
			// Mark expired rows consumed in-place so the next request
			// doesn't keep finding them.
			await ctx.db.patch(candidate._id, { consumed: true, consumedAt: now });
			throw new ConvexError("Code expired. Request a new one and try again.");
		}

		const expectedHash = await hashOtp(candidate.salt, normalised);
		if (!constantTimeEqual(expectedHash, candidate.codeHash)) {
			throw new ConvexError("Incorrect code. Try again.");
		}

		// Mark consumed BEFORE the audit log write — the audit row
		// links to a settled state and the OTP can never be replayed.
		await ctx.db.patch(candidate._id, {
			consumed: true,
			consumedAt: now,
			ip: args.ip ?? candidate.ip,
			userAgent: args.userAgent ?? candidate.userAgent,
		});

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.session.start",
			targetType: "user",
			targetId: userId,
			before: null,
			after: {
				otpId: candidate._id,
				expiresAt: candidate.expiresAt,
				consumedAt: now,
			},
			ip: args.ip ?? candidate.ip,
			userAgent: args.userAgent ?? candidate.userAgent,
		});

		// Cookie expiresAt is the OTP-row expiresAt — the session and
		// the underlying credential expire together.
		return {
			ok: true as const,
			userId,
			expiresAt: candidate.expiresAt,
		};
	},
});

// ─── revoke ──────────────────────────────────────────────────────────────────

/**
 * Forcibly invalidate an OTP-backed session. Used by the OwnerSettings
 * "Active OTP sessions" card so a logged-in owner can sign other OTP
 * sessions out (e.g. they realise they verified on a shared machine).
 *
 * The cookie continues to validate until its HMAC TTL expires — the DB
 * row being marked revoked is the SECOND signal the layout checks. A
 * future iteration could add an explicit `revokedAt` cookie blacklist;
 * for v1 the 15-minute TTL is short enough that explicit revoke +
 * waiting ≤15 min is acceptable.
 */
export const revoke = mutation({
	args: { otpId: v.id("platformOwnerOtps") },
	handler: async (ctx, args) => {
		const { user, userId } = await requirePlatformOwner(ctx);

		const row = await ctx.db.get(args.otpId);
		if (!row) {
			throw new ConvexError(ERRORS.NOT_FOUND);
		}
		// Only the owner of the row can revoke it. We don't surface a
		// "revoke any session" capability — owners can already remove
		// each other from `PLATFORM_OWNER_EMAILS` via redeploy.
		if (row.userId !== userId) {
			throw new ConvexError(ERRORS.FORBIDDEN);
		}

		const before = { ...row };
		const now = Date.now();
		// Force-expire so the layout's TTL check rejects on the next
		// request, AND mark consumed so listActiveSessions hides it.
		await ctx.db.patch(args.otpId, {
			consumed: true,
			consumedAt: now,
			expiresAt: now,
		});

		await logPlatformAction(ctx, {
			actorUserId: userId,
			actorEmail: user.email,
			action: "owner.session.revoke",
			targetType: "platformOwnerOtps",
			targetId: args.otpId,
			before,
			after: { ...before, consumed: true, consumedAt: now, expiresAt: now },
		});

		return { ok: true as const };
	},
});

// ─── deleteExpired (cron-driven internal mutation) ───────────────────────────

/**
 * Daily GC — purge rows older than `expiresAt + 24h`. Keeps the table
 * small. The 24h grace lets us correlate audit rows to underlying
 * OTP rows in incident-response if needed.
 *
 * Internal-only — wired from `convex/crons.ts`.
 */
export const deleteExpired = internalMutation({
	args: {},
	handler: async (ctx) => {
		const cutoff = Date.now() - 24 * 60 * 60 * 1000;
		// Iterate via the by_expires index in ascending order; bail at
		// the first row past the cutoff. Bounded read budget.
		const stale = await ctx.db
			.query("platformOwnerOtps")
			.withIndex("by_expires", (q) => q.lte("expiresAt", cutoff))
			.collect();
		for (const row of stale) {
			await ctx.db.delete(row._id);
		}
		return { deleted: stale.length };
	},
});
