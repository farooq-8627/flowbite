"use client";

/**
 * EditContactDrawer — edit form for an existing contact. Mirrors EditLeadDrawer.
 *
 * All fields come from `fieldDefinitions` via EntityFieldForm. Custom fields
 * write through live; column fields are batched into a single contacts.update
 * call on Save.
 */

import { useQuery } from "convex/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { EntityFormDrawer } from "@/core/entities/scaffolds/EntityFormDrawer";
import {
	EntityFieldForm,
	type EntityFormValues,
} from "@/core/entities/shared/components/EntityFieldForm";
import { useUpdateContact } from "@/core/entities/shared/hooks/useEntityMutations";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { normalizeErrorDescription } from "@/lib/normalizeError";

interface EditContactDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	orgId: Id<"orgs"> | undefined;
	contact: Doc<"contacts"> | null;
}

const EMPTY: EntityFormValues = {
	columnValues: {},
	customValues: {},
	joinValues: {},
	fieldIdByName: {},
};

export function EditContactDrawer({ open, onOpenChange, orgId, contact }: EditContactDrawerProps) {
	const labels = useEntityLabels();
	const [isSubmitting, setIsSubmitting] = useState(false);

	const update = useUpdateContact();
	const customValues = useQuery(
		api.crm.fields.fieldValues.queries.getForEntity,
		orgId && contact?._id
			? { orgId, entityType: "contact", entityId: contact._id as string }
			: "skip",
	);

	const customByName = useRef<Record<string, unknown>>({});
	if (customValues) {
		const next: Record<string, unknown> = {};
		for (const v of customValues) next[v.fieldName] = v.value;
		customByName.current = next;
	}

	const valuesGetterRef = useRef<() => EntityFormValues>(() => EMPTY);

	const handleSubmit = async () => {
		if (!orgId || !contact) return;
		const v = valuesGetterRef.current();
		const col = v.columnValues;
		const displayName = String(col.displayName ?? "").trim();
		if (!displayName) {
			toast.error("Name is required");
			return;
		}
		setIsSubmitting(true);
		try {
			await update({
				orgId,
				contactId: contact._id as Id<"contacts">,
				displayName,
				email: typeof col.email === "string" ? col.email.trim() || undefined : undefined,
				phone: typeof col.phone === "string" ? col.phone.trim() || undefined : undefined,
				assignedTo: col.assignedTo as Id<"users"> | undefined,
			});
			toast.success(`${labels.contact.singular} updated`);
			onOpenChange(false);
		} catch (err) {
			toast.error(`Couldn't update ${labels.contact.singular.toLowerCase()}`, {
				description: normalizeErrorDescription(err),
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
		>
			<EntityFieldForm
				slot="contact"
				orgId={orgId}
				entity={contact as unknown as Record<string, unknown> & { _id: string }}
				customValuesForEntity={customByName.current}
				registerGetValues={(getter) => {
					valuesGetterRef.current = getter;
				}}
			/>
		</EntityFormDrawer>
	);
}
