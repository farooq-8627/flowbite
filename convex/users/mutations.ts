/**
 * User profile mutations.
 *
 * PATTERN:
 *   - All public mutations use `authenticatedMutation` (Rule R2).
 *   - `logActivity()` is called for org-scoped operations where an orgId is available.
 *   - User self-service operations (profile, onboarding) that are NOT org-scoped
 *     do not generate activity logs (no orgId context).
 *
 * Sources:
 * - https://github.com/get-convex/convex-saas/blob/main/convex/users.ts
 * - https://labs.convex.dev/auth/config/users
 */
import { ConvexError, v } from "convex/values";
import { authenticatedMutation } from "../_functions/authenticated";
import { internalMutation } from "../_generated/server";
import { ENTITY_TYPES } from "../_shared/constants";
import { ERRORS } from "../_shared/errors";
import { notificationPreferencesValidator } from "../_shared/notificationKeys";
import { logActivity } from "../activityLogs/helpers";

/**
 * Update the current user's display profile (name, locale, timezone).
 */
export const updateProfile = authenticatedMutation({
	args: {
		name: v.optional(v.string()),
		locale: v.optional(v.string()),
		timezone: v.optional(v.string()),
		dismissedCards: v.optional(v.array(v.string())),
	},
	handler: async (ctx, args) => {
		await ctx.db.patch(ctx.userId, {
			...args,
			updatedAt: Date.now(),
		});
	},
});

/**
 * Mark the current user's onboarding flow as completed.
 */
export const completeOnboarding = authenticatedMutation({
	args: {},
	handler: async (ctx) => {
		await ctx.db.patch(ctx.userId, {
			onboardingCompleted: true,
			updatedAt: Date.now(),
		});
	},
});

/**
 * Set the user's default org (the org loaded on dashboard entry).
 * Verifies active membership before setting.
 */
export const setDefaultOrg = authenticatedMutation({
	args: { orgId: v.id("orgs") },
	handler: async (ctx, args) => {
		const member = await ctx.db
			.query("orgMembers")
			.withIndex("by_orgId_and_userId", (q) =>
				q.eq("orgId", args.orgId).eq("userId", ctx.userId),
			)
			.first();

		if (!member || member.deletedAt !== undefined) {
			throw new ConvexError(ERRORS.ORG_MEMBER_NOT_FOUND);
		}

		await ctx.db.patch(ctx.userId, {
			defaultOrgId: args.orgId,
			updatedAt: Date.now(),
		});

		await logActivity(ctx, {
			orgId: args.orgId,
			userId: ctx.userId,
			action: "updated",
			entityType: ENTITY_TYPES.USER,
			entityId: ctx.userId,
			description: "Set as default organization",
		});
	},
});

/**
 * Soft-delete the current user's account.
 * Logs activity to the user's default org if one exists.
 */
export const deleteAccount = authenticatedMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();

		await ctx.db.patch(ctx.userId, {
			deletedAt: now,
			updatedAt: now,
		});

		if (ctx.user.defaultOrgId) {
			await logActivity(ctx, {
				orgId: ctx.user.defaultOrgId,
				userId: ctx.userId,
				action: "deleted",
				entityType: ENTITY_TYPES.USER,
				entityId: ctx.userId,
				description: "Deleted user account",
			});
		}
	},
});

/**
 * Update notification preferences for the current user.
 * Any authenticated user can update their own preferences (no role check needed).
 * Merges with existing preferences — only provided keys are updated.
 *
 * The argument validator is derived from the SSOT
 * `_shared/notificationKeys.ts::notificationPreferencesValidator` — adding a
 * new preference key in the catalog automatically expands this mutation's
 * accepted args (and the schema validator) without any edits here.
 */
export const updateNotificationPreferences = authenticatedMutation({
	args: {
		preferences: notificationPreferencesValidator,
	},
	handler: async (ctx, args) => {
		const existing = ctx.user.notificationPreferences ?? {};
		await ctx.db.patch(ctx.userId, {
			notificationPreferences: { ...existing, ...args.preferences },
			updatedAt: Date.now(),
		});
	},
});

