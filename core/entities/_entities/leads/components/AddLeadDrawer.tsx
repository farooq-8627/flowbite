"use client";

/**
 * AddLeadDrawer — form for creating a new lead.
 *
 * Body is rendered by `EntityFieldForm` — all fields (name/email/phone/source/
 * assignee + any user-added custom fields) come from `fieldDefinitions`. Order
 * follows the admin's reorder in Settings → Modules → Lead → Fields.
 *
 * The optional company-link section is preserved as a special after-create
 * workflow because it spans two entity types (creating a company OR attaching
 * to an existing one).
 */

import { useMutation, useQuery } from "convex/react";
import { Building2Icon, PlusIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { EntityFormDrawer } from "@/core/entities/scaffolds/EntityFormDrawer";
import {
	EntityFieldForm,
	type EntityFormValues,
} from "@/core/entities/shared/components/EntityFieldForm";
import { useDedup } from "@/core/entities/shared/hooks/useDedup";
import { FileBufferProvider, useFileBuffer } from "@/core/files/components/CreateModeFileField";
import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";
import { cn } from "@/lib/utils";

interface AddLeadDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	orgId: Id<"orgs"> | undefined;
	onCreate: (data: {
		displayName: string;
		email?: string;
		phone?: string;
		source: string;
		assignedTo?: Id<"users">;
	}) => Promise<unknown>;
}

type CompanyMode = "none" | "existing" | "new";

const EMPTY_VALUES: EntityFormValues = {
	columnValues: {},
	customValues: {},
	joinValues: {},
	fieldIdByName: {},
};

