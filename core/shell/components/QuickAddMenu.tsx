"use client";

/**
 * QuickAddMenu — global "create anything" shortcut in the top nav.
 *
 * One + button before the search icon. When pressed (or keyboard-invoked via
 * the `quickAdd` shortcut) it opens a Command palette grouped by workflow:
 *
 *   Create ▸ Lead / Contact / Deal / Company
 *   Workflow ▸ Follow-up / Task / Convert lead
 *
 * Each item fires a `window.dispatchEvent(new CustomEvent('quickadd:<action>'))`
 * so views (e.g. LeadsView) can listen and open their drawer. This keeps the
 * menu decoupled from every drawer implementation.
 *
 * We use global events (not a React context) because the menu lives in
 * DashboardLayoutClient while the drawers live inside each entity view — they
 * are siblings, not parent/child, so props + context don't connect them.
 */

import {
	ArrowRightCircleIcon,
	BellIcon,
	Building2Icon,
	CheckSquareIcon,
	HandshakeIcon,
	PlusIcon,
	TargetIcon,
	UserIcon,
	UsersIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";

export type QuickAddAction =
	| "create-lead"
	| "create-contact"
	| "create-deal"
	| "create-company"
	| "create-followup"
	| "create-task"
	| "convert-lead";

export const QUICK_ADD_EVENT = "quickadd";

/**
 * Fire a quick-add action. Consumers listen with:
 *   useEffect(() => { const h = (e: CustomEvent) => {...}; window.addEventListener(QUICK_ADD_EVENT, h); ... })
 */
export function fireQuickAdd(action: QuickAddAction) {
	window.dispatchEvent(new CustomEvent(QUICK_ADD_EVENT, { detail: action }));
}

export function useQuickAddListener(action: QuickAddAction, handler: () => void) {
	useEffect(() => {
		function listener(e: Event) {
			if ((e as CustomEvent<QuickAddAction>).detail === action) {
				handler();
			}
		}
		window.addEventListener(QUICK_ADD_EVENT, listener as EventListener);
		return () => window.removeEventListener(QUICK_ADD_EVENT, listener as EventListener);
	}, [action, handler]);
}

export function QuickAddMenu() {
	const labels = useEntityLabels();
	const [open, setOpen] = useState(false);

	const choose = (action: QuickAddAction) => {
		setOpen(false);
		// Defer dispatch to next tick so the popover unmount finishes first and
		// doesn't race the drawer open — prevents focus-trap stacking issues.
		queueMicrotask(() => fireQuickAdd(action));
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button
							size="icon"
							variant="ghost"
							aria-label="Quick create"
							className="size-8 text-muted-foreground hover:text-foreground"
						>
							<PlusIcon className="size-4" />
						</Button>
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent side="bottom">Quick create</TooltipContent>
			</Tooltip>

			<PopoverContent align="end" className="w-72 p-0" sideOffset={8}>
				<Command>
					<CommandInput placeholder="What do you want to create?" />
					<CommandList className="max-h-80">
						<CommandEmpty>No matching action.</CommandEmpty>

						<CommandGroup heading="Create">
							<CommandItem onSelect={() => choose("create-lead")} className="text-xs">
								<TargetIcon className="me-2 size-3.5" />
								New {labels.lead.singular.toLowerCase()}
							</CommandItem>
							<CommandItem
								onSelect={() => choose("create-contact")}
								className="text-xs"
							>
								<UserIcon className="me-2 size-3.5" />
								New {labels.contact.singular.toLowerCase()}
							</CommandItem>
							<CommandItem onSelect={() => choose("create-deal")} className="text-xs">
								<HandshakeIcon className="me-2 size-3.5" />
								New {labels.deal.singular.toLowerCase()}
							</CommandItem>
							<CommandItem
								onSelect={() => choose("create-company")}
								className="text-xs"
							>
								<Building2Icon className="me-2 size-3.5" />
								New {labels.company.singular.toLowerCase()}
							</CommandItem>
						</CommandGroup>

						<CommandSeparator />

						<CommandGroup heading="Workflow">
							<CommandItem
								onSelect={() => choose("create-followup")}
								className="text-xs"
							>
								<BellIcon className="me-2 size-3.5" />
								New follow-up
							</CommandItem>
							<CommandItem onSelect={() => choose("create-task")} className="text-xs">
								<CheckSquareIcon className="me-2 size-3.5" />
								New task
							</CommandItem>
							<CommandItem
								onSelect={() => choose("convert-lead")}
								className="text-xs"
							>
								<ArrowRightCircleIcon className="me-2 size-3.5" />
								Convert {labels.lead.singular.toLowerCase()} to{" "}
								{labels.contact.singular.toLowerCase()}
							</CommandItem>
						</CommandGroup>

						<CommandSeparator />

						<CommandGroup heading="Team">
							<CommandItem
								onSelect={() => choose("create-lead")}
								className="text-xs text-muted-foreground"
							>
								<UsersIcon className="me-2 size-3.5" />
								Invite teammate (coming soon)
							</CommandItem>
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