/**
 * Update app-level preferences for the current user (per-user overrides).
 *
 * Currently stores `entityDefaultView` — a per-slot map of "list" | "board"
 * that overrides the workspace default view in the entity-page view-toggle
 * precedence chain. See ENTITY_SCAFFOLDS_PLAN.md §4.
 *
 * Empty map = clear all per-user overrides (inherit workspace defaults).
 */
export const updatePreferences = authenticatedMutation({
	args: {
		entityDefaultView: v.optional(
			v.record(v.string(), v.union(v.literal("list"), v.literal("board"))),
		),
		savedViews: v.optional(
			v.record(
				v.string(),
				v.array(
					v.object({
						id: v.string(),
						name: v.string(),
						columns: v.array(v.string()),
						filters: v.optional(v.record(v.string(), v.any())),
					}),
				),
			),
		),
		// Phase 3B — AI preferences
		aiDefaultModel: v.optional(v.string()),
		aiDefaultProvider: v.optional(v.string()),
		aiAutoContextLoad: v.optional(v.boolean()),
		aiBriefingEnabled: v.optional(v.boolean()),
		aiPanelOpenByDefault: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const existing = ctx.user.preferences ?? {};

		// Patch only the keys present in `args`. Each AI field is independently
		// optional so a single setter (e.g. setting just `aiDefaultModel`) does
		// not clobber unrelated fields. The previous handler silently dropped
		// every AI field — that was the root cause of the model picker not
		// persisting changes.
		const next: typeof existing = { ...existing };
		if (args.entityDefaultView !== undefined) next.entityDefaultView = args.entityDefaultView;
		if (args.savedViews !== undefined) next.savedViews = args.savedViews;
		if (args.aiDefaultModel !== undefined) next.aiDefaultModel = args.aiDefaultModel;
		if (args.aiDefaultProvider !== undefined) next.aiDefaultProvider = args.aiDefaultProvider;
		if (args.aiAutoContextLoad !== undefined) next.aiAutoContextLoad = args.aiAutoContextLoad;
		if (args.aiBriefingEnabled !== undefined) next.aiBriefingEnabled = args.aiBriefingEnabled;
		if (args.aiPanelOpenByDefault !== undefined)
			next.aiPanelOpenByDefault = args.aiPanelOpenByDefault;

		await ctx.db.patch(ctx.userId, {
			preferences: next,
			updatedAt: Date.now(),
		});
	},
});

/**
 * Stage 5 — Dismiss an AI Pulse Ribbon suggestion for the current user.
 *
 * The dismiss state lives in `users.preferences.aiPulseDismissed` as a
 * record `{ [suggestionId]: dismissedAt }`. We cap the map at 50 entries
 * (drops the oldest by dismissedAt) so the row never balloons — pulse
 * suggestion ids are heuristic and rotate as the underlying records
 * change, so dropping old dismissals is safe (worst case the user sees
 * a stale dismissal re-surface, which they can dismiss again).
 *
 * Idempotent — dismissing the same id twice updates the timestamp but
 * doesn't add a row.
 */
const AI_PULSE_DISMISSED_CAP = 50;

export const dismissAiPulseSuggestion = authenticatedMutation({
	args: {
		suggestionId: v.string(),
	},
	handler: async (ctx, args) => {
		const id = args.suggestionId.trim();
		if (id.length === 0 || id.length > 200) {
			throw new ConvexError("Invalid suggestion id.");
		}
		const existingPrefs = ctx.user.preferences ?? {};
		const existingMap = existingPrefs.aiPulseDismissed ?? {};

		const next: Record<string, number> = { ...existingMap, [id]: Date.now() };

		// Cap at 50 — drop the oldest by dismissedAt timestamp.
		const entries = Object.entries(next);
		if (entries.length > AI_PULSE_DISMISSED_CAP) {
			entries.sort((a, b) => b[1] - a[1]); // newest first
			const trimmed = entries.slice(0, AI_PULSE_DISMISSED_CAP);
			await ctx.db.patch(ctx.userId, {
				preferences: { ...existingPrefs, aiPulseDismissed: Object.fromEntries(trimmed) },
				updatedAt: Date.now(),
			});
			return;
		}

		await ctx.db.patch(ctx.userId, {
			preferences: { ...existingPrefs, aiPulseDismissed: next },
			updatedAt: Date.now(),
		});
	},
});