export function AddLeadDrawer({ open, onOpenChange, orgId, onCreate }: AddLeadDrawerProps) {
	const labels = useEntityLabels();
	const { duplicates, handleError, clearDuplicates } = useDedup();
	const [isSubmitting, setIsSubmitting] = useState(false);

	const [companyMode, setCompanyMode] = useState<CompanyMode>("none");
	const [existingCompanyId, setExistingCompanyId] = useState<Id<"companies"> | "">("");
	const [newCompanyName, setNewCompanyName] = useState("");
	const [newCompanyIndustry, setNewCompanyIndustry] = useState("");
	const [newCompanyWebsite, setNewCompanyWebsite] = useState("");

	// Holder for the form-values getter (registered by EntityFieldForm).
	const valuesGetterRef = useRef<() => EntityFormValues>(() => EMPTY_VALUES);
	const fileBuffer = useFileBuffer(orgId);

	const createCompany = useMutation(api.crm.entities.companies.mutations.create);
	const addPersonToCompany = useMutation(api.crm.entities.companies.mutations.addPerson);
	const bulkSetCustom = useMutation(api.crm.fields.fieldValues.mutations.bulkSet);
	const tagsByOrg = useQuery(api.crm.shared.tags.queries.listByOrg, orgId ? { orgId } : "skip");
	const createTag = useMutation(api.crm.shared.tags.mutations.create);
	const attachTag = useMutation(api.crm.shared.tags.mutations.attachToEntity);

	const companies = useQuery(
		api.crm.entities.companies.queries.list,
		orgId && companyMode === "existing" ? { orgId } : "skip",
	);

	const reset = () => {
		setCompanyMode("none");
		setExistingCompanyId("");
		setNewCompanyName("");
		setNewCompanyIndustry("");
		setNewCompanyWebsite("");
		clearDuplicates();
		valuesGetterRef.current = () => EMPTY_VALUES;
		fileBuffer.reset();
	};

	const handleSubmit = async () => {
		const values = valuesGetterRef.current();
		const col = values.columnValues;
		const displayName = String(col.displayName ?? "").trim();
		if (!displayName) {
			toast.error("Name is required");
			return;
		}
		setIsSubmitting(true);

		try {
			// Step 1 — create the lead row
			const created = (await onCreate({
				displayName,
				email: typeof col.email === "string" ? col.email.trim() || undefined : undefined,
				phone: typeof col.phone === "string" ? col.phone.trim() || undefined : undefined,
				source: typeof col.source === "string" && col.source ? col.source : "manual",
				assignedTo: col.assignedTo as Id<"users"> | undefined,
			})) as { leadId?: Id<"leads">; personCode?: string } | undefined;

			const leadId = created?.leadId;
			const personCode = created?.personCode;

			// Step 2 — link company by personCode
			if (orgId && personCode) {
				if (companyMode === "new" && newCompanyName.trim()) {
					try {
						await createCompany({
							orgId,
							name: newCompanyName.trim(),
							industry: newCompanyIndustry.trim() || undefined,
							website: newCompanyWebsite.trim() || undefined,
							personCodes: [personCode],
						});
					} catch (err) {
						toast.error("Couldn't create company", {
							description: err instanceof Error ? err.message : undefined,
						});
					}
				} else if (companyMode === "existing" && existingCompanyId) {
					try {
						await addPersonToCompany({
							orgId,
							companyId: existingCompanyId,
							personCode,
						});
					} catch (err) {
						toast.error("Couldn't attach to company", {
							description: err instanceof Error ? err.message : undefined,
						});
					}
				}
			}

			// Step 3 — bulkSet custom field values atomically using the field-id
			// map exposed by EntityFieldForm. No extra round-trip.
			const customEntries = Object.entries(values.customValues).filter(
				([, v]) => v !== undefined && v !== null && v !== "",
			);
			if (orgId && leadId && customEntries.length > 0) {
				try {
					const payload = customEntries
						.map(([name, value]) => {
							const fid = values.fieldIdByName[name];
							return fid ? { fieldId: fid, value } : null;
						})
						.filter(
							(x): x is { fieldId: Id<"fieldDefinitions">; value: unknown } =>
								x !== null,
						);
					if (payload.length > 0) {
						await bulkSetCustom({
							orgId,
							entityType: "lead",
							entityId: leadId as string,
							values: payload,
						});
					}
				} catch (err) {
					toast.error("Couldn't save custom fields", {
						description: err instanceof Error ? err.message : undefined,
					});
				}
			}

			// Step 3b — attach buffered tags. The tags input is a "join" field,
			// so the user picks tag NAMES in the form and we wire the actual
			// entityTags rows here (after we have a leadId to point them at).
			if (orgId && leadId && values.joinValues.tags) {
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
						for (const name of tagNames) {
							let tagId = existingByName.get(name.toLowerCase());
							if (!tagId) {
								tagId = await createTag({ orgId, name });
							}
							if (tagId) {
								await attachTag({
									orgId,
									tagId,
									entityType: "lead",
									entityId: leadId as string,
								});
							}
						}
					} catch (err) {
						toast.error("Couldn't attach tags", {
							description: err instanceof Error ? err.message : undefined,
						});
					}
				}
			}

			// Step 4 — flush any buffered file uploads. Files attach to the
			// person scope (personCode) so they show up in the lead's profile +
			// in any deal/company that references this person via a tag.
			if (orgId && personCode) {
				try {
					await fileBuffer.commitAll({ scope: "person", scopeId: personCode });
				} catch {
					// commitAll surfaces individual toasts; ignore aggregate failure.
				}
			}

			reset();
			onOpenChange(false);
		} catch (err) {
			if (!handleError(err)) {
				setIsSubmitting(false);
				throw err;
			}
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<EntityFormDrawer
			open={open}
			onOpenChange={(v) => {
				if (!v) reset();
				onOpenChange(v);
			}}
			title={`Add ${labels.lead.singular}`}
			submitLabel="Create"
			onSubmit={handleSubmit}
			isSubmitting={isSubmitting}
			submitDisabled={
				(companyMode === "existing" && !existingCompanyId) ||
				(companyMode === "new" && !newCompanyName.trim())
			}
			duplicates={duplicates}
			onDismissDuplicates={clearDuplicates}
		>
			<FileBufferProvider value={fileBuffer}>
				<div className="flex flex-col gap-3">
					{/* All built-in + custom fields, dynamically generated and ordered. */}
					<EntityFieldForm
						slot="lead"
						orgId={orgId}
						registerGetValues={(getter) => {
							valuesGetterRef.current = getter;
						}}
					/>

					<Separator />

					{/* Optional company link */}
					<div className="space-y-2 rounded-[var(--radius)] border bg-muted/20 p-3">
						<div className="flex items-center gap-2">
							<Building2Icon className="size-3.5 text-muted-foreground" />
							<Label className="text-xs font-medium">
								Works at a {labels.company.singular.toLowerCase()}?
							</Label>
							<span className="text-[10px] text-muted-foreground">(optional)</span>
						</div>
						<div className="flex gap-1">
							{(["none", "existing", "new"] as const).map((mode) => (
								<Button
									key={mode}
									type="button"
									size="sm"
									variant={companyMode === mode ? "default" : "outline"}
									className={cn(
										"h-6 flex-1 px-2 text-[10px] capitalize",
										companyMode === mode && "shadow-xs",
									)}
									onClick={() => setCompanyMode(mode)}
								>
									{mode === "none"
										? "Skip"
										: mode === "existing"
											? "Existing"
											: "New"}
								</Button>
							))}
						</div>

						{companyMode === "existing" && (
							<div className="flex flex-col gap-1.5 pt-1">
								<Label className="text-xs">{labels.company.singular}</Label>
								<Select
									value={existingCompanyId || undefined}
									onValueChange={(v) =>
										setExistingCompanyId(v as Id<"companies">)
									}
								>
									<SelectTrigger className="h-9 w-full text-sm">
										<SelectValue
											placeholder={`Search ${labels.company.plural.toLowerCase()}…`}
										/>
									</SelectTrigger>
									<SelectContent>
										{(companies ?? []).map((c) => (
											<SelectItem key={c._id} value={c._id}>
												{c.name}
											</SelectItem>
										))}
										{(!companies || companies.length === 0) && (
											<div className="px-2 py-1.5 text-xs text-muted-foreground">
												No {labels.company.plural.toLowerCase()} yet.
											</div>
										)}
									</SelectContent>
								</Select>
							</div>
						)}

						{companyMode === "new" && (
							<div className="flex flex-col gap-2.5 pt-1">
								<div className="flex flex-col gap-1.5">
									<Label className="text-xs">Name *</Label>
									<Input
										value={newCompanyName}
										onChange={(e) => setNewCompanyName(e.target.value)}
										placeholder={`${labels.company.singular} name`}
										className="h-9 w-full text-sm"
									/>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label className="text-xs">Industry</Label>
									<Input
										value={newCompanyIndustry}
										onChange={(e) => setNewCompanyIndustry(e.target.value)}
										placeholder="Industry"
										className="h-9 w-full text-sm"
									/>
								</div>
								<div className="flex flex-col gap-1.5">
									<Label className="text-xs">Website</Label>
									<Input
										value={newCompanyWebsite}
										onChange={(e) => setNewCompanyWebsite(e.target.value)}
										placeholder="https://…"
										className="h-9 w-full text-sm"
									/>
								</div>
								<div className="text-[10px] text-muted-foreground">
									<PlusIcon className="me-1 inline size-2.5" />
									Will be created and linked to this{" "}
									{labels.lead.singular.toLowerCase()}.
								</div>
							</div>
						)}
					</div>
				</div>
			</FileBufferProvider>
		</EntityFormDrawer>
	);
}

/** Reset helper exported for tests. */
const EMPTY_VALUES_GETTER = (): EntityFormValues => EMPTY_VALUES;
void EMPTY_VALUES_GETTER;
