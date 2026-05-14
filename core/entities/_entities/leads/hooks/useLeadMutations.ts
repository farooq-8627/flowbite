"use client";

/**
 * useLeadMutations — wraps lead create/update/convert/delete mutations with
 * label-aware toasts.
 *
 * - Labels: toasts use `useEntityLabels()` so a renamed entity ("Inquiry")
 *   shows the right word everywhere.
 * - Errors: we surface the real ConvexError / Error message in the toast
 *   description so phone-parsing / validation failures stop being silent.
 */

import { useMutation } from "convex/react";
import { useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";

function describeError(err: unknown): string | undefined {
	if (!err) return undefined;
	if (err instanceof Error) return err.message;
	if (typeof err === "object" && err !== null) {
		const maybe = err as { data?: { message?: string }; message?: string };
		return maybe.data?.message ?? maybe.message;
	}
	return String(err);
}

export function useLeadMutations(orgId: Id<"orgs"> | undefined) {
	const labels = useEntityLabels();
	const createLead = useMutation(api.crm.entities.leads.mutations.create);
	const updateLead = useMutation(api.crm.entities.leads.mutations.update);
	const convertLead = useMutation(api.crm.entities.leads.mutations.convertToContact);
	const deleteLead = useMutation(api.crm.entities.leads.mutations.softDelete);

	const create = useCallback(
		async (data: {
			displayName: string;
			email?: string;
			phone?: string;
			source: string;
			assignedTo?: Id<"users">;
		}) => {
			if (!orgId) return;
			try {
				const result = await createLead({ orgId, ...data });
				toast.success(`${labels.lead.singular} created`, {
					description: `${data.displayName} (${result.personCode})`,
				});
				return result;
			} catch (err) {
				const description = describeError(err);
				toast.error(`Couldn't create ${labels.lead.singular.toLowerCase()}`, {
					description,
				});
				// Rethrow so the form's submit handler can short-circuit.
				throw err;
			}
		},
		[orgId, createLead, labels.lead.singular],
	);

	const convert = useCallback(
		async (leadId: Id<"leads">, companyId?: Id<"companies">) => {
			if (!orgId) return undefined;
			try {
				return await convertLead({ orgId, leadId, companyId });
			} catch (err) {
				toast.error(
					`Couldn't convert ${labels.lead.singular.toLowerCase()} to ${labels.contact.singular.toLowerCase()}`,
					{ description: describeError(err) },
				);
				throw err;
			}
		},
		[orgId, convertLead, labels.lead.singular, labels.contact.singular],
	);

	const remove = useCallback(
		async (leadId: Id<"leads">) => {
			if (!orgId) return;
			try {
				await deleteLead({ orgId, leadId });
				toast.success(`${labels.lead.singular} deleted`);
			} catch (err) {
				toast.error(`Couldn't delete ${labels.lead.singular.toLowerCase()}`, {
					description: describeError(err),
				});
				throw err;
			}
		},
		[orgId, deleteLead, labels.lead.singular],
	);

	return { create, update: updateLead, convert, remove };
}
