"use client";

import { Kbd } from "@/components/ui/kbd";
import { type EntityLabels, useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import { SettingsRow } from "../shared/SettingsRow";
import { SettingsSection } from "../shared/SettingsSection";

type Shortcut = { keys: string[]; description: string };
type ShortcutSection = {
	id: string;
	title: string;
	description: string;
	shortcuts: Shortcut[];
};

/**
 * Build the shortcut registry for the given entity labels.
 *
 * Navigation shortcuts read entity plurals so that "Go to Leads" becomes
 * "Go to Inquiries" once an admin renames the lead slot. Every other section
 * (Actions / Table / Record) is free of entity-specific copy.
 */
function buildSections(labels: EntityLabels): ShortcutSection[] {
	return [
		{
			id: "navigation",
			title: "Navigation",
			description: "Keyboard shortcuts for moving between pages.",
			shortcuts: [
				{ keys: ["G", "H"], description: "Go to Home" },
				{ keys: ["G", "L"], description: `Go to ${labels.lead.plural}` },
				{ keys: ["G", "C"], description: `Go to ${labels.contact.plural}` },
				{ keys: ["G", "D"], description: `Go to ${labels.deal.plural}` },
				{ keys: ["G", "O"], description: `Go to ${labels.company.plural}` },
				{ keys: ["G", "S"], description: "Go to Settings" },
			],
		},
		{
			id: "actions",
			title: "Actions",
			description: "Global action shortcuts available from any page.",
			shortcuts: [
				{ keys: ["⌘", "K"], description: "Open command palette" },
				{ keys: ["C"], description: "Create new record" },
				{ keys: ["⌘", "/"], description: "Toggle AI chat" },
				{ keys: ["Esc"], description: "Close dialog / panel" },
			],
		},
		{
			id: "table",
			title: "Table & List",
			description: "Shortcuts for navigating and selecting rows.",
			shortcuts: [
				{ keys: ["J"], description: "Select next row" },
				{ keys: ["K"], description: "Select previous row" },
				{ keys: ["Enter"], description: "Open selected record" },
				{ keys: ["⌘", "A"], description: "Select all rows" },
				{ keys: ["Delete"], description: "Delete selected" },
			],
		},
		{
			id: "record",
			title: "Record Detail",
			description: "Shortcuts when viewing a record.",
			shortcuts: [
				{ keys: ["E"], description: "Edit record" },
				{ keys: ["N"], description: "Add note" },
				{ keys: ["R"], description: "Add reminder" },
				{ keys: ["⌘", "S"], description: "Save changes" },
			],
		},
	];
}

function KeyCombo({ keys }: { keys: string[] }) {
	return (
		<div className="flex items-center justify-end gap-1">
			{keys.map((k, i) => (
				// Keys within a single combo are unique in our registry (no "G G")
				// so `k` alone is a safe, stable React key.
				<span key={k} className="flex items-center gap-1">
					<Kbd>{k}</Kbd>
					{i < keys.length - 1 && (
						<span className="text-[10px] text-muted-foreground">then</span>
					)}
				</span>
			))}
		</div>
	);
}

/** Read-only reference page. Content tracks the workspace's entity labels. */
export function ShortcutsGroup() {
	const labels = useEntityLabels();
	const sections = buildSections(labels);

	return (
		<div className="grid gap-6">
			{sections.map((section) => (
				<SettingsSection
					key={section.id}
					id={`shortcuts.${section.id}`}
					title={section.title}
					description={section.description}
				>
					{section.shortcuts.map((s) => (
						<SettingsRow key={s.description} label={s.description} compact>
							<KeyCombo keys={s.keys} />
						</SettingsRow>
					))}
				</SettingsSection>
			))}
		</div>
	);
}
