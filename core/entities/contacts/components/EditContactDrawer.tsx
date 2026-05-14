"use client";

/**
 * EditContactDrawer — edit form for an existing contact. Mirrors EditLeadDrawer.
 */

import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import type { Value as RPNValue } from "react-phone-number-input";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { Separator } from "@/components/ui/separator";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { EntityFormDrawer } from "@/core/entities/scaffolds/EntityFormDrawer";
import { CustomFieldsSection } from "@/core/entities/shared/components/CustomFieldsSection";
import { PersonSelect } from "@/core/entities/shared/components/PersonSelect";
import type { PersonRef } from "@/core/entities/shared/types";
import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";

interface EditContactDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	orgId: Id<"orgs"> | undefined;
	contact: Doc<"contacts"> | null;
}

export function EditContactDrawer({ open, onOpenChange, orgId, contact }: EditContactDrawerProps) {
	const labels = useEntityLabels();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [displayName, setDisplayName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [assignee, setAssignee] = useState<PersonRef | null>(null);

	const update = useMutation(api.crm.entities.contacts.mutations.update);

	useEffect(() => {
		if (!open || !contact) return;
		setDisplayName(contact.displayName ?? "");
		setEmail(contact.email ?? "");
		setPhone(contact.phone ?? "");
		setAssignee(
			contact.assignedTo
				? { id: contact.assignedTo as string, type: "user", displayName: "" }
				: null,
		);
	}, [open, contact]);

	const handleSubmit = async () => {
		if (!orgId || !contact || !displayName.trim()) return;
		setIsSubmitting(true);
		try {
			await update({
				orgId,
				contactId: contact._id as Id<"contacts">,
				displayName: displayName.trim(),
				email: email.trim() || undefined,
				phone: phone.trim() || undefined,
				assignedTo: (assignee?.id as Id<"users"> | undefined) ?? undefined,
			});
			toast.success(`${labels.contact.singular} updated`);
			onOpenChange(false);
		} catch (err) {
			toast.error(`Couldn't update ${labels.contact.singular.toLowerCase()}`, {
				description: err instanceof Error ? err.message : undefined,
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<EntityFormDrawer
			open={open}
			onOpenChange={onOpenChange}
			title={`Edit ${labels.contact.singular}`}
			submitLabel="Save"
			onSubmit={handleSubmit}
			isSubmitting={isSubmitting}
			submitDisabled={!displayName.trim()}
		>
			<div className="flex flex-col gap-3">
				<div className="grid grid-cols-[120px_1fr] items-center gap-x-3 gap-y-2">
					<Label className="text-xs">Name *</Label>
					<Input
						value={displayName}
						onChange={(e) => setDisplayName(e.target.value)}
						className="h-8 text-xs"
					/>
					<Label className="text-xs">Email</Label>
					<Input
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						className="h-8 text-xs"
					/>
					<Label className="text-xs">Phone</Label>
					<PhoneInput
						value={phone as RPNValue}
						onChange={(v) => setPhone(v ?? "")}
						defaultCountry="AE"
						international
					/>
					<Label className="text-xs">Assignee</Label>
					<PersonSelect
						scope="user"
						value={assignee}
						onChange={setAssignee}
						orgId={orgId}
						placeholder="Assign to…"
					/>
				</div>
				<Separator />
				<CustomFieldsSection
					orgId={orgId}
					entityType="contacts"
					entityId={contact?._id as string | undefined}
					layout="grid"
				/>
			</div>
		</EntityFormDrawer>
	);
}
