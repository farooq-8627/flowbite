"use client";

/**
 * EntityPickerPopover — typeahead search for the per-card "attach to entity"
 * trigger.
 *
 * UX
 * ──
 *   - Trigger:
 *       · Detached  → small `+` icon button (org-wide note).
 *       · Attached  → the attached entity's avatar (initials), same size as `+`.
 *     Click in either state opens the popover so the user can re-attach or
 *     detach. The trigger does NOT fetch its own display info — the parent
 *     always passes `resolvedDisplay` from the batched
 *     `useAttachmentDisplaysForOrg` lookup (one query per board, not per
 *     card). See AGENTS.md "Per-row data on a list view" rule.
 *   - Popover layout: search input (no helper-text — the placeholder explains
 *     the input), then result rows grouped by kind:
 *       · Profiles (leads + contacts merged on personCode — the user
 *         sees ONE row per person, never duplicated by conversion state)
 *       · Deals
 *       · Companies
 *     Empty input shows the most-recent records of each kind.
 *   - Each row:
 *       [avatar] [name + secondary line] [code pill]
 *     The currently-attached row is highlighted with a soft primary tint so
 *     the user can see the active selection at a glance.
 *   - Bottom row: "Detach (org-wide)" when something is attached.
 *
 * The picker is purely presentational — the parent (`NoteCard`) holds the
 * mutation (`useSetNoteEntity`).
 */

import { Check, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useEntitySearch } from "../hooks";

export type EntityAttachment = {
	entityType: "lead" | "contact" | "deal" | "company" | "org";
	entityId: string;
	personCode?: string;
};

/**
 * Display info for a resolved attachment — what the avatar trigger uses to
 * render the entity's initials and label. Mirrors the return shape of
 * `listAttachmentDisplaysForOrg[key]`.
 */
export type AttachmentDisplay = {
	kind: "lead" | "contact" | "deal" | "company";
	code?: string;
	displayName: string;
	secondary?: string;
};

interface EntityPickerPopoverProps {
	orgId: Id<"orgs"> | undefined;
	orgSlug: string | undefined;
	currentAttachment: EntityAttachment | null;
	onPick: (next: EntityAttachment) => void;
	/** Visual + a11y label for the trigger button. */
	ariaLabel?: string;
	className?: string;
	/**
	 * Pre-resolved display info for the current attachment, sourced from the
	 * parent's batched `useAttachmentDisplaysForOrg` lookup. The popover NEVER
	 * fetches per-card — every caller MUST supply this prop (pass `null`
	 * when the parent has confirmed the attachment doesn't resolve).
	 */
	resolvedDisplay: AttachmentDisplay | null;
}

type GroupKey = "profiles" | "deal" | "company";

const GROUP_LABEL: Record<GroupKey, string> = {
	profiles: "Profiles",
	deal: "Deals",
	company: "Companies",
};

interface Hit {
	id: string;
	code: string;
	displayName: string;
	secondary?: string;
	personCode?: string;
}

interface ResultGroup {
	key: GroupKey;
	hits: Hit[];
	pickKind: "profile" | "deal" | "company";
}

