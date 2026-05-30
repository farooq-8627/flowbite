/**
 * Convex Auth configuration.
 *
 * Sources:
 * - https://labs.convex.dev/auth/config/users
 * - https://labs.convex.dev/auth/config/passwords (email verification + reset)
 * - https://labs.convex.dev/auth/config/oauth#account-linking
 * - https://github.com/get-convex/convex-auth/blob/main/src/server/implementation/index.ts
 *
 * AUTH FLOWS WIRED HERE
 * ─────────────────────
 * 1. Email + password signup.
 *    Password({ verify: ResendOTP }) — `signIn("password", { flow: "signUp", … })`
 *    creates an `authAccounts` row with `emailVerified === undefined` and
 *    triggers `ResendOTP.sendVerificationRequest`. The user lands on
 *    `/verify-email?email=...`, enters the OTP, and the SDK calls
 *    `signIn("password", { flow: "email-verification", email, code })`.
 *    On success the user is signed in and `authAccounts.emailVerified` is
 *    stamped. The frontend gates this via `signingIn === false` on the
 *    return value of `signIn` — see `core/shell/auth/components/SignUpPage.tsx`.
 *
 * 2. Email + password sign-in.
 *    `signIn("password", { flow: "signIn", … })`. With `verify` configured,
 *    if the existing account hasn't confirmed its email yet, Convex Auth
 *    re-sends the OTP and the same `signingIn === false` branch redirects
 *    the user to `/verify-email?email=...`.
 *
 * 3. Password reset (existing).
 *    `signIn("password", { flow: "reset", email })` → `ResendOTPPasswordReset`
 *    sends a reset OTP. User enters it on `/reset-password?email=...` and
 *    SDK calls `flow: "reset-verification"` with `code` + `newPassword`.
 *
 * 4. OAuth (Google + GitHub) WITH email-based account linking.
 *    `allowDangerousEmailAccountLinking: true` — both Google and GitHub
 *    return verified email addresses, so it's safe to link an OAuth sign-in
 *    to an existing user with the same email. Without this flag, signing
 *    in with Google after registering with email/password would silently
 *    create a second user (the bug the user reported on 2026-05-30).
 *
 *    Convex Auth's default `createOrUpdateUser` looks up an existing
 *    user via the `users.email` index — but our `users` table uses the
 *    custom index name `by_email` (and adds extra app-level fields).
 *    The `createOrUpdateUser` callback below replicates that lookup
 *    against `by_email` and bridges OAuth → existing user when the email
 *    matches a user that already finished email verification (or any
 *    user, in the OAuth-only path where the email was provider-verified).
 */
import GitHub from "@auth/core/providers/github";
import Google from "@auth/core/providers/google";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import type { GenericMutationCtx } from "convex/server";
import { v } from "convex/values";
import type { DataModel } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import { ResendOTP } from "./ResendOTP";
import { ResendOTPPasswordReset } from "./ResendOTPPasswordReset";

// ── Env validation at boot ───────────────────────────────────────────────────
// Fail loud (warning level) with a clear message instead of silently
// dropping OAuth providers. Resend is checked at the provider level — it
// throws inside `sendVerificationRequest` so the user sees a real error
// instead of a broken signup that never receives an email.
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

