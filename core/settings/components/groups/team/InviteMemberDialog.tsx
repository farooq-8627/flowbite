"use client";

import { useMutation, useQuery } from "convex/react";
import { Plus } from "lucide-react";
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

export function InviteMemberDialog({ orgId }: { orgId: Id<"orgs"> }) {
	const [open, setOpen] = useState(false);
	const invite = useMutation(api.invitations.mutations.create);

	const roles = useQuery(api.orgRoles.queries.list, { orgId });
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