// ─── Internal mutations ───────────────────────────────────────────────────────

/**
 * Stage 8 — Autonomous layer (`/SPRINT-PLAN.md`). Per-user opt-ins for
 * autonomous AI behaviour. Every key defaults FALSE; this mutation
 * patches only the keys the caller actually supplied so partial
 * updates work cleanly.
 *
 * Permission gate: `ai.use` (every member of the workspace can manage
 * their OWN autonomy preferences — they're personal toggles, not
 * workspace-wide settings; the workspace-wide gate is
 * `ai.automation.manage` on the `aiStandingOrders` editor).
 */
const AUTONOMY_KEYS = [
	"autoTaskOnStageMove",
	"autoEnrichOnContactCreate",
	"autoTagOnNote",
	"weeklyDigestEmail",
] as const;

async function updateAiAutonomyImpl(
	ctx: import("../_generated/server").MutationCtx,
	args: {
		userId: import("../_generated/dataModel").Id<"users">;
		autoTaskOnStageMove?: boolean;
		autoEnrichOnContactCreate?: boolean;
		autoTagOnNote?: boolean;
		weeklyDigestEmail?: boolean;
	},
) {
	const user = await ctx.db.get(args.userId);
	if (!user || user.deletedAt !== undefined) {
		throw new ConvexError("User not found.");
	}
	const existingPrefs = user.preferences ?? {};
	const existingAutonomy = existingPrefs.aiAutonomy ?? {};
	const patched: Record<string, boolean> = { ...existingAutonomy };
	const flags: Record<string, boolean | undefined> = {
		autoTaskOnStageMove: args.autoTaskOnStageMove,
		autoEnrichOnContactCreate: args.autoEnrichOnContactCreate,
		autoTagOnNote: args.autoTagOnNote,
		weeklyDigestEmail: args.weeklyDigestEmail,
	};
	for (const key of AUTONOMY_KEYS) {
		const value = flags[key];
		if (value !== undefined) patched[key] = value;
	}
	await ctx.db.patch(args.userId, {
		preferences: { ...existingPrefs, aiAutonomy: patched },
		updatedAt: Date.now(),
	});
	return { aiAutonomy: patched };
}

export const updateAiAutonomy = authenticatedMutation({
	args: {
		autoTaskOnStageMove: v.optional(v.boolean()),
		autoEnrichOnContactCreate: v.optional(v.boolean()),
		autoTagOnNote: v.optional(v.boolean()),
		weeklyDigestEmail: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		return updateAiAutonomyImpl(ctx, { ...args, userId: ctx.userId });
	},
});

/**
 * AI-callable internal twin (per AGENTS.md non-negotiable rule). Trusts
 * the supplied userId after the caller has been authenticated by the
 * orchestrator's `requireOrgMemberByIds`.
 */
export const updateAiAutonomyForAI = internalMutation({
	args: {
		userId: v.id("users"),
		autoTaskOnStageMove: v.optional(v.boolean()),
		autoEnrichOnContactCreate: v.optional(v.boolean()),
		autoTagOnNote: v.optional(v.boolean()),
		weeklyDigestEmail: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		return updateAiAutonomyImpl(ctx, args);
	},
});

/**
 * Post-sprint addition (2026-05-26). Per-user "auto-approve" map for AI
 * tool calls. Each key corresponds to one `approvalCategory` declared by
 * tools in `convex/ai/toolRegistry.ts`. See `convex/_shared/aiApprovals.ts`
 * for the canonical category list, defaults, and hard-locked set.
 *
 * Permission gate: `ai.use` (every member can manage their OWN approval
 * preferences — they're personal, not workspace-wide).
 */
