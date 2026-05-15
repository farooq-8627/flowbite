"use client";

import { useMutation, useQuery } from "convex/react";
import { Mail } from "lucide-react";
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
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SettingsSection } from "../../shared/SettingsSection";

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

	return (
		<SettingsSection
			id="team.invitations"
			title="Pending invitations"
			description="Invitations that haven't been accepted yet."
		>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Email</TableHead>
						<TableHead>Role</TableHead>
						<TableHead>Expires</TableHead>
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
									{inv.role}
								</Badge>
							</TableCell>
							<TableCell className="text-xs text-muted-foreground">
								{new Date(inv.expiresAt).toLocaleDateString()}
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
												err instanceof Error
													? err.message
													: "Failed to cancel",
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
		</SettingsSection>
	);
}
