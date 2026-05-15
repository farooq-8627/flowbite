"use client";

/**
 * CompanyDrawer — unified add + edit form for companies.
 *
 * Round 5 redesign:
 *   - Premium density (gap-2.5 between fields, h-9 inputs, 11px labels)
 *   - Section headers as small-caps + hairline divider (no heavy collapsibles)
 *   - Two-column layout for industry + website (related short fields)
 *   - MultiSelect for assignees + people (no pill row above the trigger)
 *
 * SCHEMA NOTES:
 *   - `assignees[]` is the canonical multi-assignee field.
 *   - `personCodes[]` is the canonical "who works at this company" join.
 *   - In edit mode, both arrays start populated from the doc and any change
 *     is written via `companies.mutations.update`.
 */

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
	CreateModeFileField,
	FileBufferProvider,
	useFileBuffer,
} from "@/core/data-io/files/components/CreateModeFileField";
import { FormDrawer } from "@/core/entities/shared/components/FormDrawer";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";

type Mode = "add" | "edit";

interface CompanyDrawerProps {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	orgId: Id<"orgs"> | undefined;
	mode: Mode;
	/** In edit mode, the company being edited. */
	company?: Doc<"companies"> | null;
}

interface UserOption extends MultiSelectOption {
	avatarUrl?: string;
}

interface PersonOption extends MultiSelectOption {
	personCode: string;
}

export function CompanyDrawer({ open, onOpenChange, orgId, mode, company }: CompanyDrawerProps) {
	const labels = useEntityLabels();

	const [name, setName] = useState("");
	const [industry, setIndustry] = useState("");
	const [website, setWebsite] = useState("");
	const [assignees, setAssignees] = useState<string[]>([]); // userIds
	const [personCodes, setPersonCodes] = useState<string[]>([]);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const create = useMutation(api.crm.entities.companies.mutations.create);
	const update = useMutation(api.crm.entities.companies.mutations.update);

	// Buffered file uploads — files added during create are committed under
	// scope="company" / scopeId=companyCode after the org row is written. For
	// edit mode the same buffer commits using the existing companyCode so the
	// pattern is symmetric. (Mirrors the wiring in AddLeadDrawer.)
	const fileBuffer = useFileBuffer(orgId);

	const members = useQuery(api.orgs.queries.listMembers, orgId ? { orgId } : "skip");
	const availablePersons = useQuery(
		api.crm.entities.companies.queries.listPersonsWithoutCompany,
		orgId ? { orgId } : "skip",
	);

	// Populate from the doc when (re)opened.
	useEffect(() => {
		if (!open) return;
		fileBuffer.reset();
		if (mode === "edit" && company) {
			setName(company.name ?? "");
			setIndustry(company.industry ?? "");
			setWebsite(company.website ?? "");
			setAssignees(((company.assignees ?? []) as string[]).slice());
			setPersonCodes((company.personCodes ?? []).slice());
		} else if (mode === "add") {
			setName("");
			setIndustry("");
			setWebsite("");
			setAssignees([]);
			setPersonCodes([]);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps -- fileBuffer.reset is stable (useCallback with [])
	}, [open, mode, company, fileBuffer.reset]);

	const handleSubmit = async () => {
		if (!orgId || !name.trim()) return;
		setIsSubmitting(true);
		try {
			let scopeId: string | undefined;
			if (mode === "add") {
				const created = await create({
					orgId,
					name: name.trim(),
					industry: industry.trim() || undefined,
					website: website.trim() || undefined,
					assignedTo: assignees[0] as Id<"users"> | undefined,
					assignees: assignees.length
						? (assignees as unknown as Id<"users">[])
						: undefined,
					personCodes: personCodes.length ? personCodes : undefined,
				});
				scopeId = (created as { companyCode?: string } | undefined)?.companyCode;
				toast.success(`${labels.company.singular} created`);
			} else if (mode === "edit" && company) {
				await update({
					orgId,
					companyId: company._id as Id<"companies">,
					name: name.trim(),
					industry: industry.trim() || undefined,
					website: website.trim() || undefined,
					assignedTo: assignees[0] as Id<"users"> | undefined,
					assignees: assignees as unknown as Id<"users">[],
					personCodes,
				});
				scopeId = company.companyCode;
				toast.success(`${labels.company.singular} updated`);
			}

			// Flush buffered file uploads to the company scope so they're
			// reachable from the company detail view via files.queries.listByScope.
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
				{ description: err instanceof Error ? err.message : undefined },
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	// MultiSelect options
	const memberOptions: UserOption[] = useMemo(
		() =>
			(members ?? []).map((m) => ({
				value: m.userId as string,
				label: m.user?.name ?? m.user?.email ?? "Unknown",
				subtitle: m.user?.email,
				avatarUrl: m.user?.avatarUrl,
			})),
		[members],
	);

	// In edit mode, always include any already-selected personCodes that aren't
	// in the available list (they're filtered out of `listPersonsWithoutCompany`).
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
			submitDisabled={!name.trim()}
		>
			<FileBufferProvider value={fileBuffer}>
				<div className="flex flex-col gap-4">
					{/* Identity */}
					<section className="flex flex-col gap-2.5">
						<div className="flex flex-col gap-1">
							<Label className="text-[11px] font-medium leading-none">
								Name
								<span className="ms-0.5 text-destructive/60">*</span>
							</Label>
							<Input
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder={`${labels.company.singular} name`}
								className="h-9 w-full text-sm"
							/>
						</div>
						{/* Industry + Website paired (both short single-line) */}
						<div className="grid grid-cols-2 gap-2.5">
							<div className="flex flex-col gap-1">
								<Label className="text-[11px] font-medium leading-none">
									Industry
								</Label>
								<Input
									value={industry}
									onChange={(e) => setIndustry(e.target.value)}
									placeholder="Technology"
									className="h-9 w-full text-sm"
								/>
							</div>
							<div className="flex flex-col gap-1">
								<Label className="text-[11px] font-medium leading-none">
									Website
								</Label>
								<Input
									value={website}
									onChange={(e) => setWebsite(e.target.value)}
									placeholder="https://…"
									className="h-9 w-full text-sm"
								/>
							</div>
						</div>
					</section>

					{/* Team */}
					<section className="flex flex-col gap-2.5">
						<div className="flex items-center gap-2">
							<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
								Team
							</span>
							<div className="h-px flex-1 bg-border" />
						</div>
						<div className="flex flex-col gap-1">
							<Label className="text-[11px] font-medium leading-none">
								Assignees
							</Label>
							<MultiSelect<UserOption>
								value={assignees}
								onChange={setAssignees}
								options={memberOptions}
								placeholder="Add team members…"
								searchPlaceholder="Search members…"
								emptyText="No members."
								renderRow={(opt) => (
									<>
										<Avatar className="size-5 shrink-0">
											<AvatarImage src={opt.avatarUrl} alt={opt.label} />
											<AvatarFallback className="text-[8px]">
												{opt.label.slice(0, 1).toUpperCase()}
											</AvatarFallback>
										</Avatar>
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
						<div className="flex flex-col gap-1">
							<Label className="text-[11px] font-medium leading-none">People</Label>
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

					{/* Files — buffered upload during create, committed on submit */}
					{orgId && (
						<section className="flex flex-col gap-2.5">
							<div className="flex items-center gap-2">
								<span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
									Files
								</span>
								<div className="h-px flex-1 bg-border" />
							</div>
							<CreateModeFileField
								orgId={orgId}
								fieldKey="_default"
								label="Files"
								multiple
							/>
						</section>
					)}
				</div>
			</FileBufferProvider>
		</FormDrawer>
	);
}