async function updateAiApprovalsImpl(
	ctx: import("../_generated/server").MutationCtx,
	args: {
		userId: import("../_generated/dataModel").Id<"users">;
		create_record?: boolean;
		update_record?: boolean;
		delete_record?: boolean;
		convert_record?: boolean;
		send_message?: boolean;
		manage_participants?: boolean;
		schedule?: boolean;
		files?: boolean;
	},
) {
	const user = await ctx.db.get(args.userId);
	if (!user || user.deletedAt !== undefined) {
		throw new ConvexError("User not found.");
	}
	const existingPrefs = user.preferences ?? {};
	const existingApprovals = existingPrefs.aiApprovals ?? {};
	const patched: Record<string, boolean> = { ...existingApprovals };
	const flags: Record<string, boolean | undefined> = {
		create_record: args.create_record,
		update_record: args.update_record,
		delete_record: args.delete_record,
		convert_record: args.convert_record,
		send_message: args.send_message,
		manage_participants: args.manage_participants,
		schedule: args.schedule,
		files: args.files,
	};
	for (const key of Object.keys(flags)) {
		const value = flags[key];
		if (value !== undefined) patched[key] = value;
	}
	await ctx.db.patch(args.userId, {
		preferences: { ...existingPrefs, aiApprovals: patched },
		updatedAt: Date.now(),
	});
	return { aiApprovals: patched };
}

export const updateAiApprovals = authenticatedMutation({
	args: {
		create_record: v.optional(v.boolean()),
		update_record: v.optional(v.boolean()),
		delete_record: v.optional(v.boolean()),
		convert_record: v.optional(v.boolean()),
		send_message: v.optional(v.boolean()),
		manage_participants: v.optional(v.boolean()),
		schedule: v.optional(v.boolean()),
		files: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		return updateAiApprovalsImpl(ctx, { ...args, userId: ctx.userId });
	},
});

/** AI-callable internal twin (per AGENTS.md non-negotiable rule). */
export const updateAiApprovalsForAI = internalMutation({
	args: {
		userId: v.id("users"),
		create_record: v.optional(v.boolean()),
		update_record: v.optional(v.boolean()),
		delete_record: v.optional(v.boolean()),
		convert_record: v.optional(v.boolean()),
		send_message: v.optional(v.boolean()),
		manage_participants: v.optional(v.boolean()),
		schedule: v.optional(v.boolean()),
		files: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		return updateAiApprovalsImpl(ctx, args);
	},
});

/**
 * Reset the user's auto-approve preferences to the defaults (i.e. clear
 * the explicit overrides — does NOT write the defaults into the row).
 * Surfaced via the "Reset to defaults" button in the settings UI.
 */
export const resetAiApprovals = authenticatedMutation({
	args: {},
	handler: async (ctx) => {
		const user = await ctx.db.get(ctx.userId);
		if (!user || user.deletedAt !== undefined) {
			throw new ConvexError("User not found.");
		}
		const existingPrefs = user.preferences ?? {};
		const { aiApprovals: _drop, ...rest } = existingPrefs;
		await ctx.db.patch(ctx.userId, {
			preferences: rest,
			updatedAt: Date.now(),
		});
		return { aiApprovals: {} };
	},
});

/**
 * Stage 3-A.5 — set the per-user collapse state for a named dashboard
 * section. Currently only `proactive` is recognised (the AI cluster on
 * the dashboard). Adding a new section key requires extending the
 * schema's `dashboardSectionsCollapsed` object literal AND the
 * SECTION_KEYS array below — both in the same change.
 *
 * Pattern follows `updateAiAutonomy` exactly: extracted `*Impl` helper
 * so the public + ForAI bodies cannot diverge.
 */
const DASHBOARD_SECTION_KEYS = ["proactive"] as const;
type DashboardSectionKey = (typeof DASHBOARD_SECTION_KEYS)[number];

async function setDashboardSectionCollapsedImpl(
	ctx: import("../_generated/server").MutationCtx,
	args: {
		userId: import("../_generated/dataModel").Id<"users">;
		section: DashboardSectionKey;
		collapsed: boolean;
	},
) {
	const user = await ctx.db.get(args.userId);
	if (!user || user.deletedAt !== undefined) {
		throw new ConvexError("User not found.");
	}
	const existingPrefs = user.preferences ?? {};
	const existingMap = existingPrefs.dashboardSectionsCollapsed ?? {};
	const next: Record<string, boolean> = { ...existingMap };
	next[args.section] = args.collapsed;
	await ctx.db.patch(args.userId, {
		preferences: { ...existingPrefs, dashboardSectionsCollapsed: next },
		updatedAt: Date.now(),
	});
	return { dashboardSectionsCollapsed: next };
}

