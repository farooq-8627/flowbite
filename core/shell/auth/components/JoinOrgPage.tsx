"use client";

import { useMutation, useQuery } from "convex/react";
import { Building2, CheckCircle, Clock, Orbit, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { APP_CONFIG } from "@/config/app-config";
import { api } from "@/convex/_generated/api";
import { AuthShellLayout } from "@/core/shell/auth/layouts/AuthShellLayout";
import { toast } from "@/lib/toast";

interface JoinOrgPageProps {
	token: string;
}

/**
 * JoinOrgPage — accept an org invitation by token.
 *
 * LAYOUT
 * ──────
 * Reuses the shared `<AuthShellLayout>` (same as signin / signup /
 * onboarding) so the right-side branded panel is identical across the
 * auth surface. Only the left-side card content changes per state.
 *
 * AUTH
 * ────
 * The middleware redirects unauthenticated users to
 * `/signin?redirect=/join/<token>`, so by the time this component renders
 * the user is signed in. The accept mutation itself also requires auth
 * server-side as a final guarantee.
 *
 * STATES
 * ──────
 * - loading      — spinner card while `getByToken` resolves
 * - not-found    — invalid token or already deleted invitation row
 * - expired      — token still exists but `expiresAt` has passed
 * - accepted     — invitation already used (one-shot link is dead)
 * - pending      — happy path: show the accept card with org/role/email
 *                  + "I accept" checkbox + Join button
 */
export function JoinOrgPage({ token }: JoinOrgPageProps) {
	const router = useRouter();
	const [accepting, setAccepting] = useState(false);
	const [agreed, setAgreed] = useState(false);
	const invitation = useQuery(api.invitations.queries.getByToken, { token });
	const accept = useMutation(api.invitations.mutations.accept);

	const orgName = invitation?.orgName ?? "the workspace";

	// Right-side panel — identical across every state of this page so the
	// layout doesn't shift as the left-side card content changes.
	const panel = {
		icon: <Orbit className="size-10" />,
		title: APP_CONFIG.name,
		tagline: APP_CONFIG.description,
		bottomLeft: {
			heading: "Welcome to the team",
			body: "One invite, one click. We handle the rest.",
		},
		bottomRight: {
			heading: "Need help?",
			body: "Ask the workspace admin for a fresh invite if anything looks off.",
		},
	};

	const handleAccept = async () => {
		if (!agreed || accepting) return;
		setAccepting(true);
		try {
			const result = await accept({ token });
			toast.success(
				result.alreadyMember
					? `You're already a member of ${orgName}.`
					: `Welcome to ${orgName}!`,
			);
			router.push(invitation?.orgSlug ? `/${invitation.orgSlug}` : "/");
		} catch (err) {
			toast.mutationError(err as Error, "Couldn't accept the invitation.");
			setAccepting(false);
		}
	};

	// ── Loading ───────────────────────────────────────────────────────
	if (invitation === undefined) {
		return (
			<AuthShellLayout panel={panel}>
				<div className="mx-auto flex w-full flex-col items-center justify-center gap-4 sm:w-[380px]">
					<div className="h-8 w-8 animate-spin rounded-full border-primary border-b-2" />
					<p className="text-muted-foreground text-sm">Loading invitation…</p>
				</div>
			</AuthShellLayout>
		);
	}

	// ── Not found ─────────────────────────────────────────────────────
	if (!invitation) {
		return (
			<AuthShellLayout panel={panel}>
				<JoinStatusCard
					icon={<XCircle className="size-7 text-destructive" />}
					iconBg="bg-destructive/10"
					title="Invitation not found"
					description="This invitation link is invalid or has already been used. Ask the person who invited you for a new link."
					action={
						<Button
							variant="outline"
							className="w-full rounded-[var(--radius)]"
							onClick={() => router.push("/")}
						>
							Go to {APP_CONFIG.name}
						</Button>
					}
				/>
			</AuthShellLayout>
		);
	}

	// ── Expired ───────────────────────────────────────────────────────
	if (invitation.status === "expired" || invitation.expiresAt < Date.now()) {
		return (
			<AuthShellLayout panel={panel}>
				<JoinStatusCard
					icon={<Clock className="size-7 text-muted-foreground" />}
					iconBg="bg-muted"
					title="Invitation expired"
					description={`This invitation to ${orgName} has expired. Ask your admin to send a new one.`}
					action={
						<Button
							variant="outline"
							className="w-full rounded-[var(--radius)]"
							onClick={() => router.push("/")}
						>
							Go to {APP_CONFIG.name}
						</Button>
					}
				/>
			</AuthShellLayout>
		);
	}

	// ── Already accepted ──────────────────────────────────────────────
	if (invitation.status === "accepted") {
		return (
			<AuthShellLayout panel={panel}>
				<JoinStatusCard
					icon={<CheckCircle className="size-7 text-green-600" />}
					iconBg="bg-green-500/10"
					title="Already accepted"
					description={`This invitation has already been used. The link is now closed — if you need to rejoin ${orgName}, ask your admin to send a fresh invite.`}
					action={
						<Button
							className="w-full rounded-[var(--radius)]"
							onClick={() =>
								router.push(invitation.orgSlug ? `/${invitation.orgSlug}` : "/")
							}
						>
							Go to {orgName}
						</Button>
					}
				/>
			</AuthShellLayout>
		);
	}

	// ── Pending — happy path ──────────────────────────────────────────
	return (
		<AuthShellLayout panel={panel}>
			<div className="mx-auto flex w-full flex-col justify-center gap-6 sm:w-[380px]">
				<div className="flex flex-col items-center gap-3 text-center">
					<div
						aria-hidden
						className="flex size-14 items-center justify-center rounded-[var(--radius)] bg-primary/10"
					>
						<Building2 className="size-7 text-primary" />
					</div>
					<div className="space-y-1.5">
						<h1 className="font-medium text-2xl">You&apos;re invited</h1>
						<p className="text-muted-foreground text-sm">
							You&apos;ve been invited to join{" "}
							<span className="font-medium text-foreground">{orgName}</span>.
						</p>
					</div>
				</div>

				<div className="rounded-[var(--radius)] border bg-muted/40 px-4 py-3 text-sm">
					<dl className="flex flex-col gap-2">
						<div className="flex items-baseline justify-between gap-3">
							<dt className="text-muted-foreground">Workspace</dt>
							<dd className="truncate text-end font-medium">{orgName}</dd>
						</div>
						<div className="flex items-baseline justify-between gap-3">
							<dt className="text-muted-foreground">Role</dt>
							<dd className="truncate text-end font-medium">{invitation.roleName}</dd>
						</div>
						<div className="flex items-baseline justify-between gap-3">
							<dt className="text-muted-foreground">Invited email</dt>
							<dd className="truncate text-end font-medium">{invitation.email}</dd>
						</div>
					</dl>
				</div>

				<label
					htmlFor="join-accept"
					className="flex cursor-pointer items-start gap-3 rounded-[var(--radius)] border bg-card px-3 py-3 text-sm transition-colors hover:bg-muted/50"
				>
					<Checkbox
						id="join-accept"
						checked={agreed}
						onCheckedChange={(v) => setAgreed(Boolean(v))}
						className="mt-0.5"
					/>
					<span className="text-foreground">
						I accept this invitation and agree to join{" "}
						<span className="font-medium">{orgName}</span> as{" "}
						<span className="font-medium">{invitation.roleName}</span>.
					</span>
				</label>

				<div className="flex flex-col gap-2">
					<Button
						className="w-full rounded-[var(--radius)]"
						onClick={handleAccept}
						disabled={!agreed || accepting}
					>
						{accepting ? "Joining…" : `Join ${orgName}`}
					</Button>
					<Button
						variant="ghost"
						className="w-full rounded-[var(--radius)]"
						onClick={() => router.push("/")}
						disabled={accepting}
					>
						Not now
					</Button>
				</div>

				<p className="text-center text-muted-foreground text-xs">
					Make sure you&apos;re signed in with{" "}
					<span className="font-medium text-foreground">{invitation.email}</span> —
					that&apos;s the email this invite was sent to.
				</p>
			</div>
		</AuthShellLayout>
	);
}

// ─── Reusable status-card body ────────────────────────────────────────────────
//
// The not-found / expired / already-accepted screens share the same shape:
// icon bubble, headline, description, single action button. Extracting it
// keeps the visual identity consistent across states.

function JoinStatusCard({
	icon,
	iconBg,
	title,
	description,
	action,
}: {
	icon: React.ReactNode;
	iconBg: string;
	title: string;
	description: string;
	action: React.ReactNode;
}) {
	return (
		<div className="mx-auto flex w-full flex-col justify-center gap-6 sm:w-[380px]">
			<div className="flex flex-col items-center gap-3 text-center">
				<div
					aria-hidden
					className={`flex size-14 items-center justify-center rounded-[var(--radius)] ${iconBg}`}
				>
					{icon}
				</div>
				<div className="space-y-1.5">
					<h1 className="font-medium text-2xl">{title}</h1>
					<p className="text-muted-foreground text-sm">{description}</p>
				</div>
			</div>
			{action}
		</div>
	);
}
