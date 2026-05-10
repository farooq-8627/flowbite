"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { toast } from "sonner";
import { Mail, MoreHorizontal, Trash2, Plus, Shield, Pencil } from "lucide-react";
import { z } from "zod/v4";
import { api } from "@/convex/_generated/api";
import type { Id, Doc } from "@/convex/_generated/dataModel";

import { SettingsSection } from "../shared/SettingsSection";
import { useSettingsForm } from "../../hooks/useSettingsForm";
import { RoleEditorDialog, CreateRoleDialog } from "./team/RoleEditor";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
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
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

type Role = Doc<"orgRoles">;

// ────────────────────────────────────────────────────────────────────────────
// Invite dialog
// ────────────────────────────────────────────────────────────────────────────

const inviteSchema = z.object({
	email: z.string().email("Enter a valid email"),
	role: z.union([
		z.literal("admin"),
		z.literal("member"),
		z.literal("viewer"),
	]),
});

function InviteMemberDialog({ orgId }: { orgId: Id<"orgs"> }) {
	const [open, setOpen] = useState(false);
	const invite = useMutation(api.invitations.mutations.create);

	const { form, isSubmitting, handleSubmit } = useSettingsForm({
		schema: inviteSchema,
		values: { email: "", role: "member" as const },
		onSubmit: async (data) => {
			await invite({ orgId, email: data.email, role: data.role });
			toast.success(`Invitation sent to ${data.email}`);
			form.reset({ email: "", role: "member" });
			setOpen(false);
		},
	});

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button size="sm">
					<Plus className="size-4" />
					Invite member
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Invite a new member</DialogTitle>
					<DialogDescription>
						They'll get an email with a link to join this workspace.
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={handleSubmit} className="grid gap-4">
						<FormField
							control={form.control}
							name="email"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Email address</FormLabel>
									<FormControl>
										<Input
											type="email"
											autoComplete="off"
											placeholder="name@company.com"
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="role"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Role</FormLabel>
									<Select
										onValueChange={field.onChange}
										value={field.value as string}
									>
										<FormControl>
											<SelectTrigger className="w-full">
												<SelectValue placeholder="Select a role" />
											</SelectTrigger>
										</FormControl>
										<SelectContent>
											<SelectItem value="admin">
												Admin — full settings access
											</SelectItem>
											<SelectItem value="member">
												Member — standard access
											</SelectItem>
											<SelectItem value="viewer">
												Viewer — read-only
											</SelectItem>
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								size="sm"
								onClick={() => setOpen(false)}
							>
								Cancel
							</Button>
							<Button type="submit" size="sm" disabled={isSubmitting}>
								Send invitation
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Members table
// ────────────────────────────────────────────────────────────────────────────

function initials(name?: string | null, email?: string | null) {
	const src = (name ?? email ?? "?").trim();
	const parts = src.split(/\s+/);
	if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
	return src.slice(0, 2).toUpperCase();
}

function MembersSection({
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
	const members = useQuery(api.orgs.queries.listMembers, { orgId });
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
			action={canManage ? <InviteMemberDialog orgId={orgId} /> : undefined}
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
						{isLoading ? null : (
							members.map((m) => {
								const role = roleById.get(m.roleId);
								const isMe = m.userId === currentUserId;
								return (
									<TableRow key={m._id}>
										<TableCell>
											<div className="flex items-center gap-3">
												<Avatar className="size-8">
													{m.user.avatarUrl && <AvatarImage src={m.user.avatarUrl} alt="" />}
													<AvatarFallback className="text-xs">
														{initials(m.user.name, m.user.email)}
													</AvatarFallback>
												</Avatar>
												<div className="min-w-0">
													<div className="truncate text-sm font-medium">
														{m.user.name ?? m.user.email}
														{isMe && (
															<span className="ms-1.5 text-xs text-muted-foreground">(you)</span>
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
												style={role?.color ? { backgroundColor: `${role.color}20`, color: role.color } : undefined}
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
															<Button variant="ghost" size="icon" className="size-8">
																<MoreHorizontal className="size-4" />
															</Button>
														</DropdownMenuTrigger>
														<DropdownMenuContent align="end">
															<DropdownMenuSub>
																<DropdownMenuSubTrigger>
																	<Shield className="size-4" /> Change role
																</DropdownMenuSubTrigger>
																<DropdownMenuSubContent>
																	{(roles ?? []).map((r) => (
																		<DropdownMenuItem
																			key={r._id}
																			disabled={m.roleId === r._id}
																			onClick={async () => {
																				try {
																					await changeRole({ orgId, userId: m.userId, roleId: r._id });
																					toast.success(`Role changed to ${r.name}`);
																				} catch (err) {
																					toast.error(err instanceof Error ? err.message : "Failed to change role");
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
																	if (!confirm(`Remove ${m.user.name ?? m.user.email} from this workspace?`)) return;
																	try {
																		await removeMember({ orgId, userId: m.userId });
																		toast.success("Member removed");
																	} catch (err) {
																		toast.error(err instanceof Error ? err.message : "Failed to remove member");
																	}
																}}
															>
																<Trash2 className="size-4" /> Remove from workspace
															</DropdownMenuItem>
														</DropdownMenuContent>
													</DropdownMenu>
												)}
											</TableCell>
										)}
									</TableRow>
								);
							})
						)}
					</TableBody>
				</Table>
			</div>
		</SettingsSection>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Pending invitations
// ────────────────────────────────────────────────────────────────────────────

function InvitationsSection({ orgId, canManage }: { orgId: Id<"orgs">; canManage: boolean }) {
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
								<Badge variant="secondary" className="capitalize">{inv.role}</Badge>
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
											toast.error(err instanceof Error ? err.message : "Failed to cancel");
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

// ────────────────────────────────────────────────────────────────────────────
// Roles (owner only)
// ────────────────────────────────────────────────────────────────────────────

function RolesSection({ orgId }: { orgId: Id<"orgs"> }) {
	const roles = useQuery(api.orgRoles.queries.list, { orgId });
	const remove = useMutation(api.orgRoles.mutations.remove);

	const [editing, setEditing] = useState<Role | null>(null);
	const [creating, setCreating] = useState(false);

	const handleDelete = async (role: Role) => {
		if (role.isSystem) return;
		if (!confirm(`Delete role "${role.name}"? Members with this role will be reassigned to the default role.`)) return;
		try {
			await remove({ roleId: role._id });
			toast.success(`Deleted role "${role.name}"`);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to delete role");
		}
	};

	return (
		<SettingsSection
			id="team.roles"
			title="Roles"
			description="System and custom roles for this workspace. Click a role to edit its permissions."
			action={
				<Button size="sm" onClick={() => setCreating(true)}>
					<Plus className="size-4" /> New role
				</Button>
			}
		>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Role</TableHead>
						<TableHead>Description</TableHead>
						<TableHead className="text-end">Type</TableHead>
						<TableHead className="text-end">Permissions</TableHead>
						<TableHead className="w-10" />
					</TableRow>
				</TableHeader>
				<TableBody>
					{roles === undefined ? null : (
						roles.map((r) => (
							<TableRow key={r._id}>
								<TableCell>
									<button
										type="button"
										onClick={() => setEditing(r)}
										className="flex items-center gap-2 text-sm font-medium hover:underline"
									>
										{r.color && (
											<span
												className="inline-block size-2.5 rounded-full"
												style={{ backgroundColor: r.color }}
											/>
										)}
										{r.name}
									</button>
								</TableCell>
								<TableCell className="text-xs text-muted-foreground">
									{r.description ?? "—"}
								</TableCell>
								<TableCell className="text-end">
									<Badge variant={r.isSystem ? "secondary" : "outline"}>
										{r.isSystem ? "System" : "Custom"}
									</Badge>
								</TableCell>
								<TableCell className="text-end text-xs text-muted-foreground tabular-nums">
									{r.permissions.length}
								</TableCell>
								<TableCell>
									<div className="flex justify-end gap-0.5">
										<Button
											variant="ghost"
											size="icon"
											className="size-7"
											onClick={() => setEditing(r)}
											aria-label="Edit role"
										>
											<Pencil className="size-3.5" />
										</Button>
										{!r.isSystem && (
											<Button
												variant="ghost"
												size="icon"
												className="size-7 text-muted-foreground hover:text-destructive"
												onClick={() => handleDelete(r)}
												aria-label="Delete role"
											>
												<Trash2 className="size-3.5" />
											</Button>
										)}
									</div>
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>

			{editing && (
				<RoleEditorDialog
					role={editing}
					open={!!editing}
					onOpenChange={(v) => !v && setEditing(null)}
				/>
			)}
			<CreateRoleDialog
				orgId={orgId}
				open={creating}
				onOpenChange={setCreating}
			/>
		</SettingsSection>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Export
// ────────────────────────────────────────────────────────────────────────────

export function TeamGroup({
	orgId,
	permissions,
}: {
	orgId: Id<"orgs">;
	permissions: string[];
}) {
	const me = useQuery(api.users.queries.getCurrent);
	const roles = useQuery(api.orgRoles.queries.list, { orgId });

	const canManage = permissions.includes("members.invite");
	const isOwner = permissions.includes("org.delete");

	return (
		<div className="grid gap-6">
			<MembersSection
				orgId={orgId}
				roles={roles}
				currentUserId={me?._id}
				canManage={canManage}
			/>
			<InvitationsSection orgId={orgId} canManage={canManage} />
			{isOwner && <RolesSection orgId={orgId} />}
		</div>
	);
}
