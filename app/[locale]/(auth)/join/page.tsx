"use client";

import { Orbit } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { APP_CONFIG } from "@/config/app-config";
import { AuthShellLayout } from "@/core/shell/auth/layouts/AuthShellLayout";
import { extractInviteToken } from "@/lib/invite-token";

/**
 * JoinPage — Enter an invite link or token to join a workspace.
 *
 * The form accepts every common shape an inviter might paste — full URL
 * with locale prefix, bare URL, or raw token — via the shared
 * `extractInviteToken` util, then redirects to `/join/<token>` which
 * renders the standard accept-card. Without that extraction step a
 * paste of `http://localhost:3000/en/join/<token>` would push to
 * `/en/join/http://localhost:3000/en/join/<token>` and 404. See
 * `lib/invite-token.ts` + `lib/invite-token.test.ts` for the parser.
 */
export default function JoinPage() {
	const router = useRouter();
	const [input, setInput] = useState("");

	const token = extractInviteToken(input);

	return (
		<AuthShellLayout
			panel={{
				icon: <Orbit className="size-10" />,
				title: APP_CONFIG.name,
				tagline: APP_CONFIG.description,
				bottomLeft: {
					heading: "Join your team",
					body: "Enter the invite link or token from your admin.",
				},
				bottomRight: {
					heading: "Need help?",
					body: "Ask your workspace admin to resend the invitation.",
				},
			}}
		>
			<div className="mx-auto flex w-full flex-col justify-center space-y-8 sm:w-[350px]">
				<div className="space-y-2 text-center">
					<h1 className="font-medium text-3xl">Join a workspace</h1>
					<p className="text-muted-foreground text-sm">
						Paste the invite link or token from your admin.
					</p>
				</div>

				<form
					className="space-y-4"
					onSubmit={(e) => {
						e.preventDefault();
						if (token) router.push(`/join/${token}`);
					}}
				>
					<FieldGroup>
						<Field className="gap-1.5">
							<FieldLabel htmlFor="join-token">Invite link or token</FieldLabel>
							<Input
								id="join-token"
								placeholder="Paste your invite link here"
								value={input}
								onChange={(e) => setInput(e.target.value)}
								required
							/>
						</Field>
					</FieldGroup>
					<Button
						className="w-full rounded-[var(--radius)]"
						type="submit"
						disabled={!token}
					>
						Continue
					</Button>
				</form>
			</div>
		</AuthShellLayout>
	);
}
