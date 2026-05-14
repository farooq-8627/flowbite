"use client";

/**
 * CompanyDrawer — unified add + edit form for companies.
 *
 * Replaces the older AddCompanyDrawer that lived inline in CompaniesView.
 *
 * SCHEMA NOTES:
 *   - `assignees[]` is the canonical multi-assignee field (replaces the old
 *     `teamMembers[]`). The legacy field is still in the schema as
 *     @deprecated for back-compat.
 *   - `personCodes[]` is the canonical "who works at this company" join.
 *     The picker pulls from `companies.queries.listPersonsWithoutCompany` so
 *     we never offer a person who's already attached elsewhere.
 *   - In edit mode, both arrays start populated from the doc and any change
 *     is written via `companies.mutations.update`.
 */

import { useMutation, useQuery } from "convex/react";
import { CheckIcon, UserIcon, UsersIcon, XIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { FormDrawer } from "@/core/entities/shared/components/FormDrawer";
import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";

type Mode = "add" | "edit";

interface CompanyDrawerProps {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	orgId: Id<"orgs"> | undefined;
	mode: Mode;
	/** In edit mode, the company being edited. */
	company?: Doc<"companies"> | null;
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

	const members = useQuery(api.orgs.queries.listMembers, orgId ? { orgId } : "skip");
	const availablePersons = useQuery(
		api.crm.entities.companies.queries.listPersonsWithoutCompany,
		orgId ? { orgId } : "skip",
	);

	// In edit mode, also include the company's own people in the picker so
	// they can be deselected. We merge them into the available list below.
	const ownPersons = useQuery(
		api.crm.entities.companies.queries.list,
		orgId && mode === "edit" ? { orgId } : "skip",
	);

	// Populate from the doc when (re)opened.
	useEffect(() => {
		if (!open) return;
		if (mode === "edit" && company) {
			setName(company.name ?? "");
			setIndustry(company.industry ?? "");
			setWebsite(company.website ?? "");
			setAssignees(((company.assignees ?? company.teamMembers ?? []) as string[]).slice());
			setPersonCodes((company.personCodes ?? []).slice());
		} else if (mode === "add") {
			setName("");
			setIndustry("");
			setWebsite("");
			setAssignees([]);
			setPersonCodes([]);
		}
	}, [open, mode, company]);

	const handleSubmit = async () => {
		if (!orgId || !name.trim()) return;
		setIsSubmitting(true);
		try {
			if (mode === "add") {
				await create({
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
				toast.success(`${labels.company.singular} updated`);
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

	const toggleAssignee = (userId: string) => {
		setAssignees((prev) =>
			prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
		);
	};
	const togglePerson = (personCode: string) => {
		setPersonCodes((prev) =>
			prev.includes(personCode)
				? prev.filter((pc) => pc !== personCode)
				: [...prev, personCode],
		);
	};

	const memberDocs = members ?? [];
	const personOptions = availablePersons ?? [];
	// In edit mode, ensure the already-attached personCodes still appear in the
	// picker (they're filtered out of `listPersonsWithoutCompany`). We synthesise
	// rows for them from the company's existing data via leads/contacts queries.
	const _own = ownPersons; // kept for future enrichment

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
			<div className="flex flex-col gap-3">
				<div className="grid grid-cols-[120px_1fr] items-center gap-x-3 gap-y-2">
					<Label className="text-xs">Name *</Label>
					<Input
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder={`${labels.company.singular} name`}
						className="h-8 text-xs"
					/>
					<Label className="text-xs">Industry</Label>
					<Input
						value={industry}
						onChange={(e) => setIndustry(e.target.value)}
						placeholder="Technology"
						className="h-8 text-xs"
					/>
					<Label className="text-xs">Website</Label>
					<Input
						value={website}
						onChange={(e) => setWebsite(e.target.value)}
						placeholder="https://…"
						className="h-8 text-xs"
					/>
					<Label className="text-xs">
						<UsersIcon className="me-1 inline size-3" /> Assignees
					</Label>
					<MultiUserPicker
						members={memberDocs}
						selectedIds={assignees}
						onToggle={toggleAssignee}
						placeholder="Add team members…"
					/>
					<Label className="text-xs">
						<UserIcon className="me-1 inline size-3" /> People
					</Label>
					<MultiPersonPicker
						persons={personOptions}
						selectedCodes={personCodes}
						onToggle={togglePerson}
						placeholder={`Add ${labels.contact.plural.toLowerCase()} / ${labels.lead.plural.toLowerCase()}…`}
					/>
				</div>
			</div>
		</FormDrawer>
	);
}

// ─── MultiUserPicker (assignees) ──────────────────────────────────────────────

function MultiUserPicker({
	members,
	selectedIds,
	onToggle,
	placeholder,
}: {
	members: Array<{
		userId: string;
		user?: { name?: string; email?: string; avatarUrl?: string };
	}>;
	selectedIds: string[];
	onToggle: (userId: string) => void;
	placeholder: string;
}) {
	const [open, setOpen] = useState(false);
	const selected = members.filter((m) => selectedIds.includes(m.userId));

	return (
		<div className="space-y-1.5">
			<div className="flex flex-wrap gap-1">
				{selected.map((m) => (
					<Badge
						key={m.userId}
						variant="outline"
						className="h-5 gap-1 px-1.5 text-[10px] font-normal"
					>
						<Avatar className="size-3.5">
							<AvatarImage src={m.user?.avatarUrl} />
							<AvatarFallback className="text-[7px]">
								{(m.user?.name ?? "?").slice(0, 1).toUpperCase()}
							</AvatarFallback>
						</Avatar>
						<span className="max-w-[10ch] truncate">
							{m.user?.name ?? m.user?.email ?? m.userId}
						</span>
						<button
							type="button"
							onClick={() => onToggle(m.userId)}
							aria-label={`Remove ${m.user?.name ?? "member"}`}
							className="ms-0.5 rounded-[calc(var(--radius)-2px)] hover:bg-muted"
						>
							<XIcon className="size-2.5" />
						</button>
					</Badge>
				))}
			</div>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="h-7 w-full justify-start text-xs text-muted-foreground"
					>
						{placeholder}
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-72 p-0" align="start">
					<Command>
						<CommandInput placeholder="Search members…" />
						<CommandList>
							<CommandEmpty>No matches.</CommandEmpty>
							<CommandGroup>
								{members.map((m) => {
									const checked = selectedIds.includes(m.userId);
									return (
										<CommandItem
											key={m.userId}
											value={m.user?.name ?? m.user?.email ?? m.userId}
											onSelect={() => onToggle(m.userId)}
										>
											<Avatar className="me-2 size-4">
												<AvatarImage src={m.user?.avatarUrl} />
												<AvatarFallback className="text-[7px]">
													{(m.user?.name ?? "?")
														.slice(0, 1)
														.toUpperCase()}
												</AvatarFallback>
											</Avatar>
											<span className="flex-1 truncate text-xs">
												{m.user?.name ?? m.user?.email ?? m.userId}
											</span>
											{checked && (
												<CheckIcon className="size-3 text-primary" />
											)}
										</CommandItem>
									);
								})}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}

// ─── MultiPersonPicker (people without a company) ────────────────────────────

function MultiPersonPicker({
	persons,
	selectedCodes,
	onToggle,
	placeholder,
}: {
	persons: Array<{
		personCode: string;
		displayName: string;
		email?: string;
		kind: "lead" | "contact";
	}>;
	selectedCodes: string[];
	onToggle: (personCode: string) => void;
	placeholder: string;
}) {
	const [open, setOpen] = useState(false);

	// Build a unified list = available + already-selected so deselect still works.
	const merged = [
		...persons,
		...selectedCodes
			.filter((pc) => !persons.some((p) => p.personCode === pc))
			.map((pc) => ({
				personCode: pc,
				displayName: pc,
				email: undefined as string | undefined,
				kind: "contact" as const,
			})),
	];

	const selectedRows = merged.filter((p) => selectedCodes.includes(p.personCode));

	return (
		<div className="space-y-1.5">
			<div className="flex flex-wrap gap-1">
				{selectedRows.map((p) => (
					<Badge
						key={p.personCode}
						variant="outline"
						className="h-5 gap-1 px-1.5 text-[10px] font-normal"
					>
						<span className="max-w-[14ch] truncate">{p.displayName}</span>
						<span className="text-muted-foreground">{p.personCode}</span>
						<button
							type="button"
							onClick={() => onToggle(p.personCode)}
							aria-label={`Remove ${p.displayName}`}
							className="ms-0.5 rounded-[calc(var(--radius)-2px)] hover:bg-muted"
						>
							<XIcon className="size-2.5" />
						</button>
					</Badge>
				))}
			</div>
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="h-7 w-full justify-start text-xs text-muted-foreground"
					>
						{placeholder}
					</Button>
				</PopoverTrigger>
				<PopoverContent className="w-80 p-0" align="start">
					<Command>
						<CommandInput placeholder="Search by name, code, or email…" />
						<CommandList>
							<CommandEmpty>No people without a company.</CommandEmpty>
							<CommandGroup>
								{merged.map((p) => {
									const checked = selectedCodes.includes(p.personCode);
									return (
										<CommandItem
											key={p.personCode}
											value={`${p.displayName} ${p.personCode} ${p.email ?? ""}`}
											onSelect={() => onToggle(p.personCode)}
										>
											<span className="me-2 inline-flex size-4 items-center justify-center rounded-[calc(var(--radius)-2px)] bg-muted text-[8px] font-mono">
												{p.personCode.replace(/^P-?/, "")}
											</span>
											<span className="flex-1 truncate text-xs">
												{p.displayName}
											</span>
											{p.email && (
												<span className="me-2 truncate text-[10px] text-muted-foreground">
													{p.email}
												</span>
											)}
											{checked && (
												<CheckIcon className="size-3 text-primary" />
											)}
										</CommandItem>
									);
								})}
							</CommandGroup>
						</CommandList>
					</Command>
				</PopoverContent>
			</Popover>
		</div>
	);
}
