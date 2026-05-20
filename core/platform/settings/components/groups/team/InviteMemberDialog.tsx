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
			// Clear the input so the next "Send another" starts on a blank
			// email. We pass an explicit shape because `useSettingsForm` is
			// driven by the constant `values` prop above and the next render
			// re-syncs them — the reset call here is what wins for the
			// current render frame.
			form.reset({ email: "", role: data.role });
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

	// "Send another" — clears the success state and the email field so the
	// user can type a new address. NOT a submit; the user clicks
	// "Send invitation" again after entering the new email.
	const handleSendAnother = () => {
		setLastAcceptUrl(null);
		form.reset({ email: "", role: "member" });
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
														<span className="font-medium">
															{role.name}
														</span>
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
