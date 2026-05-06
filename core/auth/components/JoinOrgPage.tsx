"use client";

import { useQuery, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle, Clock, XCircle, Building2, Orbit } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { AuthShellLayout } from "@/core/auth/layouts/AuthShellLayout";
import { toast } from "@/lib/toast";
import { APP_CONFIG } from "@/config/app-config";

interface JoinOrgPageProps {
	token: string;
}

/**
 * JoinOrgPage — Accepts an org invitation by token.
 * User must be authenticated (middleware handles redirect to /signin?redirect=/join/[token]).
 * Shows invitation details, then calls invitations.accept mutation on confirm.
 */
export function JoinOrgPage({ token }: JoinOrgPageProps) {
	const router = useRouter();
	const [accepting, setAccepting] = useState(false);
	const invitation = useQuery(api.invitations.queries.getByToken, { token });
	const accept = useMutation(api.invitations.mutations.accept);

	const handleAccept = async () => {
		setAccepting(true);
		try {
			const result = await accept({ token });
			toast.success(
				result.alreadyMember
					? "You're already a member of this workspace."
					: `Welcome to ${invitation?.orgName ?? "the workspace"}!`,
			);
			router.push(`/${invitation?.orgSlug}/dashboard`);
		} catch (err) {
			toast.mutationError(err as Error, "Failed to accept invitation.");
			setAccepting(false);
		}
	};

	// Loading state
	if (invitation === undefined) {
		return (
			<AuthShellLayout
				panel={{
					icon: <Orbit className="size-10" />,
					title: APP_CONFIG.name,
					tagline: APP_CONFIG.description,
					bottomLeft: { heading: "Team collaboration", body: "Work together with your team in one workspace." },
					bottomRight: { heading: "Need help?", body: "Contact support if you have trouble joining." },
				}}
			>
				<div className="mx-auto flex w-full flex-col items-center justify-center space-y-4 sm:w-[380px]">
					<div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
					<p className="text-muted-foreground text-sm">Loading invitation…</p>
				</div>
			</AuthShellLayout>
		);
	}

	// Not found
	if (!invitation) {
		return (
			<AuthShellLayout
				panel={{
					icon: <Orbit className="size-10" />,
					title: APP_CONFIG.name,
					tagline: APP_CONFIG.description,
					bottomLeft: { heading: "Invalid link", body: "This invitation link is not valid." },
					bottomRight: { heading: "Need help?", body: "Contact the person who invited you for a new link." },
				}}
			>
				<div className="mx-auto flex w-full flex-col items-center justify-center space-y-6 sm:w-[380px]">
					<XCircle className="size-12 text-destructive" />
					<div className="space-y-2 text-center">
						<h1 className="font-medium text-2xl">Invitation not found</h1>
						<p className="text-muted-foreground text-sm">
							This invitation link is invalid or has already been used.
						</p>
					</div>
					<Button variant="outline" className="w-full" onClick={() => router.push("/signin")}>
						Go to sign in
					</Button>
				</div>
			</AuthShellLayout>
		);
	}

	// Expired
	if (invitation.status === "expired" || invitation.expiresAt < Date.now()) {
		return (
			<AuthShellLayout
				panel={{
					icon: <Orbit className="size-10" />,
					title: APP_CONFIG.name,
					tagline: APP_CONFIG.description,
					bottomLeft: { heading: "Expired link", body: "Ask your admin to send a new invitation." },
					bottomRight: { heading: "Need help?", body: "Contact support if you need assistance." },
				}}
			>
				<div className="mx-auto flex w-full flex-col items-center justify-center space-y-6 sm:w-[380px]">
					<Clock className="size-12 text-muted-foreground" />
					<div className="space-y-2 text-center">
						<h1 className="font-medium text-2xl">Invitation expired</h1>
						<p className="text-muted-foreground text-sm">
							This invitation has expired. Ask your admin to send a new one.
						</p>
					</div>
					<Button variant="outline" className="w-full" onClick={() => router.push("/signin")}>
						Go to sign in
					</Button>
				</div>
			</AuthShellLayout>
		);
	}

	// Already accepted
	if (invitation.status === "accepted") {
		return (
			<AuthShellLayout
				panel={{
					icon: <Orbit className="size-10" />,
					title: APP_CONFIG.name,
					tagline: APP_CONFIG.description,
					bottomLeft: { heading: "Already joined", body: "You're already a member of this workspace." },
					bottomRight: { heading: "Need help?", body: "Contact support if you have trouble accessing." },
				}}
			>
				<div className="mx-auto flex w-full flex-col items-center justify-center space-y-6 sm:w-[380px]">
					<CheckCircle className="size-12 text-green-500" />
					<div className="space-y-2 text-center">
						<h1 className="font-medium text-2xl">Already accepted</h1>
						<p className="text-muted-foreground text-sm">
							This invitation has already been accepted.
						</p>
					</div>
					<Button className="w-full" onClick={() => router.push(`/${invitation.orgSlug}/dashboard`)}>
						Go to workspace
					</Button>
				</div>
			</AuthShellLayout>
		);
	}

	// Valid pending invitation — show accept UI
	return (
		<AuthShellLayout
			panel={{
				icon: <Orbit className="size-10" />,
				title: APP_CONFIG.name,
				tagline: APP_CONFIG.description,
				bottomLeft: { heading: "Join your team", body: "Collaborate with your team in one workspace." },
				bottomRight: { heading: "Need help?", body: "Contact support if you have trouble joining." },
			}}
		>
			<div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[380px]">
				<div className="space-y-2 text-center">
					<div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[--radius] bg-primary/10">
						<Building2 className="size-7 text-primary" />
					</div>
					<h1 className="font-medium text-2xl">You&apos;re invited</h1>
					<p className="text-muted-foreground text-sm">
						You&apos;ve been invited to join{" "}
						<span className="font-medium text-foreground">{invitation.orgName}</span>{" "}
						as a <span className="font-medium text-foreground capitalize">{invitation.role}</span>.
					</p>
				</div>

				<div className="rounded-[--radius] border bg-muted/40 px-4 py-3 text-sm">
					<div className="flex items-center justify-between">
						<span className="text-muted-foreground">Invited email</span>
						<span className="font-medium">{invitation.email}</span>
					</div>
					<div className="mt-2 flex items-center justify-between">
						<span className="text-muted-foreground">Role</span>
						<span className="font-medium capitalize">{invitation.role}</span>
					</div>
					<div className="mt-2 flex items-center justify-between">
						<span className="text-muted-foreground">Workspace</span>
						<span className="font-medium">{invitation.orgName}</span>
					</div>
				</div>

				<div className="space-y-3">
					<Button
						className="w-full rounded-[--radius]"
						onClick={handleAccept}
						disabled={accepting}
					>
						{accepting ? "Joining…" : `Join ${invitation.orgName}`}
					</Button>
					<Button
						variant="outline"
						className="w-full rounded-[--radius]"
						onClick={() => router.push("/signin")}
						disabled={accepting}
					>
						Decline
					</Button>
				</div>

				<p className="text-center text-muted-foreground text-xs">
					Make sure you&apos;re signed in with{" "}
					<span className="font-medium text-foreground">{invitation.email}</span>{" "}
					to accept this invitation.
				</p>
			</div>
		</AuthShellLayout>
	);
}
