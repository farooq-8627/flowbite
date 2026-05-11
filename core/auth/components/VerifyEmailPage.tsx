"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { Orbit } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { APP_CONFIG } from "@/config/app-config";
import { AuthShellLayout } from "@/core/auth/layouts/AuthShellLayout";
import { toast } from "@/lib/toast";

/**
 * VerifyEmailPage — OTP email verification using Convex Auth Password provider.
 *
 * Flow:
 *   1. User signs up with email/password → Convex Auth sends OTP to email.
 *   2. User is redirected here with ?email=... in the URL.
 *   3. User enters the 6-digit OTP code.
 *   4. On success → redirect to / (root redirects to dashboard or onboarding).
 *
 * Convex Auth OTP flow:
 *   signIn("password", { flow: "email-verification", email, code })
 *
 * Source: https://labs.convex.dev/auth/config/passwords#email-verification
 */
export function VerifyEmailPage() {
	const { signIn } = useAuthActions();
	const router = useRouter();
	const searchParams = useSearchParams();
	const emailFromUrl = searchParams.get("email") ?? "";

	const [code, setCode] = useState("");
	const [loading, setLoading] = useState(false);
	const [resending, setResending] = useState(false);

	const handleVerify = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!emailFromUrl || !code.trim()) return;
		setLoading(true);
		try {
			await signIn("password", {
				flow: "email-verification",
				email: emailFromUrl,
				code: code.trim(),
			});
			toast.success("Email verified! Welcome aboard.");
			router.push("/");
		} catch (err) {
			toast.authError(err as Error);
			setLoading(false);
		}
	};

	const handleResend = async () => {
		if (!emailFromUrl) return;
		setResending(true);
		try {
			await signIn("password", {
				flow: "resend-verification",
				email: emailFromUrl,
			});
			toast.success("Verification code resent. Check your inbox.");
		} catch (err) {
			toast.authError(err as Error);
		} finally {
			setResending(false);
		}
	};

	return (
		<AuthShellLayout
			panel={{
				icon: <Orbit className="size-10" />,
				title: APP_CONFIG.name,
				tagline: APP_CONFIG.description,
				bottomLeft: {
					heading: "Check your inbox",
					body: "We sent a 6-digit code to your email address.",
				},
				bottomRight: {
					heading: "Need help?",
					body: "Contact support if you didn't receive the code.",
				},
			}}
		>
			<div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[350px]">
				<div className="space-y-2 text-center">
					<h1 className="font-medium text-3xl">Verify your email</h1>
					<p className="text-muted-foreground text-sm">
						We sent a 6-digit code to{" "}
						<span className="font-medium text-foreground">
							{emailFromUrl || "your email"}
						</span>
						. Enter it below to continue.
					</p>
				</div>

				<form className="space-y-4" onSubmit={handleVerify}>
					<FieldGroup>
						<Field className="gap-1.5">
							<FieldLabel htmlFor="otp-code">Verification code</FieldLabel>
							<Input
								id="otp-code"
								name="code"
								type="text"
								inputMode="numeric"
								pattern="[0-9]*"
								maxLength={8}
								placeholder="123456"
								value={code}
								onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
								autoComplete="one-time-code"
								required
								className="text-center tracking-widest text-lg"
							/>
						</Field>
					</FieldGroup>

					<Button
						className="w-full rounded-[var(--radius)]"
						type="submit"
						disabled={loading || code.length < 6}
					>
						{loading ? "Verifying…" : "Verify email"}
					</Button>
				</form>

				<div className="text-center text-sm text-muted-foreground">
					Didn&apos;t receive the code?{" "}
					<button
						type="button"
						className="text-foreground font-medium underline underline-offset-4 disabled:opacity-50"
						onClick={handleResend}
						disabled={resending}
					>
						{resending ? "Sending…" : "Resend code"}
					</button>
				</div>
			</div>
		</AuthShellLayout>
	);
}
