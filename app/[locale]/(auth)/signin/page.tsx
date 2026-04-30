"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useState } from "react";

function GitHubIcon() {
	return (
		<svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
		</svg>
	);
}

function GoogleIcon() {
	return (
		<svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
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

export default function SignIn() {
	const { signIn } = useAuthActions();
	const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const [oauthLoading, setOauthLoading] = useState<"github" | "google" | null>(null);
	const router = useRouter();

	const handleOAuth = (provider: "github" | "google") => {
		setOauthLoading(provider);
		setError(null);
		void signIn(provider).catch((err: Error) => {
			posthog.capture("oauth_sign_in_failed", { provider, error_message: err.message });
			setError(err.message);
			setOauthLoading(null);
		});
	};

	return (
		<div className="flex flex-col gap-8 w-full max-w-md mx-auto h-screen justify-center items-center px-4">
			<div className="text-center flex flex-col items-center gap-2">
				<h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200">
					{flow === "signIn" ? "Welcome back" : "Create account"}
				</h1>
				<p className="text-slate-500 dark:text-slate-400 text-sm">
					{flow === "signIn"
						? "Sign in to your account to continue"
						: "Sign up to get started"}
				</p>
			</div>

			<div className="flex flex-col gap-4 w-full bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700">
				{/* OAuth Buttons */}
				<div className="flex flex-col gap-3">
					<button
						type="button"
						onClick={() => handleOAuth("github")}
						disabled={!!oauthLoading}
						className="flex items-center justify-center gap-3 w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-medium rounded-lg transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					>
						<GitHubIcon />
						{oauthLoading === "github"
							? "Connecting..."
							: `${flow === "signIn" ? "Sign in" : "Sign up"} with GitHub`}
					</button>

					<button
						type="button"
						onClick={() => handleOAuth("google")}
						disabled={!!oauthLoading}
						className="flex items-center justify-center gap-3 w-full py-2.5 px-4 bg-white hover:bg-slate-50 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium rounded-lg border border-slate-300 dark:border-slate-600 transition-all duration-200 shadow-sm hover:shadow-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					>
						<GoogleIcon />
						{oauthLoading === "google"
							? "Connecting..."
							: `${flow === "signIn" ? "Sign in" : "Sign up"} with Google`}
					</button>
				</div>

				<div className="flex items-center gap-3">
					<div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
					<span className="text-xs text-slate-400 dark:text-slate-500 font-medium uppercase tracking-wide">
						or continue with email
					</span>
					<div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
				</div>

				{/* Email/Password Form */}
				<form
					className="flex flex-col gap-3"
					onSubmit={(e) => {
						e.preventDefault();
						setLoading(true);
						setError(null);
						const formData = new FormData(e.target as HTMLFormElement);
						const email = formData.get("email") as string;
						formData.set("flow", flow);
						void signIn("password", formData)
							.then(() => {
								posthog.identify(email, { email });
								posthog.capture(
									flow === "signIn" ? "user_signed_in" : "user_signed_up",
									{
										email,
										method: "password",
									},
								);
								router.push("/");
							})
							.catch((err: Error) => {
								posthog.capture("sign_in_failed", {
									flow,
									error_message: err.message,
								});
								setError(err.message);
								setLoading(false);
							});
					}}
				>
					<input
						className="bg-slate-50 dark:bg-slate-800 text-foreground rounded-lg p-3 border border-slate-200 dark:border-slate-600 focus:border-slate-400 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-100 dark:focus:ring-slate-700 outline-none transition-all placeholder:text-slate-400 text-sm"
						type="email"
						name="email"
						placeholder="Email address"
						required
					/>
					<div className="flex flex-col gap-1">
						<input
							className="bg-slate-50 dark:bg-slate-800 text-foreground rounded-lg p-3 border border-slate-200 dark:border-slate-600 focus:border-slate-400 dark:focus:border-slate-400 focus:ring-2 focus:ring-slate-100 dark:focus:ring-slate-700 outline-none transition-all placeholder:text-slate-400 text-sm"
							type="password"
							name="password"
							placeholder="Password"
							minLength={8}
							required
						/>
						{flow === "signUp" && (
							<p className="text-xs text-slate-400 dark:text-slate-500 px-1">
								Minimum 8 characters
							</p>
						)}
					</div>

					<button
						className="bg-slate-700 hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 text-white font-semibold rounded-lg py-2.5 shadow-sm hover:shadow-md transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 text-sm"
						type="submit"
						disabled={loading || !!oauthLoading}
					>
						{loading ? "Loading..." : flow === "signIn" ? "Sign in" : "Create account"}
					</button>
				</form>

				<div className="flex flex-row gap-2 text-sm justify-center">
					<span className="text-slate-500 dark:text-slate-400">
						{flow === "signIn" ? "Don't have an account?" : "Already have an account?"}
					</span>
					<button
						type="button"
						className="text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 font-medium underline decoration-2 underline-offset-2 hover:no-underline cursor-pointer transition-colors bg-transparent border-0 p-0"
						onClick={() => {
							setFlow(flow === "signIn" ? "signUp" : "signIn");
							setError(null);
						}}
					>
						{flow === "signIn" ? "Sign up" : "Sign in"}
					</button>
				</div>

				{error && (
					<div className="bg-rose-500/10 border border-rose-500/30 dark:border-rose-500/50 rounded-lg p-3">
						<p className="text-rose-700 dark:text-rose-300 font-medium text-sm break-words">
							{error}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
