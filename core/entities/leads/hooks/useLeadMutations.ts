"use client";

/**
 * useLeadMutations — wraps lead create/update/convert/delete mutations with toast.
 *
 * `convert` returns the full mutation result (`{ contactId, personCode }`) so
 * callers like ConvertLeadDrawer can chain deal creation against the new
 * contact. The per-lead toast is suppressed for convert when `silent=true`,
 * letting the caller render a single combined toast for bulk flows.
 */

import { useMutation } from "convex/react";
import { useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export function useLeadMutations(orgId: Id<"orgs"> | undefined) {
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
			const result = await createLead({ orgId, ...data });
			toast.success("Lead created", {
				description: `${data.displayName} (${result.personCode})`,
			});
			return result;
		},
		[orgId, createLead],
	);

	const convert = useCallback(
		async (leadId: Id<"leads">, companyId?: Id<"companies">) => {
			if (!orgId) return undefined;
			const result = await convertLead({ orgId, leadId, companyId });
			return result; // { contactId, personCode } — caller handles toast
		},
		[orgId, convertLead],
	);

	const remove = useCallback(
		async (leadId: Id<"leads">) => {
			if (!orgId) return;
			await deleteLead({ orgId, leadId });
			toast.success("Lead deleted");
		},
		[orgId, deleteLead],
	);

	return { create, update: updateLead, convert, remove };
}