export function EntityPickerPopover({
	orgId,
	orgSlug,
	currentAttachment,
	onPick,
	ariaLabel = "Attach to entity",
	className,
	resolvedDisplay,
}: EntityPickerPopoverProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");

	const isAttached = currentAttachment !== null && currentAttachment.entityType !== "org";

	// Avatar-trigger display: parent always supplies the resolved record via
	// the batched `useAttachmentDisplaysForOrg` lookup. `null` is a meaningful
	// signal — parent confirmed the attachment doesn't resolve (e.g. deleted
	// record) and we should fall back to the `+` icon.
	const attachedDisplay = resolvedDisplay;

	// Server-side typeahead — only fires when the popover is open.
	const results = useEntitySearch({ orgId, query, enabled: open, limitPerType: 6 });

	function handlePick(next: EntityAttachment) {
		onPick(next);
		setOpen(false);
		setQuery("");
	}

	function handleDetach() {
		if (!orgSlug) return;
		handlePick({ entityType: "org", entityId: orgSlug });
	}

	// Merge leads+contacts into a single "Profiles" group, deduped on
	// personCode (contacts win — they represent the converted person).
	const groups: ResultGroup[] = useMemo(() => {
		if (!results) return [];
		const profilesByCode = new Map<string, Hit>();
		for (const c of results.contacts) {
			profilesByCode.set(c.code, c);
		}
		for (const l of results.leads) {
			if (!profilesByCode.has(l.code)) {
				profilesByCode.set(l.code, l);
			}
		}
		const profiles = Array.from(profilesByCode.values());
		return [
			{ key: "profiles", hits: profiles, pickKind: "profile" } as const,
			{ key: "deal", hits: results.deals, pickKind: "deal" } as const,
			{ key: "company", hits: results.companies, pickKind: "company" } as const,
		];
	}, [results]);

	const totalHits = groups.reduce((n, g) => n + g.hits.length, 0);

	const triggerInitials = (
		attachedDisplay?.displayName ??
		attachedDisplay?.code ??
		currentAttachment?.personCode ??
		""
	)
		.split(/\s+/)
		.map((s) => s[0])
		.filter(Boolean)
		.join("")
		.slice(0, 2)
		.toUpperCase();

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={ariaLabel}
					title={
						isAttached
							? attachedDisplay
								? `Attached to ${attachedDisplay.displayName} (${attachedDisplay.code})`
								: "Attached"
							: "Attach to a record"
					}
					className={cn(
						"inline-flex size-5 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						isAttached
							? "ring-1 ring-black/10 hover:ring-primary/40"
							: "bg-foreground/10 text-foreground hover:bg-foreground/20",
						className,
					)}
				>
					{isAttached ? (
						<Avatar className="size-5">
							<AvatarFallback className="bg-primary/15 text-primary text-[8px] font-medium">
								{triggerInitials || "?"}
							</AvatarFallback>
						</Avatar>
					) : (
						<Plus className="size-3" />
					)}
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-80 p-0" align="end">
				<div className="border-b p-2">
					<Input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Search by name, email or code (P-001, D-042, CO-001)…"
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
									{GROUP_LABEL[group.key]}
								</div>
								<ul className="flex flex-col">
									{group.hits.map((hit) => {
										const initials = hit.displayName
											.split(/\s+/)
											.map((s) => s[0])
											.filter(Boolean)
											.join("")
											.slice(0, 2)
											.toUpperCase();
										const isSelected = isPickSelected(
											currentAttachment,
											group.pickKind,
											hit,
										);
										return (
											<li key={`${group.key}:${hit.id}`}>
												<button
													type="button"
													className={cn(
														"flex w-full items-center gap-2 px-3 py-1.5 text-start text-xs transition-colors",
														isSelected
															? "bg-primary/10 text-primary hover:bg-primary/15"
															: "hover:bg-accent",
													)}
													onClick={() =>
														handlePick(
															toAttachment(group.pickKind, hit),
														)
													}
												>
													<Avatar className="size-6 shrink-0">
														<AvatarFallback
															className={cn(
																"text-[9px] font-medium",
																isSelected
																	? "bg-primary/20 text-primary"
																	: "bg-muted text-muted-foreground",
															)}
														>
															{initials || "?"}
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
																	isSelected
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
															isSelected
																? "border-primary/40 bg-primary/15 text-primary"
																: "border-primary/30 bg-primary/10 text-primary",
														)}
													>
														{hit.code}
													</Badge>
													{isSelected && (
														<Check
															aria-hidden
															className="size-3 shrink-0 text-primary"
														/>
													)}
												</button>
											</li>
										);
									})}
								</ul>
							</div>
						),
					)}
				</div>
				{isAttached && (
					<div className="border-t p-2">
						<Button
							type="button"
							size="sm"
							variant="ghost"
							className="h-7 w-full justify-center text-xs"
							onClick={handleDetach}
						>
							<X className="me-1 size-3.5" />
							Detach (org-wide)
						</Button>
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Translate a result row into the wire shape the mutation expects.
 *
 * Persons (leads + contacts) are merged into a single "Profiles" group on
 * the UI side. The wire format uses `entityType: "contact"` for the merged
 * row — every profile hit already has a personCode, and the timeline /
 * activity log readers resolve people via personCode regardless of which
 * table they live in. Contact-first matches `crm.people.getByPersonCode`'s
 * resolution order so a converted lead reattaches as the contact.
 */
function toAttachment(
	pickKind: "profile" | "deal" | "company",
	hit: { id: string; code: string; personCode?: string },
): EntityAttachment {
	if (pickKind === "profile") {
		return {
			entityType: "contact",
			entityId: hit.code,
			personCode: hit.personCode ?? hit.code,
		};
	}
	if (pickKind === "deal") {
		return {
			entityType: "deal",
			entityId: hit.id,
			personCode: hit.personCode,
		};
	}
	return {
		entityType: "company",
		entityId: hit.id,
		personCode: undefined,
	};
}

function isPickSelected(
	current: EntityAttachment | null,
	pickKind: "profile" | "deal" | "company",
	hit: { id: string; code: string; personCode?: string },
): boolean {
	if (!current || current.entityType === "org") return false;
	if (pickKind === "profile") {
		const targetCode = hit.personCode ?? hit.code;
		return (
			(current.entityType === "lead" || current.entityType === "contact") &&
			(current.personCode === targetCode || current.entityId === targetCode)
		);
	}
	if (pickKind === "deal") {
		return current.entityType === "deal" && current.entityId === hit.id;
	}
	return current.entityType === "company" && current.entityId === hit.id;
}
