"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { useRouter } from "next/navigation";

export default function Home() {
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
