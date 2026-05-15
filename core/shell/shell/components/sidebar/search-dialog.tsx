"use client";
import { LayoutDashboard } from "lucide-react";
import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";

/**
 * SearchDialog - Command palette.
 * Accepts external open/onOpenChange so TopNav button can trigger it.
 * Keyboard shortcut (⌘J) is handled by TopNav to avoid double-registration.
 */
export function SearchDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<CommandDialog open={open} onOpenChange={onOpenChange}>
			<Command>
				<CommandInput placeholder="Search leads, contacts, deals…" />
				<CommandList>
					<CommandEmpty>No results found.</CommandEmpty>
					<CommandGroup heading="Navigation">
						<CommandItem onSelect={() => onOpenChange(false)}>
							<LayoutDashboard />
							<span>Dashboard</span>
						</CommandItem>
					</CommandGroup>
				</CommandList>
			</Command>
		</CommandDialog>
	);
}
