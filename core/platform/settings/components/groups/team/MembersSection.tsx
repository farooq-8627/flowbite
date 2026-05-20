"use client";

import { useMutation } from "convex/react";
import { MoreHorizontal, Shield, Trash2 } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useOrgMembers } from "@/core/shell/shared/hooks/useCurrentOrg";
import { normalizeError } from "@/lib/normalizeError";
import { SettingsSection } from "../../shared/SettingsSection";
import { InviteMemberDialog } from "./InviteMemberDialog";

type Role = Doc<"orgRoles">;

function initials(name?: string | null, email?: string | null) {
	const src = (name ?? email ?? "?").trim();
	const parts = src.split(/\s+/);
	if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
	return src.slice(0, 2).toUpperCase();
}

export function MembersSection({
	orgId,
	roles,
	currentUserId,
	canManage,
}: {
	orgId: Id<"orgs">;
	roles: Role[] | undefined;
	currentUserId: Id<"users"> | undefined;
	canManage: boolean;
}) {
	const members = useOrgMembers();
	const changeRole = useMutation(api.orgs.mutations.updateMemberRole);
	const removeMember = useMutation(api.orgs.mutations.removeMember);

	const roleById = useMemo(() => {
		const map = new Map<Id<"orgRoles">, Role>();
		for (const r of roles ?? []) map.set(r._id, r);
		return map;
	}, [roles]);

	const isLoading = members === undefined || roles === undefined;

	return (
		<SettingsSection
			id="team.members"
			title="Members"
			description="People who have access to this workspace."
			action={canManage ? <InviteMemberDialog orgId={orgId} roles={roles} /> : undefined}
		>
			<div className="overflow-x-auto">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Role</TableHead>
							<TableHead className="text-end">Joined</TableHead>
							{canManage && <TableHead className="w-10" />}
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading
							? null
							: members.map((m) => {
									const role = roleById.get(m.roleId);
									const isMe = m.userId === currentUserId;
									return (
										<TableRow key={m._id}>
											<TableCell>
												<div className="flex items-center gap-3">
													<Avatar className="size-8">
														{m.user.avatarUrl && (
															<AvatarImage
																src={m.user.avatarUrl}
																alt=""
															/>
														)}
														<AvatarFallback className="text-xs">
															{initials(m.user.name, m.user.email)}
														</AvatarFallback>
													</Avatar>
													<div className="min-w-0">
														<div className="truncate text-sm font-medium">
															{m.user.name ?? m.user.email}
															{isMe && (
																<span className="ms-1.5 text-xs text-muted-foreground">
																	(you)
																</span>
															)}
														</div>
														<div className="truncate text-xs text-muted-foreground">
															{m.user.email}
														</div>
													</div>
												</div>
											</TableCell>
											<TableCell>
												<Badge
													variant="secondary"
													style={
														role?.color
															? {
																	backgroundColor: `${role.color}20`,
																	color: role.color,
																}
															: undefined
													}
												>
													{role?.name ?? "—"}
												</Badge>
											</TableCell>
											<TableCell className="text-end text-xs text-muted-foreground">
												{new Date(m.joinedAt).toLocaleDateString()}
											</TableCell>
											{canManage && (
												<TableCell>
													{!isMe && (
														<DropdownMenu>
															<DropdownMenuTrigger asChild>
																<Button
																	variant="ghost"
																	size="icon"
																	className="size-8"
																>
																	<MoreHorizontal className="size-4" />
																</Button>
															</DropdownMenuTrigger>
															<DropdownMenuContent align="end">
																<DropdownMenuSub>
																	<DropdownMenuSubTrigger>
																		<Shield className="size-4" />{" "}
																		Change role
																	</DropdownMenuSubTrigger>
																	<DropdownMenuSubContent>
																		{(roles ?? []).map((r) => (
																			<DropdownMenuItem
																				key={r._id}
																				disabled={
																					m.roleId ===
																					r._id
																				}
																				onClick={async () => {
																					try {
																						await changeRole(
																							{
																								orgId,
																								userId: m.userId,
																								roleId: r._id,
																							},
																						);
																						toast.success(
																							`Role changed to ${r.name}`,
																						);
																					} catch (err) {
																						toast.error(
																							normalizeError(
																								err,
																								"Failed to change role",
																							),
																						);
																					}
																				}}
																			>
																				{r.name}
																			</DropdownMenuItem>
																		))}
																	</DropdownMenuSubContent>
																</DropdownMenuSub>
																<DropdownMenuSeparator />
																<DropdownMenuItem
																	variant="destructive"
																	onClick={async () => {
																		if (
																			!confirm(
																				`Remove ${m.user.name ?? m.user.email} from this workspace?`,
																			)
																		)
																			return;
																		try {
																			await removeMember({
																				orgId,
																				userId: m.userId,
																			});
																			toast.success(
																				"Member removed",
																			);
																		} catch (err) {
																			toast.error(
																				normalizeError(
																					err,
																					"Failed to remove member",
																				),
																			);
																		}
																	}}
																>
																	<Trash2 className="size-4" />{" "}
																	Remove from workspace
																</DropdownMenuItem>
															</DropdownMenuContent>
														</DropdownMenu>
													)}
												</TableCell>
											)}
										</TableRow>
									);
								})}
					</TableBody>
				</Table>
			</div>
		</SettingsSection>
	);
}
