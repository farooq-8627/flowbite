"use client";

/**
 * CompanyDrawer — unified add + edit form for companies.
 *
 * REDESIGN (2026-05-21):
 *   - Body is rendered by `EntityFieldForm slot="company"` — all fields (name,
 *     industry, website, assignee, tags + any user-added custom fields) come
 *     from `fieldDefinitions`. Order follows the admin's reorder in
 *     Settings → Modules → Company → Fields. Mirrors the AddDealDrawer
 *     pattern so all entity forms behave identically.
 *   - The `personCodes[]` "who works at this company" join is preserved as a
 *     special section because it's a company-only n:m link that doesn't fit
 *     the standard column/fieldValues/join field model. The MultiSelect
 *     remains, but only for People — assignees are handled via the dynamic
 *     `assignedTo` field which is single-assignee.
 *   - Files are rendered after the dynamic form using the file buffer like
 *     the deals form does (commits after company create with companyCode as
 *     the scopeId).
 *
 * SCHEMA NOTES:
 *   - `assignees[]` (multi) was used by the legacy hardcoded form. The
 *     dynamic form uses single `assignedTo` (the seeded "assignee" field is
 *     single-relation). When the user picks an assignee we set both
 *     `assignedTo` AND `assignees: [assignedTo]` so the multi-assignee badge
 *     code paths still work.
 *   - `personCodes[]` is the canonical "who works at this company" join.
 */

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
	FileBufferProvider,
	useFileBuffer,
} from "@/core/data-io/files/components/CreateModeFileField";
import {
	EntityFieldForm,
	type EntityFormValues,
} from "@/core/entities/shared/components/EntityFieldForm";
import { FormDrawer } from "@/core/entities/shared/components/FormDrawer";
import { useUpdateCompany } from "@/core/entities/shared/hooks/useEntityMutations";
import { useOrgTags } from "@/core/entities/shared/hooks/useOrgTags";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { normalizeErrorDescription } from "@/lib/normalizeError";

type Mode = "add" | "edit";

interface CompanyDrawerProps {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	orgId: Id<"orgs"> | undefined;
	mode: Mode;
	/** In edit mode, the company being edited. */
	company?: Doc<"companies"> | null;
}

interface PersonOption extends MultiSelectOption {
	personCode: string;
}

const EMPTY_VALUES: EntityFormValues = {
	columnValues: {},
	customValues: {},
	joinValues: {},
	fieldIdByName: {},
};

