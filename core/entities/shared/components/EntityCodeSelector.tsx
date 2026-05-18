"use client";

/**
 * EntityCodeSelector — pick any CRM entity (lead/contact/deal/company)
 * with avatar + name + code on the selected chip.
 *
 * STATUS: IMPLEMENTED.
 *
 * This is the form-row sibling of `EntityPickerPopover` from the notes
 * module. The notes picker is a tiny avatar-only trigger (next to a
 * sticky note's color dot); this is a full Combobox-style trigger that
 * lives inside a form, with a clear selection chip and the same backing
 * search query.
 *
 * Why one component instead of two
 * ────────────────────────────────
 *   - Both pickers want the same backing data: `useEntitySearch` from
 *     `core/comms/notes/hooks` (returns leads + contacts + deals + companies).
 *   - The notes flow needs a tiny avatar trigger that opens over the
 *     card. The EventForm and any future "attach this reminder to X"
 *     flow need a regular form-row trigger that fits inside a column of
 *     labels and inputs. Same data, different chrome.
 *   - Profiles (lead+contact merged on personCode) collapse into ONE
 *     "Profiles" row per person — exactly like the notes picker —
 *     so a converted lead reattaches as the contact without confusing
 *     the user.
 *
 * Selection contract
 * ──────────────────
 * The `value` prop is a discriminated union — caller passes either a
 * person tuple `{ kind: "person", personCode }` or an entity tuple
 * `{ kind: "deal" | "company", code, id }`. We translate the search
 * results to the same shape on pick. The component exports
 * `EntityCodeSelection` so other forms (future reminder-attach,
 * note-attach, AI suggested attachments) can reuse the type.
 *
 * Display chip
 * ────────────
 * The trigger renders:
 *   ┌─────────────────────────────────────────────┐
 *   │ [avatar]  Name                  [P-001] ▾   │
 *   └─────────────────────────────────────────────┘
 * No "?" placeholders — when nothing is selected we render the
 * `placeholder` prop. When a value is set but the display info hasn't
 * loaded yet (rare — only on the first paint after a deep-link or
 * initial form mount) we fall back to the code only, never "?".
 */

import { ChevronDownIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Id } from "@/convex/_generated/dataModel";
import { useEntitySearch } from "@/core/comms/notes/hooks";
import { cn } from "@/lib/utils";

// ─── Public types ────────────────────────────────────────────────────────────

export type EntityCodeSelection =
	| {
			kind: "person";
			/** Person identifier (always set for lead+contact rows). */
			personCode: string;
			/** Optional — true when the underlying record is a contact. */
			subKind?: "lead" | "contact";
			/** Cached display fields so the chip can render instantly without re-searching. */
			displayName?: string;
			secondary?: string;
	  }
	| {
			kind: "deal";
			/** Deal slug (e.g. D-001) — passed to the mutation as `entityId`. */
			code: string;
			/** Convex doc id — used as fallback when code lookup is needed. */
			id?: Id<"deals">;
			personCode?: string;
			displayName?: string;
			secondary?: string;
	  }
	| {
			kind: "company";
			code: string;
			id?: Id<"companies">;
			displayName?: string;
			secondary?: string;
	  };

export type EntityCodeKind = EntityCodeSelection["kind"];

