"use client";
/**
 * core/ai/components/composer/SlashCommands.tsx
 *
 * Sprint 5 — power-user shortcut palette. Opens above the composer
 * when the textarea's first character is `/`. Selecting a command
 * expands it as a prefix in the textarea — no backend change, just
 * a typing convenience.
 *
 * Available commands:
 *   /find    "Find ..."
 *   /create  "Create a new ..."
 *   /summary "Summarise ..."
 *   /remind  "Remind me to ..."
 *
 * Adding more is one line in `SLASH_COMMANDS`. The palette filters by
 * the substring the user has typed after `/`, so `/cre` will surface
 * `/create` quickly.
 */

import { Plus, RefreshCcw, Search, Sparkles } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef } from "react";

export type SlashCommand = {
	trigger: string;
	description: string;
	expansion: string;
	icon: ReactNode;
};

export const SLASH_COMMANDS: ReadonlyArray<SlashCommand> = [
	{
		trigger: "/find",
		description: "Search across leads, contacts, deals",
		expansion: "Find ",
		icon: <Search className="size-3.5" />,
	},
	{
		trigger: "/create",
		description: "Create a new record",
		expansion: "Create a new ",
		icon: <Plus className="size-3.5" />,
	},
	{
		trigger: "/summary",
		description: "Summarise this entity",
		expansion: "Summarise ",
		icon: <Sparkles className="size-3.5" />,
	},
	{
		trigger: "/remind",
		description: "Set a reminder",
		expansion: "Remind me to ",
		icon: <RefreshCcw className="size-3.5" />,
	},
];

interface Props {
	/** Current draft content. */
	draft: string;
	/** Called with the new draft after the user picks a command. */
	onPick: (newDraft: string) => void;
}

export function SlashCommands({ draft, onPick }: Props) {
	const trimmed = draft.trimStart();
	const isOpen = trimmed.startsWith("/");
	const filterRef = useRef<HTMLDivElement>(null);

	const filtered = useMemo(() => {
		if (!isOpen) return [];
		const q = trimmed.slice(1).split(/\s/, 1)[0]?.toLowerCase() ?? "";
		if (!q) return SLASH_COMMANDS;
		return SLASH_COMMANDS.filter(
			(c) =>
				c.trigger.slice(1).toLowerCase().startsWith(q) ||
				c.description.toLowerCase().includes(q),
		);
	}, [isOpen, trimmed]);

	// ESC closes (handled by the textarea losing focus or the user typing
	// a non-`/` first char). We don't manage open state — the open-ness
	// derives directly from the draft.

	useEffect(() => {
		// no-op — keeps lint happy
		void filterRef;
	}, []);

	if (!isOpen || filtered.length === 0) return null;

	return (
		<div
			ref={filterRef}
			className="absolute bottom-full start-3 end-3 z-20 mb-2 rounded-[var(--radius)] border border-border bg-popover py-1 shadow-md"
			role="listbox"
		>
			{filtered.map((c) => (
				<button
					key={c.trigger}
					type="button"
					onClick={() => onPick(c.expansion)}
					className="flex w-full items-center gap-2 px-2.5 py-1.5 text-start text-xs hover:bg-muted/60 transition-colors"
				>
					<span className="flex size-6 shrink-0 items-center justify-center rounded-[calc(var(--radius)-2px)] bg-muted text-muted-foreground">
						{c.icon}
					</span>
					<span className="font-mono text-[11px] text-primary">{c.trigger}</span>
					<span className="ms-auto truncate text-[11px] text-muted-foreground">
						{c.description}
					</span>
				</button>
			))}
		</div>
	);
}
