"use client";

import { useMutation } from "convex/react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
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
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { SettingsSection } from "../../shared/SettingsSection";
import { CreateRoleDialog, RoleEditorDialog } from "./RoleEditor";

type Role = Doc<"orgRoles">;

/**
 * `roles` is provided by the parent `TeamGroup` so the same data is shared
 * across MembersSection, RolesSection, and InviteMemberDialog from a single
 * subscription — see AGENTS.md "Per-row data on a list view comes from one
 * batched query".
 */
export function RolesSection({
	orgId,
	roles,
}: {
	orgId: Id<"orgs">;
	roles: Role[] | undefined;
}) {
	const remove = useMutation(api.orgRoles.mutations.remove);

	const [editing, setEditing] = useState<Role | null>(null);
	const [creating, setCreating] = useState(false);

	const handleDelete = async (role: Role) => {
		if (role.isSystem) return;
		if (
			!confirm(
				`Delete role "${role.name}"? Members with this role will be reassigned to the default role.`,
			)
		)
			return;
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
					{roles === undefined
						? null
						: roles.map((r) => (
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
							))}
				</TableBody>
			</Table>

			{editing && (
				<RoleEditorDialog
					role={editing}
					open={!!editing}
					onOpenChange={(v) => !v && setEditing(null)}
				/>
			)}
			<CreateRoleDialog orgId={orgId} open={creating} onOpenChange={setCreating} />
		</SettingsSection>
	);
}
