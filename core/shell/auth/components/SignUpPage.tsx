"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { Globe, Orbit } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { APP_CONFIG } from "@/config/app-config";
import { AuthShellLayout } from "@/core/shell/auth/layouts/AuthShellLayout";
import { toast } from "@/lib/toast";

/**
 * Whitelist of post-signup redirect targets. See the parallel helper in
 * `SignInPage` for rationale — only first-party in-app paths are allowed,
 * so a hostile referer can't open-redirect through the signup flow.
 */
function safeRedirectTarget(raw: string | null): string | null {
	if (!raw) return null;
	if (!raw.startsWith("/")) return null;
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

export function SignUpPage() {
	const { signIn } = useAuthActions();
	const [loading, setLoading] = useState(false);
	const [oauthLoading, setOauthLoading] = useState<"github" | "google" | null>(null);
	const router = useRouter();
	const searchParams = useSearchParams();
	const redirectTarget = safeRedirectTarget(searchParams.get("redirect"));
	// If the user landed on signup via an invitation flow, send them
	// straight to the accept screen after creating their account. Skip
	// onboarding entirely — they're joining an existing workspace, not
	// creating a new one. Otherwise default to the onboarding wizard.
	const postSignupHref = redirectTarget ?? "/onboarding/org-name";

	const handleOAuth = (provider: "github" | "google") => {
		setOauthLoading(provider);
		// Pass `redirectTo` so the OAuth callback returns the user to
		// the original target (e.g. `/join/<token>` for invite links)
		// instead of falling back to `/onboarding`. Convex Auth stores
		// `redirectTo` in a state cookie at the start of the OAuth
		// handshake and reads it on the callback to drive the final 302.
		// Without this, a user invited to a workspace who picks "Continue
		// with Google" on signup lands on `/` → `/onboarding`, which
		// prompts them to create a SECOND workspace instead of joining
		// the one they were invited to.
		// Refs:
		//   - @convex-dev/auth signIn.ts (`if (args.params?.redirectTo)`)
		//   - @convex-dev/auth cookies.ts (`redirectToParamCookie`)
		void signIn(provider, redirectTarget ? { redirectTo: redirectTarget } : undefined).catch(
			(err: Error) => {
				posthog.capture("oauth_sign_up_failed", { provider, error_message: err.message });
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
					heading: "Start in minutes",
					body: "Set up your workspace and invite your team right away.",
				},
				bottomRight: {
					heading: "Built for every industry",
					body: "Templates for SaaS, real estate, agencies, freelancers, and more.",
				},
			}}
		>
			<div className="absolute top-5 end-0 flex w-full justify-end px-10">
				<p className="text-muted-foreground text-sm">
					Already have an account?{" "}
					<Link
						prefetch={false}
						className="text-foreground font-medium underline underline-offset-4"
						href={
							redirectTarget
								? `/signin?redirect=${encodeURIComponent(redirectTarget)}`
								: "/signin"
						}
					>
						Login
					</Link>
				</p>
			</div>

			<div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[350px]">
				<div className="space-y-2 text-center">
					<h1 className="font-medium text-3xl">Create your account</h1>
					<p className="text-muted-foreground text-sm">
						Please enter your details to register.
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
							const password = formData.get("password") as string;
							const confirm = formData.get("confirmPassword") as string;

							if (password !== confirm) {
								toast.error("Passwords do not match.");
								setLoading(false);
								return;
							}

							formData.set("flow", "signUp");
							// `signIn` returns `{ signingIn, redirect? }`.
							// With `Password({ verify: ResendOTP })` configured
							// (see `convex/auth.ts`), signUp does NOT
							// authenticate the user immediately — it sends
							// an OTP and returns `signingIn === false`.
							// Branch on that here:
							//   - signingIn === false → user must verify the
							//     email; route to `/verify-email?email=...`.
							//   - signingIn === true → email verification is
							//     disabled or not required for this account;
							//     route to onboarding (or whatever the
							//     post-signup target is, e.g. an invitation
							//     accept page).
							void signIn("password", formData)
								.then((result) => {
									posthog.identify(email, { email });
									posthog.capture("user_signed_up", {
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
									router.push(postSignupHref);
								})
								.catch((err: Error) => {
									posthog.capture("sign_up_failed", {
										error_message: err.message,
									});
									toast.authError(err);
									setLoading(false);
								});
						}}
					>
						<FieldGroup className="gap-4">
							<Field className="gap-1.5">
								<FieldLabel htmlFor="signup-email">Email Address</FieldLabel>
								<Input
									id="signup-email"
									name="email"
									type="email"
									placeholder="you@example.com"
									autoComplete="email"
									required
								/>
							</Field>
							<Field className="gap-1.5">
								<FieldLabel htmlFor="signup-password">Password</FieldLabel>
								<Input
									id="signup-password"
									name="password"
									type="password"
									placeholder="••••••••"
									autoComplete="new-password"
									minLength={8}
									required
								/>
							</Field>
							<Field className="gap-1.5">
								<FieldLabel htmlFor="signup-confirm">Confirm Password</FieldLabel>
								<Input
									id="signup-confirm"
									name="confirmPassword"
									type="password"
									placeholder="••••••••"
									autoComplete="new-password"
									minLength={8}
									required
								/>
							</Field>
						</FieldGroup>

						<Button
							className="w-full rounded-[var(--radius)]"
							type="submit"
							disabled={loading || !!oauthLoading}
						>
							{loading ? "Creating account…" : "Register"}
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
