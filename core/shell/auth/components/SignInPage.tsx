"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { Globe, Orbit } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { APP_CONFIG } from "@/config/app-config";
import { AuthShellLayout } from "@/core/shell/auth/layouts/AuthShellLayout";
import { setClientCookie } from "@/lib/cookie.client";
import { toast } from "@/lib/toast";

/**
 * "Remember me" cookie key. The Next.js middleware reads this on every
 * request and feeds the value into `convexAuthNextjsMiddleware`'s
 * `cookieConfig.maxAge`:
 *
 *   - `"1"` (or absent) → 30-day persistent auth cookies.
 *   - `"0"`             → session cookies (cleared when the browser
 *                          closes).
 *
 * We write the cookie BEFORE calling `signIn(...)` because the auth
 * library's proxy at `/api/auth/*` is what mints the auth cookies, and
 * that proxy runs through our middleware on the very same request that
 * follows the form submit. Setting the cookie afterwards would only
 * take effect on the next sign-in.
 *
 * For OAuth, the click handler also writes the cookie before calling
 * `signIn(provider)` so the post-callback cookie write picks it up.
 *
 * The cookie itself has a 365-day lifetime — it's a UI preference, not
 * an auth credential, so it should outlive a single 30-day session and
 * remember the user's pick across re-logins.
 */
const REMEMBER_ME_COOKIE = "flowbite_remember";
const REMEMBER_ME_PREF_LIFETIME_DAYS = 365;
function persistRememberMePreference(remember: boolean): void {
	setClientCookie(REMEMBER_ME_COOKIE, remember ? "1" : "0", REMEMBER_ME_PREF_LIFETIME_DAYS);
}

/**
 * Whitelist of post-auth redirect targets the signin page is allowed to
 * route the user to. Anything else falls back to "/" so a hostile referer
 * (e.g. `?redirect=https://evil.com`) can't open-redirect through the
 * sign-in flow. We currently allow:
 *
 *   - `/join/<token>` and `/<locale>/join/<token>` — invitation accept link.
 *
 * Add new entries here ONLY for first-party in-app paths.
 */
function safeRedirectTarget(raw: string | null): string | null {
	if (!raw) return null;
	if (!raw.startsWith("/")) return null;
	// Reject protocol-relative URLs ("//evil.com") and any non-internal path.
	if (raw.startsWith("//")) return null;
	if (/^\/(?:[a-z]{2}\/)?join\/[^/?]+/.test(raw)) return raw;
	return null;
}

function GoogleIcon() {
	return (
		<svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
			<path
				d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
				fill="#4285F4"
			/>
			<path
				d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
				fill="#34A853"
			/>
			<path
				d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
				fill="#FBBC05"
			/>
			<path
				d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
				fill="#EA4335"
			/>
		</svg>
	);
}

function GitHubIcon() {
	return (
		<svg className="size-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
		</svg>
	);
}

