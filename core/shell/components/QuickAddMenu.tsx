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
 * ROUTING MODEL:
 *   Clicking "New lead" (or any create-*) navigates to that entity's page
 *   with `?new=1` appended. The view listens for the query param via
 *   `useQuickAddListener` and auto-opens its Add drawer. This makes the
 *   + menu work from anywhere in the app — dashboard, settings, other
 *   entity pages — without mounting every drawer globally.
 *
 *   For actions that aren't tied to a specific page (convert-lead, task),
 *   we still dispatch a plain window event that can be listened for locally.
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
import { useParams, useSearchParams } from "next/navigation";
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
import { useRouter } from "@/i18n/navigation";

export type QuickAddAction =
	| "create-lead"
	| "create-contact"
	| "create-deal"
	| "create-company"
	| "create-followup"
	| "create-task"
	| "convert-lead";

export const QUICK_ADD_EVENT = "quickadd";

/** Map a create-* action to the slug of the entity its view lives under. */
function slugForAction(
	action: QuickAddAction,
	labels: ReturnType<typeof useEntityLabels>,
): { slug: string; slot: "lead" | "contact" | "deal" | "company" } | null {
	switch (action) {
		case "create-lead":
			return { slug: labels.lead.slug, slot: "lead" };
		case "create-contact":
			return { slug: labels.contact.slug, slot: "contact" };
		case "create-deal":
			return { slug: labels.deal.slug, slot: "deal" };
		case "create-company":
			return { slug: labels.company.slug, slot: "company" };
		default:
			return null;
	}
}

/**
 * Fire a quick-add action. Consumers listen with `useQuickAddListener`.
 * Only used by non-routing actions like follow-ups and task creation.
 */
export function fireQuickAdd(action: QuickAddAction) {
	window.dispatchEvent(new CustomEvent(QUICK_ADD_EVENT, { detail: action }));
}

/**
 * Listen for a quick-add action. Handles BOTH sources:
 *   1. In-page `window.dispatchEvent(quickadd)` (local invocation).
 *   2. `?new=1` or `?quickadd=<action>` URL param (cross-page invocation).
 *
 * Each view listens for its own action; the param-driven path only fires on
 * mount when the URL matches — so navigating to `?new=1` always triggers the
 * right drawer exactly once.
 */
export function useQuickAddListener(action: QuickAddAction, handler: () => void) {
	const searchParams = useSearchParams();

	useEffect(() => {
		function listener(e: Event) {
			if ((e as CustomEvent<QuickAddAction>).detail === action) {
				handler();
			}
		}
		window.addEventListener(QUICK_ADD_EVENT, listener as EventListener);
		return () => window.removeEventListener(QUICK_ADD_EVENT, listener as EventListener);
	}, [action, handler]);

	// URL-param auto-open — `create-<slot>` + `?new=1` triggers the listener
	// on mount. We strip the param once we've handled it so a refresh doesn't
	// re-open the drawer.
	useEffect(() => {
		if (!searchParams) return;
		const newParam = searchParams.get("new");
		const quickadd = searchParams.get("quickadd");
		const matchesNew =
			newParam === "1" &&
			(action === "create-lead" ||
				action === "create-contact" ||
				action === "create-deal" ||
				action === "create-company");
		const matchesQuickadd = quickadd === action;
		if (!matchesNew && !matchesQuickadd) return;

		handler();

		// Strip the param without a navigation.
		if (typeof window !== "undefined") {
			const url = new URL(window.location.href);
			url.searchParams.delete("new");
			url.searchParams.delete("quickadd");
			window.history.replaceState(null, "", url.toString());
		}
	}, [searchParams, action, handler]);
}

export function QuickAddMenu() {
	const labels = useEntityLabels();
	const router = useRouter();
	const params = useParams();
	const orgSlug = params?.orgSlug as string | undefined;
	const [open, setOpen] = useState(false);

	const choose = (action: QuickAddAction) => {
		setOpen(false);

		const route = slugForAction(action, labels);
		if (route && orgSlug) {
			// Navigate to the entity page with `?new=1` so the view auto-opens
			// its Add drawer. Works from anywhere (dashboard, settings, …).
			router.push(`/${orgSlug}/${route.slug}?new=1`);
			return;
		}

		// Non-routing actions (convert, follow-up, task) still use the in-page
		// event bus. If no handler is listening, the event is silently dropped —
		// that's intentional: those actions are view-scoped.
		queueMicrotask(() => fireQuickAdd(action));
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger asChild>
						<Button
							size="icon"
							aria-label="Quick create"
							className="size-8"
							data-tour="quick-add"
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
