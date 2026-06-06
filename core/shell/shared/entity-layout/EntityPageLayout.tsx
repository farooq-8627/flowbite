"use client";

/**
 * EntityPageLayout — shared toolbar + body chrome (D2).
 *
 * Lives in `core/shell/shared/entity-layout/` because it's reused by:
 *   - the four entity list pages (Leads, Contacts, Deals, Companies) via
 *     `core/entities/scaffolds/EntityListPage.tsx`,
 *   - the org-wide Notes page (`core/comms/notes/views/NotesView.tsx`),
 *   - any future shared view that wants the same slim 40px toolbar.
 *
 * Layout (single compact row — ~40px tall, full width):
 *   ┌───────────────────────────────────────────────────────────────────┐
 *   │ [🔍 search ] [filter ▾]      [list|board] [+ Add Lead]            │
 *   ├───────────────────────────────────────────────────────────────────┤
 *   │ body (DataTable, KanbanBoard, NotesByCategoryKanban, …)           │
 *
 * Why no left title cluster: `TopNav`'s `AutoBreadcrumb` already shows the
 * current page title, so the toolbar stays focused on actions.
 *
 * Split button rule:
 *   - Primary button alone when `secondary` is empty/undefined → no chevron.
 *   - Primary + chevron only when `secondary.length > 0`.
 */

import type { LucideIcon } from "lucide-react";
import { ChevronDownIcon, PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { Id } from "@/convex/_generated/dataModel";
import { useOrgPermission } from "@/features/orgs/hooks/useOrgPermission";
import { cn } from "@/lib/utils";
import { matchesShortcut, useShortcut } from "@/stores/shortcuts/shortcuts-store";
import type { ViewKind } from "./types";
import { ViewToggleIcons } from "./ViewToggleIcons";

/**
 * Entity-layout tour anchors live here (`data-tour="entity-search"`,
 * `data-tour="entity-create"`); the view-toggle anchor lives in
 * `ViewToggleIcons`. The single, device-wide entity coachmark that
 * consumes them is mounted ONCE in `EntityListPage` (`entity-tour-v1`)
 * so it never repeats across the four entity pages — see
 * `core/entities/shared/tours.ts`.
 */

export type PrimaryActionConfig = {
	label: string;
	icon?: LucideIcon;
	onClick: () => void;
	permission?: string;
	secondary?: Array<{
		label: string;
		icon?: LucideIcon;
		onSelect: () => void;
		permission?: string;
	}>;
};

interface EntityPageLayoutProps {
	views?: ViewKind[];
	view: ViewKind;
	onViewChange: (v: ViewKind) => void;
	primaryAction?: PrimaryActionConfig;
	orgId?: Id<"orgs">;
	/** Optional search input. When provided, renders a slim search field on the left. */
	search?: {
		value: string;
		onChange: (v: string) => void;
		placeholder?: string;
	};
	/** Extra toolbar controls (filter dropdown, saved views, etc.) rendered next to search. */
	toolbarExtras?: React.ReactNode;
	children: React.ReactNode;
}

export function EntityPageLayout({
	views = ["list", "board"],
	view,
	onViewChange,
	primaryAction,
	orgId,
	search,
	toolbarExtras,
	children,
}: EntityPageLayoutProps) {
	const hasPrimaryPermission = useOrgPermission(orgId, primaryAction?.permission ?? "");
	const showPrimary =
		primaryAction && (hasPrimaryPermission === true || !primaryAction.permission);

	const hasSecondary = primaryAction?.secondary && primaryAction.secondary.length > 0;

	// ⌘⇧F focuses the toolbar search (when one is provided)
	const searchRef = useRef<HTMLInputElement>(null);
	const scSearch = useShortcut("entitySearch");
	useEffect(() => {
		if (!search) return;
		function handler(e: KeyboardEvent) {
			if (matchesShortcut(e, scSearch)) {
				e.preventDefault();
				searchRef.current?.focus();
				searchRef.current?.select();
			}
		}
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [search, scSearch]);

	return (
		<div className="flex h-full min-w-0 flex-col">
			{/* Toolbar — slim, 40px row */}
			<div className="flex h-10 shrink-0 items-center gap-2 border-b bg-background px-3">
				<div className="flex min-w-0 flex-1 items-center gap-1.5">
					{search && (
						<div data-tour="entity-search" className="relative flex items-center">
							<SearchIcon className="pointer-events-none absolute start-2 size-3.5 text-muted-foreground" />
							<Input
								ref={searchRef}
								// type="text" (NOT "search") — browsers render their own
								// clear "×" inside type="search" inputs, which collides
								// with our own clear button on the right. Using "text"
								// gives us full control over the affordance.
								type="text"
								value={search.value}
								onChange={(e) => search.onChange(e.target.value)}
								placeholder={search.placeholder ?? "Search…"}
								className="h-7 w-48 ps-7 pe-7 text-xs"
							/>
							{search.value && (
								<button
									type="button"
									onClick={() => search.onChange("")}
									aria-label="Clear search"
									className="absolute end-1 flex size-5 items-center justify-center rounded-[var(--radius)] text-muted-foreground hover:bg-accent"
								>
									<XIcon className="size-3" />
								</button>
							)}
						</div>
					)}
				</div>

				<div className="flex shrink-0 items-center gap-1.5">
					{/* View options first (gated to board view by parent), then view-toggle, then primary action.
					    Skip the view-toggle entirely when the consumer doesn't pass any views (e.g. NotesView,
					    which owns its own two-icon Category/Board toggle in toolbarExtras). */}
					{toolbarExtras}
					{views.length > 0 && (
						<ViewToggleIcons view={view} onViewChange={onViewChange} views={views} />
					)}

					{showPrimary && (
						<div className="flex items-center">
							<Button
								size="sm"
								onClick={primaryAction.onClick}
								data-tour="entity-create"
								className={cn(
									"h-7 gap-1 px-2 text-xs sm:px-3",
									hasSecondary && "rounded-e-none",
								)}
								aria-label={primaryAction.label}
							>
								{primaryAction.icon ? (
									<primaryAction.icon className="size-3.5" />
								) : (
									<PlusIcon className="size-3.5" />
								)}
								<span className="hidden sm:inline">{primaryAction.label}</span>
							</Button>
							{hasSecondary && (
								<DropdownMenu>
									<DropdownMenuTrigger asChild>
										<Button
											size="icon"
											className="h-7 w-6 rounded-s-none border-s border-s-primary-foreground/20"
											aria-label="More actions"
										>
											<ChevronDownIcon className="size-3" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										{primaryAction.secondary?.map((s) => (
											<SecondaryItem key={s.label} item={s} orgId={orgId} />
										))}
									</DropdownMenuContent>
								</DropdownMenu>
							)}
						</div>
					)}
				</div>
			</div>

			{/* Body */}
			<div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
		</div>
	);
}

function SecondaryItem({
	item,
	orgId,
}: {
	item: NonNullable<PrimaryActionConfig["secondary"]>[number];
	orgId?: Id<"orgs">;
}) {
	const hasPermission = useOrgPermission(orgId, item.permission ?? "");
	if (item.permission && hasPermission !== true) return null;
	return (
		<DropdownMenuItem onSelect={item.onSelect}>
			{item.icon && <item.icon className="me-2 size-4" />}
			{item.label}
		</DropdownMenuItem>
	);
}