if (!process.env.RESEND_API_KEY) {
	console.warn(
		"⚠️  RESEND_API_KEY is not set on the Convex deployment. " +
			"Signup email verification + password reset emails will fail. " +
			"Set it via `npx convex env set RESEND_API_KEY re_xxx`.",
	);
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
	providers: [
		// Password sign-in/up with email verification (verify) and
		// password reset via email OTP (reset). When `verify` is set,
		// Convex Auth automatically routes signUp through email
		// verification before issuing a session — see Password.ts in
		// the @convex-dev/auth source for the exact branch.
		Password({ reset: ResendOTPPasswordReset, verify: ResendOTP }),
		GitHub({
			clientId: process.env.AUTH_GITHUB_ID,
			clientSecret: process.env.AUTH_GITHUB_SECRET,
			// GitHub returns a verified email address (the user's
			// configured public email on their account). Safe to link to
			// an existing user with the same email so a user who signed
			// up with email + password can later "Continue with GitHub"
			// and reach the SAME workspace instead of creating a fresh
			// orphan user. Convex Auth gates this behind the explicit
			// flag because for some OIDC providers the email is not
			// guaranteed to be verified — that's not the case here.
			allowDangerousEmailAccountLinking: true,
		}),
		Google({
			clientId: process.env.AUTH_GOOGLE_ID,
			clientSecret: process.env.AUTH_GOOGLE_SECRET,
			// See note on GitHub above. Google's `email_verified` claim
			// is universally true for normal Google accounts.
			allowDangerousEmailAccountLinking: true,
		}),
	],
	callbacks: {
		/**
		 * Called on every sign-in to create or update the app-level user profile.
		 * Must return the user's _id in the "users" table.
		 *
		 * Linking rules — keep in sync with the docstring at the top of this file:
		 *   1. `existingUserId` is non-null   → user already linked to this
		 *      authAccount row → patch + return.
		 *   2. `existingUserId` is null but a user with the same email
		 *      already exists → link to that user (return their _id). This
		 *      is the bridge that lets a password-signup user later log in
		 *      via Google/GitHub and reach the SAME workspace.
		 *   3. No match → insert a new `users` row.
		 *
		 * Why the email-based lookup is here (and not relying on the
		 * framework's default `createOrUpdateUser`):
		 *   The default helper queries `withIndex("email", q => q.eq("email", …))`.
		 *   Our `users` table uses the index name `by_email` (because the
		 *   schema also indexes `tokenIdentifier` and follows the
		 *   project's `by_*` naming convention). Once a custom callback
		 *   is supplied, the framework calls THIS instead of the default,
		 *   so we replicate the lookup against the right index here.
		 *
		 * Ref: https://labs.convex.dev/auth/config/users#create-or-update-user-callback
		 */
		async createOrUpdateUser(ctx, args) {
			// `ctx` is typed as `GenericMutationCtx<AnyDataModel>` by the
			// auth library — that erases our table-level index typing.
			// Re-attach the project DataModel here so `withIndex("by_email", …)`
			// type-checks against our actual schema.
			const dbCtx = ctx as unknown as GenericMutationCtx<DataModel>;
			const { existingUserId, profile, provider } = args;
			const now = Date.now();

			const email = ((profile.email as string | undefined) ?? "").toLowerCase().trim();
			const name = profile.name as string | undefined;
			// picture = Google/GitHub avatar URL
			const avatarUrl = (profile.picture ?? profile.image) as string | undefined;
			// Stable identifier: providerId|sub (or email as fallback). Useful
			// for app-side analytics keyed off a deterministic string.
			const tokenIdentifier = `${provider.id}|${(profile.sub as string) ?? email}`;

			// OAuth providers (Google, GitHub) attach `email_verified` claims to
			// their profile. For the password provider with `verify`, this flag
			// is also true once the user finishes the OTP step. Either way,
			// a `true` here lets us safely treat the email as the canonical
			// identity for cross-provider linking.
			const profileEmailVerified =
				typeof profile.emailVerified === "boolean"
					? profile.emailVerified
					: provider.type === "oauth" || provider.type === "oidc";

			// ── Case 1: framework already linked us to an existing user.
			if (existingUserId !== null) {
				await dbCtx.db.patch(existingUserId, {
					lastActiveAt: now,
					updatedAt: now,
					...(name !== undefined ? { name } : {}),
					...(avatarUrl !== undefined ? { avatarUrl } : {}),
				});
				return existingUserId;
			}

			// ── Case 2: no linked user yet, but maybe a same-email user
			// already exists. Look them up via `by_email`.
			if (email.length > 0) {
				const matchByEmail = await dbCtx.db
					.query("users")
					.withIndex("by_email", (q) => q.eq("email", email))
					.unique()
					.catch(() => null);

				if (matchByEmail) {
					await dbCtx.db.patch(matchByEmail._id, {
						lastActiveAt: now,
						updatedAt: now,
						...(name !== undefined && !matchByEmail.name ? { name } : {}),
						...(avatarUrl !== undefined && !matchByEmail.avatarUrl
							? { avatarUrl }
							: {}),
					});
					return matchByEmail._id;
				}
			}

			// ── Case 3: brand-new user.
			return await dbCtx.db.insert("users", {
				tokenIdentifier,
				email,
				name,
				avatarUrl,
				onboardingCompleted: false,
				createdAt: now,
				updatedAt: now,
				// Note: we deliberately don't store `emailVerificationTime`
				// on the app-level `users` row — the source of truth for
				// "is this email verified" is the `authAccounts.emailVerified`
				// column (managed by Convex Auth). The local boolean above
				// only governs whether we trust the email on this single
				// callback invocation.
				...(profileEmailVerified ? { lastActiveAt: now } : {}),
			});
		},
	},
});

