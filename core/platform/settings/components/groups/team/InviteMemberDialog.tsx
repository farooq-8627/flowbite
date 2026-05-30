"use client";

import { useMutation } from "convex/react";
import { CheckIcon, Copy, Plus } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import { useEffect, useMemo, useState } from "react";
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
import { Select, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useSettingsForm } from "../../../hooks/useSettingsForm";

type Role = Doc<"orgRoles">;

/**
 * Schema is dynamic — we validate `roleId` against the org's actual role
 * docs, not a hardcoded list. Zod still enforces the email format and the
 * fact that a role was picked.
 */
const inviteSchema = z.object({
	email: z.string().email("Enter a valid email"),
	roleId: z.string().min(1, "Pick a role"),
});

/**
 * `roles` is provided by the parent (MembersSection → TeamGroup) so the
 * same role list is shared across the whole Team tab from a single
 * subscription. See AGENTS.md "Per-row data on a list view comes from
 * one batched query".
 *
 * ROLE LIST
 * ─────────
 * The dropdown shows EVERY role from `orgRoles.list` except `Owner`. This
 * includes the system roles seeded for new orgs (Admin, Member) as well as
 * any custom role the owner has created (Sales Manager, Support, etc.).
 * The default selection is the role flagged `isDefault` on the org —
 * usually Member — so admins inviting a regular teammate just type the
 * email and submit.
 *
 * SUCCESS / SEND ANOTHER FLOW
 * ───────────────────────────
 * After a successful invite, we surface the direct accept URL inline so the
 * inviter can copy/share it. The footer swaps to **Done** + **Send another**.
 *
 * - **Done** closes the dialog (also clears the cached link after a small
 *   delay so the next open starts fresh).
 * - **Send another** is NOT a submit. It clears the success state and resets
 *   the form to empty, then refocuses the email input so the user can type
 *   a new address. This avoids the bug where clicking "Send another" while
 *   the previous email is still in the field re-submits the same email and
 *   hits the duplicate-invitation guard server-side.
 *
 * MOBILE OVERFLOW
 * ───────────────
 * Once the success state appears, the dialog body grows (form + invite-link
 * block + footer). Without a scrollable region, this overflows the viewport
 * on phones. We cap the dialog at `max-h-[85vh]` and make the inner content
 * a `min-h-0 overflow-y-auto` flex column so only the body scrolls — header
 * and footer stay pinned.
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

	// Filter Owner out — Owner is the workspace creator, never invitable.
	// Sort: default role first, then everything else by name.
	const inviteRoles = useMemo(() => {
		const list = (roles ?? []).filter((r) => r.name !== "Owner");
		return list.sort((a, b) => {
			if (a.isDefault && !b.isDefault) return -1;
			if (!a.isDefault && b.isDefault) return 1;
			return a.name.localeCompare(b.name);
		});
	}, [roles]);

	const defaultRoleId = useMemo(() => {
		const def = inviteRoles.find((r) => r.isDefault);
		return def?._id ?? inviteRoles[0]?._id ?? "";
	}, [inviteRoles]);

	const { form, isSubmitting, handleSubmit } = useSettingsForm({
		schema: inviteSchema,
		values: { email: "", roleId: defaultRoleId },
		onSubmit: async (data) => {
			const result = await invite({
				orgId,
				email: data.email,
				roleId: data.roleId as Id<"orgRoles">,
			});
			toast.success(`Invitation sent to ${data.email}`, {
				description:
					"They'll get an email with a link to accept. You can also copy the link below.",
			});
			setLastAcceptUrl(result.acceptUrl);
			// Clear the input so the next "Send another" starts on a blank
			// email. We pass an explicit shape because `useSettingsForm` is
			// driven by the constant `values` prop above and the next render
			// re-syncs them — the reset call here is what wins for the
			// current render frame.
			form.reset({ email: "", roleId: data.roleId });
		},
	});

	// Keep the form's roleId in sync once the prop arrives async — the
	// query may be undefined on first render, so the initial value can be
	// "" until orgRoles loads. Setting it here prevents the "Pick a role"
	// validation from firing on an empty submit when the user hasn't
	// touched the dropdown.
	useEffect(() => {
		if (!form.getValues("roleId") && defaultRoleId) {
			form.setValue("roleId", defaultRoleId);
		}
	}, [defaultRoleId, form]);

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

	// "Send another" — clears the success state and the email field so the
	// user can type a new address. NOT a submit; the user clicks
	// "Send invitation" again after entering the new email.
	const handleSendAnother = () => {
		setLastAcceptUrl(null);
		form.reset({ email: "", roleId: defaultRoleId });
		// Refocus the email input on the next paint.
		queueMicrotask(() => {
			const el = document.querySelector<HTMLInputElement>('input[name="email"]');
			el?.focus();
		});
	};

	return (
		<Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : handleClose())}>
			<DialogTrigger asChild>
				<Button size="sm">
					<Plus className="size-4" />
					Invite member
				</Button>
			</DialogTrigger>
			<DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-lg">
				<DialogHeader className="shrink-0 px-6 pt-5 pb-3">
					<DialogTitle>Invite a new member</DialogTitle>
					<DialogDescription>
						{lastAcceptUrl
							? "Invitation created. Email is on its way — copy the link below if you'd rather share it directly."
							: "They'll get an email with a link to join this workspace."}
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form
						onSubmit={handleSubmit}
						className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden"
					>
						<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-2">
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
								name="roleId"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Role</FormLabel>
										<Select
											onValueChange={field.onChange}
											value={field.value as string}
											disabled={inviteRoles.length === 0}
										>
											<FormControl>
												<SelectTrigger className="w-full">
													<SelectValue placeholder="Select a role" />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{inviteRoles.map((role) => (
													// We use SelectPrimitive.Item directly (not the
													// shared SelectItem) so we can split what gets
													// projected into the trigger from what only
													// renders in the dropdown. ItemText holds just
													// the role NAME — that's what mirrors into the
													// trigger via Radix, keeping it short so the
													// dialog can't overflow when a long description
													// is selected. The description sibling renders
													// only in the dropdown row.
													<SelectPrimitive.Item
														key={role._id}
														value={role._id}
														className="relative flex w-full cursor-default items-center gap-1 rounded-sm py-1.5 pe-8 ps-2 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
													>
														<span
															data-slot="select-item-indicator"
															className="absolute end-2 flex size-3.5 items-center justify-center"
														>
															<SelectPrimitive.ItemIndicator>
																<CheckIcon className="size-4" />
															</SelectPrimitive.ItemIndicator>
														</span>
														<SelectPrimitive.ItemText>
															<span className="font-medium">
																{role.name}
															</span>
														</SelectPrimitive.ItemText>
														{role.description && (
															<span className="text-muted-foreground">
																{" "}
																— {role.description}
															</span>
														)}
													</SelectPrimitive.Item>
												))}
											</SelectContent>
										</Select>
										<FormMessage />
									</FormItem>
								)}
							/>

							{lastAcceptUrl && (
								<div className="space-y-2 rounded-[var(--radius)] border bg-muted/40 p-3">
									<p className="text-muted-foreground text-xs">
										Direct invite link
									</p>
									<div className="flex items-center gap-2">
										<code className="min-w-0 flex-1 truncate rounded-[var(--radius)] border bg-background px-2 py-1 text-xs">
											{lastAcceptUrl}
										</code>
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={handleCopyLink}
											className="shrink-0"
										>
											<Copy className="size-3.5" />
											Copy
										</Button>
									</div>
								</div>
							)}
						</div>

						<DialogFooter className="shrink-0 gap-2 border-t bg-card px-6 py-3 sm:gap-2">
							<Button type="button" variant="outline" size="sm" onClick={handleClose}>
								{lastAcceptUrl ? "Done" : "Cancel"}
							</Button>
							{lastAcceptUrl ? (
								<Button type="button" size="sm" onClick={handleSendAnother}>
									Send another
								</Button>
							) : (
								<Button type="submit" size="sm" disabled={isSubmitting}>
									{isSubmitting ? "Sending…" : "Send invitation"}
								</Button>
							)}
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
