"use client";

import { useMutation, useQuery } from "convex/react";
import { CopyIcon, Mail } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { APP_CONFIG } from "@/config/app-config";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { normalizeError } from "@/lib/normalizeError";
import { SettingsSection } from "../../shared/SettingsSection";

/**
 * Build the public accept URL for a pending invitation.
 *
 * Mirrors `convex/invitations/mutations.ts::buildAcceptUrl`. We rebuild on
 * the client (instead of returning the URL from `listPending`) so the
 * format stays in sync with whatever `APP_CONFIG.url` resolves to for THIS
 * deployment — preview, prod, or local dev. The Convex backend can't read
 * `NEXT_PUBLIC_*`, and we don't want preview URLs hard-coded into the DB.
 */
function buildAcceptUrl(token: string): string {
	const base = APP_CONFIG.url.replace(/\/$/, "");
	return `${base}/join/${token}`;
}

/**
 * Copy a string to the clipboard with a graceful fallback for older
 * WebView contexts (mirrors `core/entities/shared/components/CopyField`).
 */
async function copyToClipboard(value: string): Promise<void> {
	if (navigator.clipboard?.writeText) {
		await navigator.clipboard.writeText(value);
		return;
	}
	const el = document.createElement("textarea");
	el.value = value;
	el.setAttribute("readonly", "");
	el.style.position = "absolute";
	el.style.left = "-9999px";
	document.body.appendChild(el);
	el.select();
	document.execCommand("copy");
	document.body.removeChild(el);
}

export function InvitationsSection({
	orgId,
	canManage,
}: {
	orgId: Id<"orgs">;
	canManage: boolean;
}) {
	const pending = useQuery(api.invitations.queries.listPending, { orgId });
	const cancel = useMutation(api.invitations.mutations.cancel);

	if (!canManage) return null;
	if (!pending || pending.length === 0) return null;

	const handleCopyLink = async (token: string) => {
		const url = buildAcceptUrl(token);
		try {
			await copyToClipboard(url);
			toast.success("Invitation link copied", { duration: 1500 });
		} catch {
			toast.error("Couldn't copy. Select the link manually.");
		}
	};

	return (
		<SettingsSection
			id="team.invitations"
			title="Pending invitations"
			description="Invitations that haven't been accepted yet."
		>
			<div className="w-full overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Email</TableHead>
							<TableHead>Role</TableHead>
							<TableHead>Expires</TableHead>
							<TableHead>Invitation link</TableHead>
							<TableHead className="w-10" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{pending.map((inv) => (
							<TableRow key={inv._id}>
								<TableCell>
									<div className="flex items-center gap-2">
										<Mail className="size-4 text-muted-foreground" />
										<span className="text-sm">{inv.email}</span>
									</div>
								</TableCell>
								<TableCell>
									<Badge variant="secondary" className="capitalize">
										{inv.roleName}
									</Badge>
								</TableCell>
								<TableCell className="text-muted-foreground text-xs">
									{new Date(inv.expiresAt).toLocaleDateString()}
								</TableCell>
								<TableCell>
									<Tooltip>
										<TooltipTrigger asChild>
											<Button
												type="button"
												variant="ghost"
												size="sm"
												className="gap-1.5"
												onClick={() => handleCopyLink(inv.token)}
												aria-label={`Copy invitation link for ${inv.email}`}
											>
												<CopyIcon className="size-3.5" aria-hidden />
												<span className="text-xs">Copy link</span>
											</Button>
										</TooltipTrigger>
										<TooltipContent>Copy invitation link</TooltipContent>
									</Tooltip>
								</TableCell>
								<TableCell>
									<Button
										variant="ghost"
										size="sm"
										onClick={async () => {
											try {
												await cancel({ orgId, invitationId: inv._id });
												toast.success("Invitation cancelled");
											} catch (err) {
												toast.error(
													normalizeError(err, "Failed to cancel"),
												);
											}
										}}
									>
										Cancel
									</Button>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		</SettingsSection>
	);
}