export const setDashboardSectionCollapsed = authenticatedMutation({
	args: {
		section: v.union(...DASHBOARD_SECTION_KEYS.map((k) => v.literal(k))),
		collapsed: v.boolean(),
	},
	handler: async (ctx, args) => {
		return setDashboardSectionCollapsedImpl(ctx, {
			userId: ctx.userId,
			section: args.section,
			collapsed: args.collapsed,
		});
	},
});

/**
 * AI-callable internal twin. Trusts the supplied `userId` after the
 * orchestrator has authenticated via `requireOrgMemberByIds`.
 */
export const setDashboardSectionCollapsedForAI = internalMutation({
	args: {
		userId: v.id("users"),
		section: v.union(...DASHBOARD_SECTION_KEYS.map((k) => v.literal(k))),
		collapsed: v.boolean(),
	},
	handler: async (ctx, args) => {
		return setDashboardSectionCollapsedImpl(ctx, args);
	},
});

// ─── Internal mutations ───────────────────────────────────────────────────────

/**
 * One-time dev migration: delete user documents that don't match the current schema.
 *
 * HOW IT WORKS:
 *   Scans up to 1000 users (Rule R5: bounded `.take()`) and deletes any that
 *   are missing required fields. These "malformed" docs were created before
 *   the `createOrUpdateUser` callback was added to `convex/auth.ts` (i.e. when
 *   @convex-dev/auth created a minimal user stub with only `email`).
 *
 * WHY `internalMutation` (Rule R6):
 *   Migration mutations must never be callable by clients. Using `internalMutation`
 *   ensures this can only be triggered by a Convex dashboard action or cron.
 *
 * WHEN TO RUN: Once after adding the `createOrUpdateUser` callback to auth.ts.
 */
export const deleteMalformedUsers = internalMutation({
	args: {},
	handler: async (ctx) => {
		const allUsers = await ctx.db.query("users").take(1000);
		let deleted = 0;

		for (const user of allUsers) {
			if (
				!user.tokenIdentifier ||
				!user.email ||
				user.onboardingCompleted === undefined ||
				!user.createdAt ||
				!user.updatedAt
			) {
				await ctx.db.delete(user._id);
				deleted++;
			}
		}

		return { deleted };
	},
});

/**
 * Upsert a user record from the auth callback. Internal use by the auth system.
 *
 * HOW IT WORKS:
 *   Called by `createOrUpdateUser` in `convex/auth.ts` when a user signs in via
 *   OAuth or Password. It either:
 *     - Updates the existing user's `name`, `avatarUrl`, `lastActiveAt`, `updatedAt`
 *       (without touching app-level fields like `defaultOrgId`, `locale`).
 *     - Or creates a new user document with the data provided by the OAuth provider.
 *
 *   Uses the `by_tokenIdentifier` index for an O(log n) lookup (Rule R4).
 *
 * WHY `internalMutation` (Rule R6):
 *   This mutation bypasses the normal auth guard (it's called during the auth flow
 *   itself, before a session exists). Making it internal ensures it can only be
 *   invoked by `convex/auth.ts`, not by a client.
 *
 * NOTE: In our setup, `createOrUpdateUser` in auth.ts directly calls `ctx.db`
 *   operations, so this function is available as a helper if needed by other
 *   internal flows (e.g. admin user provisioning).
 */
export const upsertFromAuth = internalMutation({
	args: {
		tokenIdentifier: v.string(),
		email: v.string(),
		name: v.optional(v.string()),
		avatarUrl: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const now = Date.now();
		const existing = await ctx.db
			.query("users")
			.withIndex("by_tokenIdentifier", (q) => q.eq("tokenIdentifier", args.tokenIdentifier))
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, {
				lastActiveAt: now,
				updatedAt: now,
				...(args.name !== undefined ? { name: args.name } : {}),
				...(args.avatarUrl !== undefined ? { avatarUrl: args.avatarUrl } : {}),
			});
			return existing._id;
		}

		return await ctx.db.insert("users", {
			tokenIdentifier: args.tokenIdentifier,
			email: args.email,
			name: args.name,
			avatarUrl: args.avatarUrl,
			onboardingCompleted: false,
			createdAt: now,
			updatedAt: now,
		});
	},
});
