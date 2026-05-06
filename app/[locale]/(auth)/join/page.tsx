"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Orbit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { AuthShellLayout } from "@/core/auth/layouts/AuthShellLayout";
import { APP_CONFIG } from "@/config/app-config";

/**
 * JoinPage — Enter an invite token to join a workspace.
 * Redirects to /join/[token] which handles the actual acceptance.
 */
export default function JoinPage() {
	const router = useRouter();
	const [token, setToken] = useState("");

	return (
		<AuthShellLayout
			panel={{
				icon: <Orbit className="size-10" />,
				title: APP_CONFIG.name,
				tagline: APP_CONFIG.description,
				bottomLeft: { heading: "Join your team", body: "Enter the invite link or token from your admin." },
				bottomRight: { heading: "Need help?", body: "Ask your workspace admin to resend the invitation." },
			}}
		>
			<div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[350px]">
				<div className="space-y-2 text-center">
					<h1 className="font-medium text-3xl">Join a workspace</h1>
					<p className="text-muted-foreground text-sm">
						Enter your invite token to join an existing workspace.
					</p>
				</div>

				<form
					className="space-y-4"
					onSubmit={(e) => {
						e.preventDefault();
						const t = token.trim();
						if (t) router.push(`/join/${t}`);
					}}
				>
					<FieldGroup>
						<Field className="gap-1.5">
							<FieldLabel htmlFor="join-token">Invite token</FieldLabel>
							<Input
								id="join-token"
								placeholder="Paste your invite token here"
								value={token}
								onChange={(e) => setToken(e.target.value)}
								required
							/>
						</Field>
					</FieldGroup>
					<Button className="w-full rounded-[--radius]" type="submit" disabled={!token.trim()}>
						Continue
					</Button>
				</form>
			</div>
		</AuthShellLayout>
	);
}