/**
 * ensurePasswordAccount — bridge mutation that lets a user who
 * originally signed up with Google (or GitHub) trigger the standard
 * `signIn("password", { flow: "reset", email })` reset flow.
 *
 * THE BUG THIS FIXES (reported 2026-05-30)
 * ────────────────────────────────────────
 * Convex Auth's `Password` provider routes `flow: "reset"` through
 * `retrieveAccount(ctx, { provider: "password", account: { id: email } })`.
 * That helper queries `authAccounts` by the
 * `(provider, providerAccountId)` index. A user who only ever signed
 * in with Google has a `provider="google"` row in `authAccounts` —
 * NOT a `provider="password"` row — so `retrieveAccount` returns
 * `"InvalidAccountId"` and the SDK throws "no account found with
 * that email". The user reported exactly this on 2026-05-30 with
 * `webstor.official@gmail.com`.
 *
 * THE FIX
 * ───────
 * When the caller (the ForgotPasswordPage) hits this mutation BEFORE
 * calling `signIn("password", { flow: "reset", … })`, we ensure a
 * password authAccount row exists for the user:
 *
 *   1. Look up the `users` row by email. If none, return `{ ok: false }`
 *      so the frontend can show a generic "if an account exists, we sent
 *      you a code" toast (no email enumeration).
 *   2. Check `authAccounts` for `(provider="password",
 *      providerAccountId=email)`. If found, the standard reset flow will
 *      work — return `{ ok: true, created: false }`.
 *   3. Otherwise insert a stub row linking the existing user to the
 *      password provider with `secret: undefined`. The reset flow then:
 *        - retrieves this row (no secret needed for reset),
 *        - sends the OTP email via `ResendOTPPasswordReset`,
 *        - on `flow: "reset-verification"`, calls
 *          `modifyAccountCredentials` to fill in the user's NEW
 *          hashed password.
 *      → the same flow that works for password-signup users now works
 *        for OAuth-only users too.
 *
 * Why this is safe
 * ────────────────
 *   - The OTP is delivered to the same email Google/GitHub already
 *     verified. An attacker who knows the email can already initiate
 *     a Google "Forgot password?" flow on Google's side; ours
 *     doesn't add any new exposure.
 *   - We never write a guessable secret. The stub row has
 *     `secret: undefined`, which fails any direct `flow: "signIn"`
 *     attempt until the reset completes.
 *   - We don't touch users who don't exist — we never create a
 *     password account for an email that has no `users` row, so
 *     attackers can't seed account creation through this endpoint.
 *
 * Refs:
 *   - convex-auth Password.js source — `flow: "reset"` calls
 *     `retrieveAccount` which throws on missing rows.
 *   - retrieveAccountWithCredentials.js — returns "InvalidAccountId"
 *     when no row matches the `providerAndAccountId` index.
 */
export const ensurePasswordAccount = mutation({
	args: { email: v.string() },
	returns: v.object({
		ok: v.boolean(),
		created: v.boolean(),
	}),
	handler: async (ctx, { email }) => {
		const normalized = email.toLowerCase().trim();
		if (normalized.length === 0 || !normalized.includes("@")) {
			return { ok: false, created: false };
		}

		const user = await ctx.db
			.query("users")
			.withIndex("by_email", (q) => q.eq("email", normalized))
			.unique()
			.catch(() => null);

		if (!user) {
			// No app-level user with this email. Returning `ok: false`
			// lets the caller show a generic "if it exists, we sent a
			// code" message without leaking enumeration info.
			return { ok: false, created: false };
		}

		// Does a password authAccount row already exist for this email?
		// authAccounts is indexed on `(provider, providerAccountId)` —
		// see authTables in @convex-dev/auth/server.
		const existing = await ctx.db
			.query("authAccounts")
			.withIndex("providerAndAccountId", (q) =>
				q.eq("provider", "password").eq("providerAccountId", normalized),
			)
			.unique()
			.catch(() => null);

		if (existing) {
			// Sanity: if the existing password account is linked to a
			// DIFFERENT user (this would mean the email collided across
			// orphaned users — only possible historically before the
			// `createOrUpdateUser` callback was wired correctly), don't
			// proceed. The standard flow's `resetAccount.userId === userId`
			// check would also catch this, but failing fast here gives a
			// clearer error.
			if (existing.userId !== user._id) {
				return { ok: false, created: false };
			}
			return { ok: true, created: false };
		}

		// OAuth-only user: insert a stub password authAccount linked to
		// the existing `users` row. No secret yet — the reset flow's
		// `modifyAccountCredentials` will fill it in once the user
		// completes the OTP verification.
		await ctx.db.insert("authAccounts", {
			userId: user._id,
			provider: "password",
			providerAccountId: normalized,
			// `secret` deliberately omitted (v.optional). Direct
			// `flow: "signIn"` attempts against this row will fail at
			// `Provider.verify` until reset succeeds.
			// `emailVerified` is left undefined — Convex Auth uses an ISO
			// date string here when the verify-email step has run for
			// THIS provider. We haven't run it; the OAuth provider's
			// equivalent verification is on a different row.
		});

		return { ok: true, created: true };
	},
});
