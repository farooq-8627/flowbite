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
 * ResetPasswordPage — Enter OTP code + new password to complete reset.
 *
 * Convex Auth flow:
 *   signIn("password", { flow: "reset-verification", email, code, newPassword })
 *   → On success → redirect to /
 *
 * Source: https://labs.convex.dev/auth/config/passwords#password-reset
 */
export function ResetPasswordPage() {
	const { signIn } = useAuthActions();
	const router = useRouter();
	const searchParams = useSearchParams();
	const emailFromUrl = searchParams.get("email") ?? "";

	const [loading, setLoading] = useState(false);
	const [resending, setResending] = useState(false);

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setLoading(true);
		const formData = new FormData(e.currentTarget);
		const code = formData.get("code") as string;
		const newPassword = formData.get("newPassword") as string;
		const confirmPassword = formData.get("confirmPassword") as string;

		if (newPassword !== confirmPassword) {
			toast.error("Passwords do not match.");
			setLoading(false);
			return;
		}

		try {
			await signIn("password", {
				flow: "reset-verification",
				email: emailFromUrl,
				code: code.trim(),
				newPassword,
			});
			toast.success("Password reset successfully. You're now signed in.");
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
			await signIn("password", { flow: "reset", email: emailFromUrl });
			toast.success("New reset code sent. Check your inbox.");
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
					heading: "Set a new password",
					body: "Enter the code from your email and choose a new password.",
				},
				bottomRight: {
					heading: "Need help?",
					body: "Contact support if you didn't receive the code.",
				},
			}}
		>
			<div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[350px]">
				<div className="space-y-2 text-center">
					<h1 className="font-medium text-3xl">Reset password</h1>
					<p className="text-muted-foreground text-sm">
						Enter the code sent to{" "}
						<span className="font-medium text-foreground">
							{emailFromUrl || "your email"}
						</span>{" "}
						and choose a new password.
					</p>
				</div>

				<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
					<FieldGroup className="gap-4">
						<Field className="gap-1.5">
							<FieldLabel htmlFor="reset-code">Reset code</FieldLabel>
							<Input
								id="reset-code"
								name="code"
								type="text"
								inputMode="numeric"
								pattern="[0-9]*"
								maxLength={8}
								placeholder="123456"
								autoComplete="one-time-code"
								required
								className="text-center tracking-widest text-lg"
							/>
						</Field>
						<Field className="gap-1.5">
							<FieldLabel htmlFor="reset-new-password">New password</FieldLabel>
							<Input
								id="reset-new-password"
								name="newPassword"
								type="password"
								placeholder="••••••••"
								autoComplete="new-password"
								minLength={8}
								required
							/>
						</Field>
						<Field className="gap-1.5">
							<FieldLabel htmlFor="reset-confirm-password">
								Confirm new password
							</FieldLabel>
							<Input
								id="reset-confirm-password"
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
						disabled={loading}
					>
						{loading ? "Resetting…" : "Reset password"}
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
