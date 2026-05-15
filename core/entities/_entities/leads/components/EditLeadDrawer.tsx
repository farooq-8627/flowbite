"use client";

/**
 * EditLeadDrawer — edit form for an existing lead.
 *
 * Body is driven by `EntityFieldForm`. In edit mode the form writes through
 * each fieldValues change immediately; we batch the column changes (name,
 * email, phone, status, source, assignedTo) into a single `leads.update`
 * call on Save. Custom fields are persisted live as the user types.
 */

import { useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { EntityFormDrawer } from "@/core/entities/scaffolds/EntityFormDrawer";
import {
	EntityFieldForm,
	type EntityFormValues,
} from "@/core/entities/shared/components/EntityFieldForm";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";

interface EditLeadDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	orgId: Id<"orgs"> | undefined;
	lead: Doc<"leads"> | null;
}

const EMPTY: EntityFormValues = {
	columnValues: {},
	customValues: {},
	joinValues: {},
	fieldIdByName: {},
};

export function EditLeadDrawer({ open, onOpenChange, orgId, lead }: EditLeadDrawerProps) {
	const labels = useEntityLabels();
	const [isSubmitting, setIsSubmitting] = useState(false);

	const update = useMutation(api.crm.entities.leads.mutations.update);
	const customValues = useQuery(
		api.crm.fields.fieldValues.queries.getForEntity,
		orgId && lead?._id ? { orgId, entityType: "lead", entityId: lead._id as string } : "skip",
	);

	// Materialise custom field values keyed by field NAME (EntityFieldForm wants
	// names, not ids).
	const customByName = useRef<Record<string, unknown>>({});
	if (customValues) {
		const next: Record<string, unknown> = {};
		for (const v of customValues) next[v.fieldName] = v.value;
		customByName.current = next;
	}

	const valuesGetterRef = useRef<() => EntityFormValues>(() => EMPTY);

	const handleSubmit = async () => {
		if (!orgId || !lead) return;
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
				leadId: lead._id as Id<"leads">,
				displayName,
				email: typeof col.email === "string" ? col.email.trim() || undefined : undefined,
				phone: typeof col.phone === "string" ? col.phone.trim() || undefined : undefined,
				source: typeof col.source === "string" && col.source ? col.source : "manual",
				status: typeof col.status === "string" && col.status ? col.status : "new",
				assignedTo: col.assignedTo as Id<"users"> | undefined,
			});
			toast.success(`${labels.lead.singular} updated`);
			onOpenChange(false);
		} catch (err) {
			toast.error(`Couldn't update ${labels.lead.singular.toLowerCase()}`, {
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
			title={`Edit ${labels.lead.singular}`}
			submitLabel="Save"
			onSubmit={handleSubmit}
			isSubmitting={isSubmitting}
		>
			<EntityFieldForm
				slot="lead"
				orgId={orgId}
				entity={lead as unknown as Record<string, unknown> & { _id: string }}
				customValuesForEntity={customByName.current}
				registerGetValues={(getter) => {
					valuesGetterRef.current = getter;
				}}
			/>
		</EntityFormDrawer>
	);
}