interface EntityCodeSelectorProps {
	orgId: Id<"orgs"> | undefined;
	value: EntityCodeSelection | null;
	onChange: (next: EntityCodeSelection | null) => void;
	/** Restrict the picker to certain kinds. Defaults to all 3. */
	allowedKinds?: ReadonlyArray<EntityCodeKind>;
	placeholder?: string;
	disabled?: boolean;
	className?: string;
	/** Show an "X" on the trigger to clear when a value is set. */
	clearable?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const KIND_GROUP_LABEL: Record<"profiles" | "deal" | "company", string> = {
	profiles: "Profiles",
	deal: "Deals",
	company: "Companies",
};

/** Two-letter initials from a display name. Always uppercase. */
function getInitials(name: string | undefined | null): string {
	if (!name) return "—";
	const parts = name.split(/\s+/).filter(Boolean);
	if (parts.length === 0) return "—";
	const first = parts[0]?.[0] ?? "";
	const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
	return (first + last).toUpperCase() || "—";
}

// ─── Component ───────────────────────────────────────────────────────────────

export function EntityCodeSelector({
	orgId,
	value,
	onChange,
	allowedKinds,
	placeholder = "Pick an entity…",
	disabled,
	className,
	clearable = true,
}: EntityCodeSelectorProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");

	// Reset the query whenever the popover closes so reopening starts fresh.
	useEffect(() => {
		if (!open) setQuery("");
	}, [open]);

	const allowed = useMemo(() => {
		const set = new Set<EntityCodeKind>(allowedKinds ?? ["person", "deal", "company"]);
		return set;
	}, [allowedKinds]);

	const results = useEntitySearch({
		orgId,
		query,
		enabled: open,
		limitPerType: 6,
	});

	// Merge leads+contacts on personCode (contacts win — same logic as the
	// notes EntityPickerPopover) so the user never sees a person twice.
	type Hit = {
		id: string;
		code: string;
		personCode?: string;
		displayName: string;
		secondary?: string;
	};
	type Group =
		| { key: "profiles"; hits: ReadonlyArray<Hit> }
		| { key: "deal"; hits: ReadonlyArray<Hit> }
		| { key: "company"; hits: ReadonlyArray<Hit> };

	const groups = useMemo<Group[]>(() => {
		if (!results) return [];
		const out: Group[] = [];
		if (allowed.has("person")) {
			const byCode = new Map<string, Hit>();
			for (const c of results.contacts) byCode.set(c.code, c);
			for (const l of results.leads) {
				if (!byCode.has(l.code)) byCode.set(l.code, l);
			}
			out.push({ key: "profiles", hits: Array.from(byCode.values()) });
		}
		if (allowed.has("deal")) {
			out.push({ key: "deal", hits: results.deals });
		}
		if (allowed.has("company")) {
			out.push({ key: "company", hits: results.companies });
		}
		return out;
	}, [results, allowed]);

	const totalHits = groups.reduce((n, g) => n + g.hits.length, 0);

	function pickPerson(hit: {
		code: string;
		personCode?: string;
		displayName: string;
		secondary?: string;
	}) {
		onChange({
			kind: "person",
			personCode: hit.personCode ?? hit.code,
			displayName: hit.displayName,
			secondary: hit.secondary,
		});
		setOpen(false);
	}

	function pickDeal(hit: {
		id: string;
		code: string;
		personCode?: string;
		displayName: string;
		secondary?: string;
	}) {
		onChange({
			kind: "deal",
			code: hit.code,
			id: hit.id as Id<"deals">,
			personCode: hit.personCode,
			displayName: hit.displayName,
			secondary: hit.secondary,
		});
		setOpen(false);
	}

	function pickCompany(hit: {
		id: string;
		code: string;
		displayName: string;
		secondary?: string;
	}) {
		onChange({
			kind: "company",
			code: hit.code,
			id: hit.id as Id<"companies">,
			displayName: hit.displayName,
			secondary: hit.secondary,
		});
		setOpen(false);
	}

	// Trigger label: avatar + name + code, OR placeholder.
	const triggerInner = (() => {
		if (!value) {
			return <span className="truncate text-muted-foreground">{placeholder}</span>;
		}
		const code = value.kind === "person" ? value.personCode : value.code;
		const name = value.displayName ?? code;
		const initials = getInitials(value.displayName ?? code);
		return (
			<span className="flex items-center gap-2 truncate">
				<Avatar className="size-5 shrink-0">
					<AvatarFallback className="bg-primary/15 text-[9px] font-medium text-primary">
						{initials}
					</AvatarFallback>
				</Avatar>
				<span className="truncate text-sm">{name}</span>
				<Badge
					variant="outline"
					className="ms-auto h-5 shrink-0 border-primary/30 bg-primary/10 px-1.5 font-mono text-[10px] tabular-nums text-primary"
				>
					{code}
				</Badge>
			</span>
		);
	})();

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<div className={cn("flex w-full items-center gap-1", className)}>
				<PopoverTrigger asChild>
					<Button
						type="button"
						variant="outline"
						role="combobox"
						aria-expanded={open}
						disabled={disabled}
						className="h-9 flex-1 justify-between gap-2 px-3 font-normal"
					>
						{triggerInner}
						<ChevronDownIcon className="size-4 shrink-0 opacity-50" />
					</Button>
				</PopoverTrigger>
				{clearable && value && !disabled && (
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
						aria-label="Clear selection"
						onClick={() => onChange(null)}
					>
						<XIcon className="size-3.5" />
					</Button>
				)}
			</div>

			<PopoverContent
				className="w-[--radix-popover-trigger-width] p-0"
				align="start"
				sideOffset={4}
			>
				<div className="border-b p-2">
					<Input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search by name, email, or code (P-001, D-042, CO-001)…"
						className="h-8 text-xs"
						autoFocus
					/>
				</div>
				<div className="max-h-72 overflow-y-auto">
					{!results && (
						<div className="px-3 py-4 text-xs text-muted-foreground">Loading…</div>
					)}
					{results && totalHits === 0 && (
						<div className="px-3 py-4 text-xs text-muted-foreground">No matches.</div>
					)}
					{groups.map((group) =>
						group.hits.length === 0 ? null : (
							<div key={group.key} className="py-1">
								<div className="px-3 pb-1 pt-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
									{KIND_GROUP_LABEL[group.key]}
								</div>
								<ul className="flex flex-col">
									{group.hits.map((hit: Hit) => {
										const initials = getInitials(hit.displayName);
										const selected = isSelected(value, group.key, hit);
										return (
											<li key={`${group.key}:${hit.id}`}>
												<button
													type="button"
													className={cn(
														"flex w-full items-center gap-2 px-3 py-1.5 text-start text-xs transition-colors",
														selected
															? "bg-primary/10 text-primary hover:bg-primary/15"
															: "hover:bg-accent",
													)}
													onClick={() => {
														if (group.key === "profiles")
															pickPerson(hit);
														else if (group.key === "deal")
															pickDeal(hit);
														else pickCompany(hit);
													}}
												>
													<Avatar className="size-6 shrink-0">
														<AvatarFallback
															className={cn(
																"text-[9px] font-medium",
																selected
																	? "bg-primary/20 text-primary"
																	: "bg-muted text-muted-foreground",
															)}
														>
															{initials}
														</AvatarFallback>
													</Avatar>
													<span className="min-w-0 flex-1">
														<div className="truncate font-medium">
															{hit.displayName}
														</div>
														{hit.secondary && (
															<div
																className={cn(
																	"truncate text-[10px]",
																	selected
																		? "text-primary/80"
																		: "text-muted-foreground",
																)}
															>
																{hit.secondary}
															</div>
														)}
													</span>
													<Badge
														variant="outline"
														className={cn(
															"shrink-0 font-mono tabular-nums h-5 px-1.5 text-[10px]",
															selected
																? "border-primary/40 bg-primary/15 text-primary"
																: "border-primary/30 bg-primary/10 text-primary",
														)}
													>
														{hit.code}
													</Badge>
												</button>
											</li>
										);
									})}
								</ul>
							</div>
						),
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isSelected(
	current: EntityCodeSelection | null,
	groupKey: "profiles" | "deal" | "company",
	hit: { id: string; code: string; personCode?: string },
): boolean {
	if (!current) return false;
	if (groupKey === "profiles") {
		if (current.kind !== "person") return false;
		const targetCode = hit.personCode ?? hit.code;
		return current.personCode === targetCode;
	}
	if (groupKey === "deal") {
		return current.kind === "deal" && current.code === hit.code;
	}
	return current.kind === "company" && current.code === hit.code;
}
