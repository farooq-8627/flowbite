/**
 * Owner-panel OTP queries — convex/_platform/otp/queries.ts
 *
 * Read-only access to the OTP table for:
 *   - The Stage 7 OwnerSettingsView "Active OTP sessions" card
 *     (`listActiveSessions`).
 *   - The Stage 7 "Recent logins" card (`getRecentLogins`) — derived
 *     from `platformAuditLogs` rows with action prefix `owner.session.*`.
 *   - The internal Node action that sends the email (`getOwnerOtpRow`).
 *
 * Every public query starts with `requirePlatformOwner(ctx)` — defence
 * in depth. The internal query is reachable only from other Convex
 * functions and skips the gate (it runs after `requestOtp` already
 * authenticated the caller).
 *
 * Spec: PLATFORM-OWNER-PANEL.md §10 stage 7 + §3.3.
 */
import { ConvexError, v } from "convex/values";
import { internalQuery, query } from "../../_generated/server";
import { ERRORS } from "../../_shared/errors";
import { requirePlatformOwner } from "../ownerAuth";

/**
 * Currently-redeemable OTP sessions for the calling owner. A row is
 * "active" when `consumed === true` (i.e. successfully verified) AND
 * `expiresAt > now` (the cookie HMAC issued from this row is still
 * within its 15-minute window).
 *
 * Returns shape suitable for the OwnerSettings card: redacts hash + salt.
 */
export const listActiveSessions = query({
	args: {},
	handler: async (ctx) => {
		const { userId } = await requirePlatformOwner(ctx);

		const now = Date.now();
		// All rows for the user (consumed AND unconsumed). The "active"
		// filter is post-fetch because Convex doesn't support compound
		// `eq + range` predicates without a dedicated index — and the
		// per-user volume is bounded (at most ~5 rows in the active
		// window thanks to the request rate limit + GC cron).
		const rows = await ctx.db
			.query("platformOwnerOtps")
			.withIndex("by_user_active", (q) => q.eq("userId", userId).eq("consumed", true))
			.order("desc")
			.take(20);

		return rows
			.filter((r) => r.expiresAt > now)
			.map((r) => ({
				_id: r._id,
				createdAt: r.createdAt,
				consumedAt: r.consumedAt ?? r.createdAt,
				expiresAt: r.expiresAt,
				ip: r.ip ?? null,
				userAgent: r.userAgent ?? null,
			}));
	},
});

/**
 * Recent owner-session events (success + revoke). Pulled from
 * `platformAuditLogs` so the trail survives even after the underlying
 * OTP row is GC'd. Capped at 25 most-recent rows.
 */
export const getRecentLogins = query({
	args: {
		limit: v.optional(v.number()),
		userId: v.optional(v.id("users")),
	},
	handler: async (ctx, args) => {
		const { userId: callerId } = await requirePlatformOwner(ctx);
		const target = args.userId ?? callerId;
		const cap = Math.min(Math.max(args.limit ?? 10, 1), 25);

		// We want both `owner.session.start` and `owner.session.revoke`;
		// query the by_actor index and filter by action prefix in JS.
		// Volume is bounded — a single owner produces ≤96 sessions per
		// 24h (15-minute TTL), so reading 25 newest is cheap.
		const rows = await ctx.db
			.query("platformAuditLogs")
			.withIndex("by_actor", (q) => q.eq("actorUserId", target))
			.order("desc")
			.take(cap * 4);

		return rows
			.filter(
				(r) => r.action === "owner.session.start" || r.action === "owner.session.revoke",
			)
			.slice(0, cap)
			.map((r) => ({
				_id: r._id,
				action: r.action,
				createdAt: r.createdAt,
				ip: r.ip ?? null,
				userAgent: r.userAgent ?? null,
				actorEmail: r.actorEmail,
			}));
	},
});

/**
 * Internal-only — used by `actions.ts::sendOwnerOtpEmail` to fetch the
 * row metadata it needs to build the email. NEVER returns the codeHash
 * or salt (the action gets the plaintext code as a separate arg).
 */
export const getOwnerOtpRow = internalQuery({
	args: { otpId: v.id("platformOwnerOtps") },
	handler: async (ctx, args) => {
		const row = await ctx.db.get(args.otpId);
		if (!row) return null;
		const user = await ctx.db.get(row.userId);
		if (!user?.email) {
			throw new ConvexError(ERRORS.USER_NOT_FOUND);
		}
		return {
			email: user.email,
			expiresAt: row.expiresAt,
			ip: row.ip ?? null,
			userAgent: row.userAgent ?? null,
		};
	},
});
