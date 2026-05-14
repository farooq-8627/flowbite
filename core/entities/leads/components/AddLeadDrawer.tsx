"use client";

/**
 * AddLeadDrawer — form for creating a new lead.
 *
 * Layout: two-column rows (label-left / field-right) per the user's spec —
 * makes the form much denser and easier to scan than stacked labels.
 *
 * Sections:
 *   1. Built-in fields (name, email, phone, source, assignee).
 *   2. Custom fields — any user-defined fieldDefinitions for "leads".
 *   3. Optional "Works at" company link (skip / existing / new). When a new
 *      company is created or an existing one is picked, the lead's personCode
 *      is appended to that company's `personCodes[]` after the lead is saved.
 */

import { useMutation, useQuery } from "convex/react";
import { Building2Icon, PlusIcon } from "lucide-react";
import { useRef, useState } from "react";
import type { Value as RPNValue } from "react-phone-number-input";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
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
import { CustomFieldsSection } from "@/core/entities/shared/components/CustomFieldsSection";
import { PersonSelect } from "@/core/entities/shared/components/PersonSelect";
import { LEAD_SOURCES } from "@/core/entities/shared/config/defaults";
import { useDedup } from "@/core/entities/shared/hooks/useDedup";
import type { PersonRef } from "@/core/entities/shared/types";
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

export function AddLeadDrawer({ open, onOpenChange, orgId, onCreate }: AddLeadDrawerProps) {
	const labels = useEntityLabels();
	const { duplicates, handleError, clearDuplicates } = useDedup();
	const [isSubmitting, setIsSubmitting] = useState(false);

	const [displayName, setDisplayName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [source, setSource] = useState("manual");
	const [assignee, setAssignee] = useState<PersonRef | null>(null);

	const [companyMode, setCompanyMode] = useState<CompanyMode>("none");
	const [existingCompanyId, setExistingCompanyId] = useState<Id<"companies"> | "">("");
	const [newCompanyName, setNewCompanyName] = useState("");
	const [newCompanyIndustry, setNewCompanyIndustry] = useState("");
	const [newCompanyWebsite, setNewCompanyWebsite] = useState("");

	// Holder for the custom-field getter so we can read values on submit.
	const customGetterRef = useRef<() => Array<{ fieldId: string; value: unknown }>>(() => []);

	const createCompany = useMutation(api.crm.entities.companies.mutations.create);
	const addPersonToCompany = useMutation(api.crm.entities.companies.mutations.addPerson);
	const bulkSetCustom = useMutation(api.crm.fields.fieldValues.mutations.bulkSet);

	const companies = useQuery(
		api.crm.entities.companies.queries.list,
		orgId && companyMode === "existing" ? { orgId } : "skip",
	);

	const reset = () => {
		setDisplayName("");
		setEmail("");
		setPhone("");
		setSource("manual");
		setAssignee(null);
		setCompanyMode("none");
		setExistingCompanyId("");
		setNewCompanyName("");
		setNewCompanyIndustry("");
		setNewCompanyWebsite("");
		clearDuplicates();
	};

	const handleSubmit = async () => {
		if (!displayName.trim()) return;
		setIsSubmitting(true);

		try {
			// Step 1 — create the lead. We get back a `{ leadId, personCode }`
			// per the leads.create return type. The parent `onCreate` is the
			// project's existing wrapper; it returns whatever that mutation does.
			const created = (await onCreate({
				displayName: displayName.trim(),
				email: email.trim() || undefined,
				phone: phone.trim() || undefined,
				source,
				assignedTo: assignee?.id as Id<"users"> | undefined,
			})) as { leadId?: Id<"leads">; personCode?: string } | undefined;

			const leadId = created?.leadId;
			const personCode = created?.personCode;

			// Step 2 — link company (if any) by personCode.
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

			// Step 3 — persist any custom-field values entered in the form.
			const customValues = customGetterRef.current();
			if (orgId && leadId && customValues.length > 0) {
				try {
					await bulkSetCustom({
						orgId,
						entityType: "leads",
						entityId: leadId as string,
						values: customValues
							.filter((v) => v.value !== undefined && v.value !== "")
							.map((v) => ({
								fieldId: v.fieldId as Id<"fieldDefinitions">,
								value: v.value,
							})),
					});
				} catch (err) {
					toast.error("Couldn't save custom fields", {
						description: err instanceof Error ? err.message : undefined,
					});
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
				!displayName.trim() ||
				(companyMode === "existing" && !existingCompanyId) ||
				(companyMode === "new" && !newCompanyName.trim())
			}
			duplicates={duplicates}
			onDismissDuplicates={clearDuplicates}
		>
			<div className="flex flex-col gap-3">
				{/* Built-in fields — two-column label/field grid */}
				<div className="grid grid-cols-[120px_1fr] items-center gap-x-3 gap-y-2">
					<Label htmlFor="lead-name" className="text-xs">
						Name *
					</Label>
					<Input
						id="lead-name"
						value={displayName}
						onChange={(e) => setDisplayName(e.target.value)}
						placeholder="Full name"
						autoFocus
						className="h-8 text-xs"
					/>
					<Label htmlFor="lead-email" className="text-xs">
						Email
					</Label>
					<Input
						id="lead-email"
						type="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						placeholder="email@example.com"
						className="h-8 text-xs"
					/>
					<Label htmlFor="lead-phone" className="text-xs">
						Phone
					</Label>
					<PhoneInput
						id="lead-phone"
						value={phone as RPNValue}
						onChange={(v) => setPhone(v ?? "")}
						defaultCountry="AE"
						placeholder="50 000 0000"
						international
					/>
					<Label className="text-xs">Source</Label>
					<Select value={source} onValueChange={setSource}>
						<SelectTrigger className="h-8 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{LEAD_SOURCES.map((s) => (
								<SelectItem key={s} value={s} className="capitalize">
									{s}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
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

				{/* Custom fields (user-defined). Hidden when there are none. */}
				<CustomFieldsSection
					orgId={orgId}
					entityType="leads"
					layout="grid"
					registerGetValues={(getter) => {
						customGetterRef.current = getter;
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
						<div className="grid grid-cols-[120px_1fr] items-center gap-x-3 pt-1">
							<Label className="text-xs">{labels.company.singular}</Label>
							<Select
								value={existingCompanyId || undefined}
								onValueChange={(v) => setExistingCompanyId(v as Id<"companies">)}
							>
								<SelectTrigger className="h-8 text-xs">
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
						<div className="grid grid-cols-[120px_1fr] items-center gap-x-3 gap-y-1.5 pt-1">
							<Label className="text-xs">Name *</Label>
							<Input
								value={newCompanyName}
								onChange={(e) => setNewCompanyName(e.target.value)}
								placeholder={`${labels.company.singular} name`}
								className="h-8 text-xs"
							/>
							<Label className="text-xs">Industry</Label>
							<Input
								value={newCompanyIndustry}
								onChange={(e) => setNewCompanyIndustry(e.target.value)}
								placeholder="Industry"
								className="h-8 text-xs"
							/>
							<Label className="text-xs">Website</Label>
							<Input
								value={newCompanyWebsite}
								onChange={(e) => setNewCompanyWebsite(e.target.value)}
								placeholder="https://…"
								className="h-8 text-xs"
							/>
							<div className="col-span-2 text-[10px] text-muted-foreground">
								<PlusIcon className="me-1 inline size-2.5" />
								Will be created and linked to this{" "}
								{labels.lead.singular.toLowerCase()}.
							</div>
						</div>
					)}
				</div>
			</div>
		</EntityFormDrawer>
	);
}
