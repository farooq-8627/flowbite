/**
 * Owner-panel auth queries — convex/_platform/auth/queries.ts
 *
 * Server-callable gates that the Next.js owner-panel layout uses to verify
 * the caller is a platform owner BEFORE rendering any owner-panel UI.
 *
 * Convex query handlers are the canonical place to apply
 * `requirePlatformOwner` because every layer of access control is
 * already wired there (auth identity, soft-delete check, role check, env
 * email allow-list). The Next.js layout calls these via `fetchQuery` with
 * the user's token. A throw inside the handler bubbles up to the layout
 * which calls `notFound()`.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §2.3 (layered access gate).
 */
import { query } from "../../_generated/server";
import { requirePlatformOwner } from "../ownerAuth";

/**
 * `getOwnerProfile` — verify the caller is a platform owner AND return the
 * minimal profile shape the panel chrome needs (display name, email,
 * avatar). Throws `SUPER_ADMIN_REQUIRED` if the caller fails any of the
 * five layered checks.
 *
 * Used by `app/xowner/layout.tsx` as the server-side gate.
 *
 * Returns ONLY public-safe profile fields. NEVER returns a list of orgs
 * the user belongs to or any per-org content — the owner panel is
 * platform-wide only (locked decision L7).
 */
export const getOwnerProfile = query({
	args: {},
	handler: async (ctx) => {
		const { user, userId } = await requirePlatformOwner(ctx);
		return {
			userId,
			email: user.email,
			name: user.name ?? null,
			avatarUrl: user.avatarUrl ?? null,
		};
	},
});
