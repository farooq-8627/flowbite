"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { Orbit } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { APP_CONFIG } from "@/config/app-config";
import { api } from "@/convex/_generated/api";
import { AuthShellLayout } from "@/core/shell/auth/layouts/AuthShellLayout";
import { toast } from "@/lib/toast";

/**
 * ForgotPasswordPage — Sends a password reset code to the user's email.
 *
 * Convex Auth flow:
 *   signIn("password", { flow: "reset", email })
 *   → Convex sends OTP to email
 *   → Redirect to /reset-password?email=...
 *
 * GOOGLE / GITHUB BRIDGE (added 2026-05-30)
 * ─────────────────────────────────────────
 * Convex Auth's `flow: "reset"` looks up an `authAccounts` row keyed on
 * `(provider="password", providerAccountId=email)`. A user who only ever
 * signed in with Google has a `provider="google"` row instead, so the
 * stock reset flow throws "InvalidAccountId" → "no account found with
 * that email". We work around that by calling `ensurePasswordAccount`
 * BEFORE `signIn`. The mutation:
 *
 *   - Returns `{ ok: false }` when the email maps to no app-level user
 *     (no enumeration leak — same UX as a successful submit).
 *   - Returns `{ ok: true, created: true }` when it just inserted a
 *     stub password authAccount for an OAuth-only user, then the
 *     standard reset flow proceeds.
 *   - Returns `{ ok: true, created: false }` when the user already has
 *     a password authAccount — same as before this change.
 *
 * See `convex/auth.ts::ensurePasswordAccount` for the full rationale.
 *
 * Source: https://labs.convex.dev/auth/config/passwords#password-reset
 */
export function ForgotPasswordPage() {
	const { signIn } = useAuthActions();
	const ensurePasswordAccount = useMutation(api.auth.ensurePasswordAccount);
	const router = useRouter();
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setLoading(true);
		const formData = new FormData(e.currentTarget);
		const email = formData.get("email") as string;
		try {
			// Step 1 — make sure the user has a password authAccount row
			// (creates a stub for OAuth-only users so the SDK doesn't
			// error with InvalidAccountId).
			const ensured = await ensurePasswordAccount({ email });

			if (!ensured.ok) {
				// Either the email maps to no user, or the existing
				// password account is linked to a different user
				// (historical orphan). Show the same generic success
				// message we'd show on a real send so we don't leak
				// account existence — the user is then routed to the
				// reset-password page where their (non-existent) code
				// will simply fail to verify. This matches the OWASP
				// recommendation for forgot-password flows.
				toast.success("If an account exists, we've sent a reset code.");
				router.push(`/reset-password?email=${encodeURIComponent(email)}`);
				return;
			}

			// Step 2 — actually send the reset OTP.
			await signIn("password", { flow: "reset", email });
			toast.success("Reset code sent. Check your inbox.");
			router.push(`/reset-password?email=${encodeURIComponent(email)}`);
		} catch (err) {
			toast.authError(err as Error);
			setLoading(false);
		}
	};

	return (
		<AuthShellLayout
			panel={{
				icon: <Orbit className="size-10" />,
				title: APP_CONFIG.name,
				tagline: APP_CONFIG.description,
				bottomLeft: {
					heading: "Reset your password",
					body: "We'll send a code to your email to reset your password.",
				},
				bottomRight: {
					heading: "Need help?",
					body: "Contact support if you can't access your account.",
				},
			}}
		>
			<div className="absolute top-5 end-0 flex w-full justify-end px-10">
				<p className="text-muted-foreground text-sm">
					Remember your password?{" "}
					<Link
						prefetch={false}
						className="text-foreground font-medium underline underline-offset-4"
						href="/signin"
					>
						Sign in
					</Link>
				</p>
			</div>

			<div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[350px]">
				<div className="space-y-2 text-center">
					<h1 className="font-medium text-3xl">Forgot password?</h1>
					<p className="text-muted-foreground text-sm">
						Enter your email and we&apos;ll send you a reset code. Works for Google or
						GitHub accounts too.
					</p>
				</div>

				<form className="space-y-4" onSubmit={handleSubmit}>
					<FieldGroup>
						<Field className="gap-1.5">
							<FieldLabel htmlFor="forgot-email">Email Address</FieldLabel>
							<Input
								id="forgot-email"
								name="email"
								type="email"
								placeholder="you@example.com"
								autoComplete="email"
								required
							/>
						</Field>
					</FieldGroup>
					<Button
						className="w-full rounded-[var(--radius)]"
						type="submit"
						disabled={loading}
					>
						{loading ? "Sending…" : "Send reset code"}
					</Button>
				</form>
			</div>
		</AuthShellLayout>
	);
}
