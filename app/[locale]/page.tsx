"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/convex/_generated/api";

export default function Home() {
	const { isAuthenticated, isLoading } = useConvexAuth();
	const router = useRouter();
	const currentUser = useQuery(api.users.queries.me);

	// Redirect authenticated users to their dashboard
	useEffect(() => {
		if (!isLoading && isAuthenticated && currentUser) {
			// For now, redirect to a temporary org slug "reimaginy"
			// TODO: Replace with actual org resolution logic
			router.push("/dashboard/reimaginy");
		}
	}, [isAuthenticated, isLoading, currentUser, router]);

	if (isLoading || (isAuthenticated && currentUser)) {
		return (
			<main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-800 dark:border-slate-200" />
				<p className="text-slate-600 dark:text-slate-400">Loading...</p>
			</main>
		);
	}

	return (
		<main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
			<h1 className="text-3xl font-bold text-slate-800 dark:text-slate-200">FlowBite</h1>
			<p className="text-slate-600 dark:text-slate-400">
				B2B SaaS Platform — Phase 0 Foundation
			</p>
			<SignOutButton />
		</main>
	);
}

function SignOutButton() {
	const { isAuthenticated } = useConvexAuth();
	const { signOut } = useAuthActions();
	const router = useRouter();
	if (!isAuthenticated) return null;
	return (
		<button
			className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
			onClick={() => void signOut().then(() => router.push("/signin"))}
			type="button"
		>
			Sign out
		</button>
	);
}