export function SignInPage() {
	const { signIn } = useAuthActions();
	const [loading, setLoading] = useState(false);
	const [oauthLoading, setOauthLoading] = useState<"github" | "google" | null>(null);
	const [remember, setRemember] = useState(true);
	const router = useRouter();
	const searchParams = useSearchParams();
	const redirectTarget = safeRedirectTarget(searchParams.get("redirect"));
	// Where to send the user after successful auth. Defaults to "/" (which
	// then routes onward to onboarding or the user's default org).
	const postAuthHref = redirectTarget ?? "/";

	const handleOAuth = (provider: "github" | "google") => {
		// Persist the remember-me preference BEFORE redirecting to the
		// OAuth provider — the post-callback cookie write at
		// `/api/auth/callback/<provider>` is what reads it.
		persistRememberMePreference(remember);
		setOauthLoading(provider);
		// Pass `redirectTo` so the OAuth callback returns the user to
		// the original target (e.g. `/join/<token>` for invite links)
		// instead of falling back to `/`. Convex Auth stores `redirectTo`
		// in a state cookie at the start of the OAuth handshake and reads
		// it on the callback to drive the final 302. Without this, an
		// invited user clicking "Continue with Google" lands on `/`,
		// which then routes a no-org user into `/onboarding` — bypassing
		// the invite-accept screen entirely.
		// Refs:
		//   - @convex-dev/auth signIn.ts (`if (args.params?.redirectTo)`)
		//   - @convex-dev/auth cookies.ts (`redirectToParamCookie`)
		void signIn(provider, redirectTarget ? { redirectTo: redirectTarget } : undefined).catch(
			(err: Error) => {
				posthog.capture("oauth_sign_in_failed", { provider, error_message: err.message });
				toast.authError(err);
				setOauthLoading(null);
			},
		);
	};

	return (
		<AuthShellLayout
			panel={{
				icon: <Orbit className="size-10" />,
				title: APP_CONFIG.name,
				tagline: APP_CONFIG.description,
				bottomLeft: {
					heading: "Close deals faster",
					body: "Track every lead, contact, and opportunity in one place.",
				},
				bottomRight: {
					heading: "Need help?",
					body: "Our support team is available 24/7 — just reach out.",
				},
			}}
		>
			<div className="absolute top-5 end-0 flex w-full justify-end px-10">
				<p className="text-muted-foreground text-sm">
					Don&apos;t have an account?{" "}
					<Link
						prefetch={false}
						className="text-foreground font-medium underline underline-offset-4"
						href={
							redirectTarget
								? `/signup?redirect=${encodeURIComponent(redirectTarget)}`
								: "/signup"
						}
					>
						Register
					</Link>
				</p>
			</div>

			<div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[350px]">
				<div className="space-y-2 text-center">
					<h1 className="font-medium text-3xl">Login to your account</h1>
					<p className="text-muted-foreground text-sm">
						Please enter your details to login.
					</p>
				</div>

				<div className="space-y-4">
					<div className="grid grid-cols-2 gap-3">
						<Button
							variant="outline"
							className="w-full"
							disabled={!!oauthLoading}
							onClick={() => handleOAuth("google")}
						>
							<GoogleIcon />
							{oauthLoading === "google" ? "…" : "Google"}
						</Button>
						<Button
							variant="outline"
							className="w-full"
							disabled={!!oauthLoading}
							onClick={() => handleOAuth("github")}
						>
							<GitHubIcon />
							{oauthLoading === "github" ? "…" : "GitHub"}
						</Button>
					</div>

					<div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-border">
						<span className="relative z-10 bg-background px-2 text-muted-foreground">
							Or continue with
						</span>
					</div>

					<form
						className="flex flex-col gap-4"
						onSubmit={(e) => {
							e.preventDefault();
							setLoading(true);
							const formData = new FormData(e.currentTarget);
							const email = formData.get("email") as string;
							formData.set("flow", "signIn");
							// Persist the remember-me preference BEFORE
							// `signIn` so the auth proxy's cookie writes
							// inherit the right `cookieConfig.maxAge` from
							// our middleware. See the note at the top of
							// this file for why timing matters.
							persistRememberMePreference(remember);
							// `signIn` returns `{ signingIn, redirect? }`.
							// With `Password({ verify: ResendOTP })` configured
							// (see `convex/auth.ts`), signIn for an account
							// whose email hasn't been verified does NOT
							// authenticate the user — it re-sends the OTP
							// and returns `signingIn === false`. In that
							// case route to `/verify-email?email=...` so
							// the user can finish verification.
							void signIn("password", formData)
								.then((result) => {
									posthog.identify(email, { email });
									posthog.capture("user_signed_in", {
										email,
										method: "password",
										needs_verification: !result.signingIn,
									});
									if (!result.signingIn) {
										router.push(
											`/verify-email?email=${encodeURIComponent(email)}`,
										);
										return;
									}
									router.push(postAuthHref);
								})
								.catch((err: Error) => {
									posthog.capture("sign_in_failed", {
										error_message: err.message,
									});
									toast.authError(err);
									setLoading(false);
								});
						}}
					>
						<FieldGroup className="gap-4">
							<Field className="gap-1.5">
								<FieldLabel htmlFor="signin-email">Email Address</FieldLabel>
								<Input
									id="signin-email"
									name="email"
									type="email"
									placeholder="you@example.com"
									autoComplete="email"
									required
								/>
							</Field>
							<Field className="gap-1.5">
								<div className="flex items-center justify-between gap-2">
									<FieldLabel htmlFor="signin-password">Password</FieldLabel>
									<Link
										prefetch={false}
										className="text-muted-foreground text-xs underline underline-offset-4 hover:text-foreground"
										href="/forgot-password"
									>
										Forgot password?
									</Link>
								</div>
								<Input
									id="signin-password"
									name="password"
									type="password"
									placeholder="••••••••"
									autoComplete="current-password"
									required
								/>
							</Field>
							<Field orientation="horizontal">
								<Checkbox
									id="signin-remember"
									checked={remember}
									onCheckedChange={(v) => setRemember(Boolean(v))}
								/>
								<FieldContent>
									<FieldLabel htmlFor="signin-remember" className="font-normal">
										Remember me for 30 days
									</FieldLabel>
								</FieldContent>
							</Field>
						</FieldGroup>

						<Button
							className="w-full rounded-[var(--radius)]"
							type="submit"
							disabled={loading || !!oauthLoading}
						>
							{loading ? "Signing in…" : "Login"}
						</Button>
					</form>
				</div>
			</div>

			<div className="absolute bottom-5 flex w-full justify-between px-10">
				<div className="text-muted-foreground text-sm">
					© {new Date().getFullYear()} {APP_CONFIG.name}
				</div>
				<div className="flex items-center gap-1 text-muted-foreground text-sm">
					<Globe className="size-4" />
					ENG
				</div>
			</div>
		</AuthShellLayout>
	);
}
