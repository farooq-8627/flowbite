/**
 * Convex Auth configuration.
 *
 * Sources:
 * - https://labs.convex.dev/auth/config/users
 * - https://github.com/get-convex/convex-auth/blob/main/src/server/implementation/index.ts
 * - https://github.com/get-convex/convex-saas/blob/main/convex/auth.ts
 */
import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ResendOTPPasswordReset } from "./ResendOTPPasswordReset";

// ── Env validation at boot ───────────────────────────────────────────────────
// Fail fast with a clear message instead of silently dropping OAuth providers.
const REQUIRED_ENV = {
	AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID,
	AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET,
	AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
	AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
} as const;

for (const [key, value] of Object.entries(REQUIRED_ENV)) {
	if (!value) {
		console.warn(`⚠️  Missing env var: ${key} — OAuth provider will be disabled.`);
	}
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
	providers: [
		Password({ reset: ResendOTPPasswordReset }),
		GitHub({
			clientId: process.env.AUTH_GITHUB_ID,
			clientSecret: process.env.AUTH_GITHUB_SECRET,
		}),
		Google({
			clientId: process.env.AUTH_GOOGLE_ID,
			clientSecret: process.env.AUTH_GOOGLE_SECRET,
		}),
	],
	callbacks: {
		/**
		 * Called on every sign-in to create or update the app-level user profile.
		 * Must return the user's _id in the "users" table.
		 *
		 * Ref: https://labs.convex.dev/auth/config/users#create-or-update-user-callback
		 */
		async createOrUpdateUser(ctx, args) {
			const { existingUserId, profile, provider } = args;
			const now = Date.now();

			const email = (profile.email as string) ?? "";
			const name = profile.name as string | undefined;
			// picture = Google/GitHub avatar URL
			const avatarUrl = (profile.picture ?? profile.image) as string | undefined;
			// Stable identifier: providerId|sub (or email as fallback)
			const tokenIdentifier = `${provider.id}|${(profile.sub as string) ?? email}`;

			if (existingUserId !== null) {
				await ctx.db.patch(existingUserId, {
					lastActiveAt: now,
					updatedAt: now,
					// Refresh name/avatar from provider on each sign-in
					...(name !== undefined ? { name } : {}),
					...(avatarUrl !== undefined ? { avatarUrl } : {}),
				});
				return existingUserId;
			}

			return await ctx.db.insert("users", {
				tokenIdentifier,
				email,
				name,
				avatarUrl,
				onboardingCompleted: false,
				createdAt: now,
				updatedAt: now,
			});
		},
	},
});
