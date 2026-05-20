"use client";

import { useMutation } from "convex/react";
import { useCallback } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { EntityFormValues } from "@/core/entities/shared/components/EntityFieldForm";
import { useUpdateDeal } from "@/core/entities/shared/hooks/useEntityMutations";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";

interface FileBuffer {
	commitAll: (args: { scope: string; scopeId: string; tags?: string[] }) => Promise<void>;
}

interface SaveArgs {
	/** Existing deal id (edit mode). Omit for create mode. */
	dealId?: Id<"deals">;
	/** Deal code needed for file commit scope. */
	dealCode?: string;
	/** Person code — used to tag files so they show on the person profile. */
	personCode?: string;
	formValues: EntityFormValues;
	fileBuffer?: FileBuffer;
	/** Pass true on create — skips column-field update (deal not created yet). */
	isCreate?: boolean;
}

/**
 * Shared deal form submit logic — used by AddDealDrawer and EditDealDrawer.
 * Handles:
 *   1. deals.update for column fields (edit mode only)
 *   2. fieldValues.bulkSet for custom fields
 *   3. fileBuffer.commitAll for file uploads
 */
export function useDealFormSubmit(orgId: Id<"orgs"> | undefined) {
	const labels = useEntityLabels();
	const update = useUpdateDeal();
	const bulkSetCustom = useMutation(api.crm.fields.fieldValues.mutations.bulkSet);

	return useCallback(
		async ({
			dealId,
			dealCode,
			personCode,
			formValues,
			fileBuffer,
			isCreate = false,
		}: SaveArgs) => {
			const { columnValues: col, customValues, fieldIdByName } = formValues;

			// 1. Column fields — only in edit mode (create caller persists them directly)
			if (!isCreate && dealId) {
				const titleFromForm = String(col.title ?? "").trim();
				await update({
					orgId: orgId!,
					dealId,
					title: titleFromForm || undefined,
					value:
						typeof col.value === "number"
							? col.value
							: typeof col.value === "string" && col.value
								? Number(col.value)
								: undefined,
					currency: typeof col.currency === "string" ? col.currency : undefined,
					assignedTo: col.assignedTo as Id<"users"> | undefined,
					expectedCloseDate:
						typeof col.expectedCloseDate === "number"
							? col.expectedCloseDate
							: undefined,
				});
			}

			// 2. Custom fields
			if (dealId) {
				const payload = Object.entries(customValues)
					.filter(([, v]) => v !== undefined && v !== null && v !== "")
					.map(([name, value]) => {
						const fid = fieldIdByName[name];
						return fid ? { fieldId: fid, value } : null;
					})
					.filter((x): x is { fieldId: Id<"fieldDefinitions">; value: unknown } => x !== null);

				if (payload.length > 0) {
					try {
						await bulkSetCustom({
							orgId: orgId!,
							entityType: "deal",
							entityId: dealId as string,
							values: payload,
						});
					} catch (err) {
						toast.error("Couldn't save some custom fields", {
							description: err instanceof Error ? err.message : undefined,
						});
					}
				}
			}

			// 3. Files
			if (fileBuffer && dealCode) {
				try {
					await fileBuffer.commitAll({
						scope: "deal",
						scopeId: dealCode,
						tags: personCode ? [`person:${personCode}`] : undefined,
					});
				} catch {
					// commitAll surfaces individual toasts
				}
			}

			if (!isCreate) {
				toast.success(`${labels.deal.singular} updated`);
			} else {
				toast.success(`${labels.deal.singular} created`);
			}
		},
		[orgId, update, bulkSetCustom, labels.deal.singular],
	);
}