export function CompanyDrawer({ open, onOpenChange, orgId, mode, company }: CompanyDrawerProps) {
	const labels = useEntityLabels();

	const [personCodes, setPersonCodes] = useState<string[]>([]);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const create = useMutation(api.crm.entities.companies.mutations.create);
	const update = useUpdateCompany();
	const bulkSetCustom = useMutation(api.crm.fields.fieldValues.mutations.bulkSet);

	// Shared tag subscription for the buffered tag picker (so we can resolve
	// tag names → tagIds at submit time).
	const tagsByOrg = useOrgTags(orgId);
	const createTag = useMutation(api.crm.shared.tags.mutations.create);
	const attachTag = useMutation(api.crm.shared.tags.mutations.attachToEntity);

	// Buffered file uploads — committed under scope="company"/scopeId=companyCode
	// after the row is written. Same wiring as AddDealDrawer / AddLeadDrawer.
	const fileBuffer = useFileBuffer(orgId);
	const { reset: resetFileBuffer } = fileBuffer;

	const availablePersons = useQuery(
		api.crm.entities.companies.queries.listPersonsWithoutCompany,
		orgId ? { orgId } : "skip",
	);

	// Holder for the form-values getter (registered by EntityFieldForm).
	const valuesGetterRef = useRef<() => EntityFormValues>(() => EMPTY_VALUES);

	// Reset state when the drawer opens / closes / switches to a different
	// company. EntityFieldForm handles its own column/custom value sync from
	// the `entity` prop — we only manage the company-specific personCodes
	// section here.
	useEffect(() => {
		if (!open) return;
		resetFileBuffer();
		if (mode === "edit" && company) {
			setPersonCodes((company.personCodes ?? []).slice());
		} else {
			setPersonCodes([]);
		}
	}, [open, mode, company, resetFileBuffer]);

	const handleSubmit = async () => {
		if (!orgId) return;
		const values = valuesGetterRef.current();
		const col = values.columnValues;
		const name = String(col.name ?? company?.name ?? "").trim();
		if (!name) {
			toast.error("Name is required");
			return;
		}
		setIsSubmitting(true);

		try {
			let entityId: Id<"companies"> | undefined;
			let scopeId: string | undefined;

			if (mode === "add") {
				const created = await create({
					orgId,
					name,
					industry:
						typeof col.industry === "string" && col.industry.trim()
							? col.industry.trim()
							: undefined,
					website:
						typeof col.website === "string" && col.website.trim()
							? col.website.trim()
							: undefined,
					assignedTo: col.assignedTo as Id<"users"> | undefined,
					assignees: col.assignedTo
						? ([col.assignedTo] as unknown as Id<"users">[])
						: undefined,
					personCodes: personCodes.length ? personCodes : undefined,
				});
				entityId = (created as { companyId?: Id<"companies"> } | undefined)?.companyId;
				scopeId = (created as { companyCode?: string } | undefined)?.companyCode;
				toast.success(`${labels.company.singular} created`);
			} else if (mode === "edit" && company) {
				await update({
					orgId,
					companyId: company._id as Id<"companies">,
					name,
					industry:
						typeof col.industry === "string" && col.industry.trim()
							? col.industry.trim()
							: undefined,
					website:
						typeof col.website === "string" && col.website.trim()
							? col.website.trim()
							: undefined,
					assignedTo: col.assignedTo as Id<"users"> | undefined,
					assignees: col.assignedTo
						? ([col.assignedTo] as unknown as Id<"users">[])
						: undefined,
					personCodes,
				});
				entityId = company._id as Id<"companies">;
				scopeId = company.companyCode;
				toast.success(`${labels.company.singular} updated`);
			}

			// Persist any custom fieldValues using the field-id map exposed by
			// EntityFieldForm.
			const customEntries = Object.entries(values.customValues).filter(
				([, v]) => v !== undefined && v !== null && v !== "",
			);
			if (entityId && customEntries.length > 0) {
				try {
					const payload = customEntries
						.map(([fieldName, value]) => {
							const fid = values.fieldIdByName[fieldName];
							return fid ? { fieldId: fid, value } : null;
						})
						.filter(
							(x): x is { fieldId: Id<"fieldDefinitions">; value: unknown } =>
								x !== null,
						);
					if (payload.length > 0) {
						await bulkSetCustom({
							orgId,
							entityType: "company",
							entityId: entityId as string,
							values: payload,
						});
					}
				} catch (err) {
					toast.error("Couldn't save custom fields", {
						description: normalizeErrorDescription(err),
					});
				}
			}

			// Buffered tags (create mode only — edit mode uses TagsCell directly).
			if (mode === "add" && entityId && values.joinValues.tags) {
				const tagBuf = values.joinValues.tags;
				const tagNames = (
					Array.isArray(tagBuf)
						? (tagBuf as unknown[]).filter(
								(t): t is string => typeof t === "string" && t.trim().length > 0,
							)
						: typeof tagBuf === "string" && tagBuf.trim()
							? [tagBuf]
							: []
				).map((s) => s.trim());
				if (tagNames.length > 0) {
					try {
						const existingByName = new Map(
							(tagsByOrg ?? []).map((t) => [t.name.toLowerCase(), t._id] as const),
						);
						for (const tagName of tagNames) {
							let tagId = existingByName.get(tagName.toLowerCase());
							if (!tagId) {
								tagId = await createTag({ orgId, name: tagName });
							}
							if (tagId) {
								await attachTag({
									orgId,
									tagId,
									entityType: "company",
									entityId: entityId as string,
								});
							}
						}
					} catch (err) {
						toast.error("Couldn't attach tags", {
							description: normalizeErrorDescription(err),
						});
					}
				}
			}

			// Flush buffered file uploads to the company scope.
			if (scopeId) {
				try {
					await fileBuffer.commitAll({ scope: "company", scopeId });
				} catch {
					// commitAll surfaces individual toasts.
				}
			}

			onOpenChange(false);
		} catch (err) {
			toast.error(
				`Couldn't ${mode === "add" ? "create" : "update"} ${labels.company.singular.toLowerCase()}`,
				{ description: normalizeErrorDescription(err) },
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	// Person picker options — include any already-selected codes that are no
	// longer in `listPersonsWithoutCompany` (already attached to a company).
	const personOptions: PersonOption[] = useMemo(() => {
		const base = (availablePersons ?? []).map((p) => ({
			value: p.personCode,
			label: p.displayName,
			subtitle: p.email,
			personCode: p.personCode,
		}));
		const known = new Set(base.map((o) => o.value));
		const synth = personCodes
			.filter((pc) => !known.has(pc))
			.map((pc) => ({
				value: pc,
				label: pc,
				subtitle: undefined,
				personCode: pc,
			}));
		return [...base, ...synth];
	}, [availablePersons, personCodes]);

	return (
		<FormDrawer
			open={open}
			onOpenChange={onOpenChange}
			title={
				mode === "add"
					? `Add ${labels.company.singular}`
					: `Edit ${labels.company.singular}`
			}
			onSubmit={handleSubmit}
			isSubmitting={isSubmitting}
			submitLabel={mode === "add" ? "Create" : "Save"}
		>
			<FileBufferProvider value={fileBuffer}>
				<div className="flex flex-col gap-4">
					{/* Dynamic fields from `fieldDefinitions` for slot=company.
					    Order follows Settings → Modules → Company → Fields. */}
					<EntityFieldForm
						slot="company"
						orgId={orgId}
						entity={mode === "edit" ? (company ?? undefined) : undefined}
						registerGetValues={(getter) => {
							valuesGetterRef.current = getter;
						}}
					/>

					{/* People — company-specific n:m relationship. */}
					<section className="flex flex-col gap-2.5">
						<div className="flex items-center gap-2">
							<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
								People
							</span>
							<div className="h-px flex-1 bg-border" />
						</div>
						<div className="flex flex-col gap-1">
							<Label className="text-[11px] font-medium leading-none">
								Works at this {labels.company.singular.toLowerCase()}
							</Label>
							<MultiSelect<PersonOption>
								value={personCodes}
								onChange={setPersonCodes}
								options={personOptions}
								placeholder={`Add ${labels.contact.plural.toLowerCase()} / ${labels.lead.plural.toLowerCase()}…`}
								searchPlaceholder="Search by name or code…"
								emptyText="No people without a company."
								renderRow={(opt) => (
									<>
										<span className="inline-flex h-5 shrink-0 items-center rounded-[calc(var(--radius)-2px)] bg-primary/10 px-1.5 text-[9px] font-mono text-primary">
											{opt.personCode}
										</span>
										<div className="flex min-w-0 flex-col leading-tight">
											<span className="truncate text-sm">{opt.label}</span>
											{opt.subtitle && (
												<span className="truncate text-[11px] text-muted-foreground">
													{opt.subtitle}
												</span>
											)}
										</div>
									</>
								)}
							/>
						</div>
					</section>
				</div>
			</FileBufferProvider>
		</FormDrawer>
	);
}
