"use client";

/**
 * CompanyCell — inline company display + connector for a person (lead/contact).
 *
 * ╭──── STATE ────┬──── UI ───────────────────────────────────────────────╮
 * │ No company    │ (+) button → popover with Existing / New tabs       │
 * │ Has company   │ Company name pill (click → /company/[companyCode])    │
 * ╰───────────────┴───────────────────────────────────────────────────────╯
 *
 * Uses `companies.personCodes[]` as the canonical source — when the user
 * picks an existing company we call `companies.mutations.addPerson`; when
 * they create a new one we `companies.mutations.create` with the personCode
 * pre-populated.
 */

import { useMutation, useQuery } from "convex/react";
import { Building2Icon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface CompanyCellProps {
	orgId: Id<"orgs"> | undefined;
	personCode: string | undefined;
	/** Used for activity log / future personalisation — optional. */
	entityType?: "lead" | "contact";
	className?: string;
	/**
	 * Pre-fetched company for this person (from batch `useCompaniesByPersonCodes`).
	 * When provided, skips the per-row `getByPersonCode` query.
	 */
	prefetchedCompany?: { companyId: string; name: string; companyCode: string } | null;
}

export function CompanyCell({ orgId, personCode, entityType, className, prefetchedCompany }: CompanyCellProps) {
	const [open, setOpen] = useState(false);
	const [tab, setTab] = useState<"existing" | "new">("existing");
	const [search, setSearch] = useState("");
	const [newName, setNewName] = useState("");
	const [newIndustry, setNewIndustry] = useState("");
	const [newWebsite, setNewWebsite] = useState("");

	const params = useParams();
	const orgSlug = params?.orgSlug as string | undefined;
	const locale = params?.locale as string | undefined;

	const company = useQuery(
		api.crm.entities.companies.queries.getByPersonCode,
		orgId && personCode && prefetchedCompany === undefined ? { orgId, personCode } : "skip",
	);
	const allCompanies = useQuery(
		api.crm.entities.companies.queries.list,
		orgId ? { orgId } : "skip",
	);

	// Resolve company from prefetched or query result.
	const resolvedCompany = prefetchedCompany !== undefined
		? (prefetchedCompany ?? undefined)
		: company;

	const createCompany = useMutation(api.crm.entities.companies.mutations.create);
	const addPerson = useMutation(api.crm.entities.companies.mutations.addPerson);

	const filtered = useMemo(() => {
		if (!allCompanies) return [];
		if (!search.trim()) return allCompanies;
		const q = search.toLowerCase();
		return allCompanies.filter((c) => c.name.toLowerCase().includes(q));
	}, [allCompanies, search]);

	const handleAttachExisting = async (companyId: Id<"companies">) => {
		if (!orgId || !personCode) return;
		try {
			await addPerson({ orgId, companyId, personCode });
			toast.success("Company linked");
			setOpen(false);
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't link company");
		}
	};

	const handleCreateNew = async () => {
		if (!orgId || !personCode || !newName.trim()) return;
		try {
			await createCompany({
				orgId,
				name: newName.trim(),
				industry: newIndustry.trim() || undefined,
				website: newWebsite.trim() || undefined,
				personCodes: [personCode],
			});
			toast.success("Company created");
			setOpen(false);
			setNewName("");
			setNewIndustry("");
			setNewWebsite("");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't create company");
		}
	};

	// ── Has a company → show linked pill ────────────────────────────────────
	if (resolvedCompany) {
		const href = orgSlug
			? locale
				? `/${locale}/${orgSlug}/company/${resolvedCompany.companyCode}`
				: `/${orgSlug}/company/${resolvedCompany.companyCode}`
			: null;
		const pill = (
			<Badge
				variant="outline"
				className={cn(
					"gap-1 font-normal text-xs no-underline hover:no-underline",
					className,
				)}
			>
				<Building2Icon className="size-3" />
				<span className="truncate max-w-[14ch]">{resolvedCompany.name}</span>
			</Badge>
		);
		if (!href) return pill;
		return (
			<Link href={href} className="no-underline" style={{ textDecoration: "none" }}>
				{pill}
			</Link>
		);
	}

	// ── No company → + button ───────────────────────────────────────────────
	if (!orgId || !personCode) {
		return <span className="text-xs text-muted-foreground">—</span>;
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button
							size="icon"
							variant="ghost"
							className={cn("size-5", className)}
							aria-label="Add company"
							data-entity-type={entityType}
						>
							<PlusIcon className="size-3" />
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="top" className="text-xs">
					Add company
				</TooltipContent>
			</Tooltip>
			<PopoverContent className="w-80 p-0" align="start">
				<Tabs value={tab} onValueChange={(v) => setTab(v as "existing" | "new")}>
					<div className="border-b p-2">
						<TabsList className="grid w-full grid-cols-2">
							<TabsTrigger value="existing" className="text-xs">
								Existing
							</TabsTrigger>
							<TabsTrigger value="new" className="text-xs">
								New
							</TabsTrigger>
						</TabsList>
					</div>
					<TabsContent value="existing" className="m-0">
						<Command shouldFilter={false}>
							<CommandInput
								placeholder="Search companies…"
								value={search}
								onValueChange={setSearch}
							/>
							<CommandList>
								<CommandEmpty>No matches.</CommandEmpty>
								<CommandGroup>
									{filtered.map((c) => (
										<CommandItem
											key={c._id}
											value={c.name}
											onSelect={() =>
												handleAttachExisting(c._id as Id<"companies">)
											}
										>
											<Building2Icon className="me-2 size-3.5 text-muted-foreground" />
											<span className="truncate">{c.name}</span>
										</CommandItem>
									))}
								</CommandGroup>
							</CommandList>
						</Command>
					</TabsContent>
					<TabsContent value="new" className="m-0 space-y-2 p-3">
						<div className="grid grid-cols-[90px_1fr] items-center gap-2">
							<Label htmlFor="cc-name" className="text-xs">
								Name
							</Label>
							<Input
								id="cc-name"
								value={newName}
								onChange={(e) => setNewName(e.target.value)}
								placeholder="Acme Inc."
								className="h-8 text-xs"
							/>
							<Label htmlFor="cc-industry" className="text-xs">
								Industry
							</Label>
							<Input
								id="cc-industry"
								value={newIndustry}
								onChange={(e) => setNewIndustry(e.target.value)}
								placeholder="Technology"
								className="h-8 text-xs"
							/>
							<Label htmlFor="cc-website" className="text-xs">
								Website
							</Label>
							<Input
								id="cc-website"
								value={newWebsite}
								onChange={(e) => setNewWebsite(e.target.value)}
								placeholder="https://acme.com"
								className="h-8 text-xs"
							/>
						</div>
						<Button
							size="sm"
							onClick={handleCreateNew}
							disabled={!newName.trim()}
							className="h-7 w-full text-xs"
						>
							Create company
						</Button>
					</TabsContent>
				</Tabs>
			</PopoverContent>
		</Popover>
	);
}
