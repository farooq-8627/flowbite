"use client";

import { useMutation } from "convex/react";
import { Copy, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useSettingsForm } from "../../../hooks/useSettingsForm";

type Role = Doc<"orgRoles">;

const inviteSchema = z.object({
	email: z.string().email("Enter a valid email"),
	role: z.union([z.literal("admin"), z.literal("member"), z.literal("viewer")]),
});

const INVITE_SYSTEM_ROLE_NAMES = ["admin", "member", "viewer"] as const;

/**
 * `roles` is provided by the parent (MembersSection → TeamGroup) so the
 * same role list is shared across the whole Team tab from a single
 * subscription. See AGENTS.md "Per-row data on a list view comes from
 * one batched query".
 */
export function InviteMemberDialog({
	orgId,
	roles,
}: {
	orgId: Id<"orgs">;
	roles: Role[] | undefined;
}) {
	const [open, setOpen] = useState(false);
	const [lastAcceptUrl, setLastAcceptUrl] = useState<string | null>(null);
	const invite = useMutation(api.invitations.mutations.create);

	const inviteRoles = useMemo(() => {
		const byName = new Map<string, Role>();
		for (const r of roles ?? []) {
			byName.set(r.name.toLowerCase(), r);
		}
		return INVITE_SYSTEM_ROLE_NAMES.map((key) => ({ key, role: byName.get(key) })).filter(
			(r): r is { key: (typeof INVITE_SYSTEM_ROLE_NAMES)[number]; role: Role } => !!r.role,
		);
	}, [roles]);

	const { form, isSubmitting, handleSubmit } = useSettingsForm({
		schema: inviteSchema,
		values: { email: "", role: "member" as const },
		onSubmit: async (data) => {
			const result = await invite({ orgId, email: data.email, role: data.role });
			toast.success(`Invitation sent to ${data.email}`, {
				description:
					"They'll get an email with a link to accept. You can also copy the link below.",
			});
			setLastAcceptUrl(result.acceptUrl);
			form.reset({ email: "", role: "member" });
		},
	});

	const handleCopyLink = async () => {
		if (!lastAcceptUrl) return;
		try {
			await navigator.clipboard.writeText(lastAcceptUrl);
			toast.success("Invite link copied to clipboard");
		} catch {
			toast.error("Couldn't copy. Select the text manually.");
		}
	};

	const handleClose = () => {
		setOpen(false);
		// Clear the cached link a moment after the dialog finishes its close
		// animation so the next open starts fresh.
		setTimeout(() => setLastAcceptUrl(null), 200);
	};

	return (
		<Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : handleClose())}>
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
						{lastAcceptUrl
							? "Invitation created. Email is on its way — copy the link below if you'd rather share it directly."
							: "They'll get an email with a link to join this workspace."}
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
											{inviteRoles.map(({ key, role }) => (
												<SelectItem key={key} value={key}>
													<span className="font-medium">{role.name}</span>
													{role.description && (
														<span className="text-muted-foreground">
															{" "}
															— {role.description}
														</span>
													)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>

						{lastAcceptUrl && (
							<div className="space-y-2 rounded-[var(--radius)] border bg-muted/40 p-3">
								<p className="text-muted-foreground text-xs">Direct invite link</p>
								<div className="flex items-center gap-2">
									<code className="flex-1 truncate rounded-[var(--radius)] border bg-background px-2 py-1 text-xs">
										{lastAcceptUrl}
									</code>
									<Button
										type="button"
										size="sm"
										variant="outline"
										onClick={handleCopyLink}
									>
										<Copy className="size-3.5" />
										Copy
									</Button>
								</div>
							</div>
						)}

						<DialogFooter>
							<Button type="button" variant="outline" size="sm" onClick={handleClose}>
								{lastAcceptUrl ? "Done" : "Cancel"}
							</Button>
							<Button type="submit" size="sm" disabled={isSubmitting}>
								{lastAcceptUrl ? "Send another" : "Send invitation"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
