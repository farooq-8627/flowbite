"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { Orbit } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { AuthShellLayout } from "@/core/auth/layouts/AuthShellLayout";
import { toast } from "@/lib/toast";
import { APP_CONFIG } from "@/config/app-config";

/**
 * ForgotPasswordPage — Sends a password reset code to the user's email.
 *
 * Convex Auth flow:
 *   signIn("password", { flow: "reset", email })
 *   → Convex sends OTP to email
 *   → Redirect to /reset-password?email=...
 *
 * Source: https://labs.convex.dev/auth/config/passwords#password-reset
 */
export function ForgotPasswordPage() {
	const { signIn } = useAuthActions();
	const router = useRouter();
	const [loading, setLoading] = useState(false);

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setLoading(true);
		const formData = new FormData(e.currentTarget);
		const email = formData.get("email") as string;
		try {
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
				bottomLeft: { heading: "Reset your password", body: "We'll send a code to your email to reset your password." },
				bottomRight: { heading: "Need help?", body: "Contact support if you can't access your account." },
			}}
		>
			<div className="absolute top-5 end-0 flex w-full justify-end px-10">
				<p className="text-muted-foreground text-sm">
					Remember your password?{" "}
					<Link prefetch={false} className="text-foreground font-medium underline underline-offset-4" href="/signin">
						Sign in
					</Link>
				</p>
			</div>

			<div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[350px]">
				<div className="space-y-2 text-center">
					<h1 className="font-medium text-3xl">Forgot password?</h1>
					<p className="text-muted-foreground text-sm">
						Enter your email and we&apos;ll send you a reset code.
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
					<Button className="w-full rounded-[var(--radius)]" type="submit" disabled={loading}>
						{loading ? "Sending…" : "Send reset code"}
					</Button>
				</form>
			</div>
		</AuthShellLayout>
	);
}
