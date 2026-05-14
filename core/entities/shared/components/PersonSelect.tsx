"use client";

/**
 * PersonSelect — combobox picker returning full PersonRef (D7).
 *
 * Scope: user | lead | contact | person (lead ∪ contact). Returns the full ref,
 * never just an id (D16).
 *
 * Visual contract: full-bordered trigger that matches `components/ui/input.tsx`
 * — NOT the underline-only style the default `Combobox/InputGroup` ships with.
 * This keeps the form surface consistent with Settings, AddLeadDrawer's Inputs,
 * and every other field in the app.
 */

import { useQuery } from "convex/react";
import { ChevronDownIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import type { PersonRef } from "../types";

interface PersonSelectProps {
	scope: "user" | "lead" | "contact" | "person";
	value?: PersonRef | null;
	onChange: (person: PersonRef | null) => void;
	orgId?: Id<"orgs">;
	placeholder?: string;
	disabled?: boolean;
	className?: string;
}

export function PersonSelect({
	scope,
	value,
	onChange,
	orgId,
	placeholder = "Select someone…",
	disabled,
	className,
}: PersonSelectProps) {
	const params = useParams();
	const orgSlug = params?.orgSlug as string | undefined;
	const orgs = useQuery(api.orgs.queries.listMyOrgs);
	const resolvedOrgId = orgId ?? orgs?.find((o) => o.org.slug === orgSlug)?.org._id;

	const [open, setOpen] = useState(false);
	const [inputValue, setInputValue] = useState("");

	// Scope-based queries
	const members = useQuery(
		api.orgs.queries.listMembers,
		scope === "user" && resolvedOrgId ? { orgId: resolvedOrgId } : "skip",
	);

	const people = useQuery(
		api.crm.people.queries.listAll,
		(scope === "lead" || scope === "contact" || scope === "person") && resolvedOrgId
			? { orgId: resolvedOrgId, type: scope === "person" ? undefined : scope }
			: "skip",
	);

	const options: PersonRef[] = useMemo(() => {
		if (scope === "user") {
			return (members ?? []).map((m) => ({
				id: m.userId as string,
				type: "user" as const,
				displayName: m.user?.name ?? m.user?.email ?? "Unknown",
				email: m.user?.email,
				avatarUrl: m.user?.avatarUrl,
			}));
		}
		return (people ?? []).map((p) => ({
			id: p._id as string,
			type: p.type,
			personCode: p.personCode,
			displayName: p.displayName,
			email: p.email,
			phone: p.phone,
		}));
	}, [scope, members, people]);

	const filtered = useMemo(() => {
		if (!inputValue) return options;
		const q = inputValue.toLowerCase();
		return options.filter(
			(o) =>
				o.displayName.toLowerCase().includes(q) ||
				o.email?.toLowerCase().includes(q) ||
				o.personCode?.toLowerCase().includes(q),
		);
	}, [options, inputValue]);

	// If the caller hands us a stub `{id, displayName: ""}` (because they only
	// store the user id externally), enrich it with the full profile from
	// `options`. This keeps the trigger showing avatar + real name instead of
	// "?? <id>" when a value has just been (re-)hydrated from the DB.
	const display = useMemo<PersonRef | null>(() => {
		if (!value) return null;
		if (value.displayName && value.displayName.length > 0) return value;
		const enriched = options.find((o) => o.id === value.id);
		return enriched ?? value;
	}, [value, options]);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled}
					className={cn(
						"h-9 w-full justify-between px-3 font-normal",
						!display && "text-muted-foreground",
						className,
					)}
				>
					{display ? (
						<span className="flex items-center gap-2 truncate">
							<Avatar className="size-5">
								<AvatarImage src={display.avatarUrl} />
								<AvatarFallback className="text-[9px]">
									{(display.displayName || "?").slice(0, 2).toUpperCase()}
								</AvatarFallback>
							</Avatar>
							<span className="truncate">
								{display.displayName || display.email || display.id}
							</span>
						</span>
					) : (
						<span className="truncate">{placeholder}</span>
					)}
					<ChevronDownIcon className="ms-2 size-4 shrink-0 opacity-50" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="w-[--radix-popover-trigger-width] p-0"
				align="start"
				sideOffset={4}
			>
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Search…"
						value={inputValue}
						onValueChange={setInputValue}
					/>
					<CommandList>
						<CommandEmpty>No results found</CommandEmpty>
						<CommandGroup>
							{filtered.map((person) => (
								<CommandItem
									key={person.id}
									value={person.id}
									onSelect={() => {
										onChange(person.id === display?.id ? null : person);
										setOpen(false);
										setInputValue("");
									}}
								>
									<Avatar className="me-2 size-6">
										<AvatarImage src={person.avatarUrl} />
										<AvatarFallback className="text-[9px]">
											{person.displayName.slice(0, 2).toUpperCase()}
										</AvatarFallback>
									</Avatar>
									<div className="flex min-w-0 flex-col">
										<span className="truncate text-sm">
											{person.displayName}
										</span>
										{(person.personCode || person.email) && (
											<span className="truncate text-xs text-muted-foreground">
												{person.personCode ?? person.email}
											</span>
										)}
									</div>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
