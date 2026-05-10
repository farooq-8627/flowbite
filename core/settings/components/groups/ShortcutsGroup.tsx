import { Kbd } from "@/components/ui/kbd";
import { SettingsSection } from "../shared/SettingsSection";

type Shortcut = { keys: string[]; description: string };
type ShortcutSection = { id: string; title: string; description: string; shortcuts: Shortcut[] };

const SHORTCUT_SECTIONS: ShortcutSection[] = [
	{
		id: "navigation", title: "Navigation", description: "Keyboard shortcuts for moving between pages.",
		shortcuts: [
			{ keys: ["G", "H"],  description: "Go to Home" },
			{ keys: ["G", "L"],  description: "Go to Leads" },
			{ keys: ["G", "C"],  description: "Go to Contacts" },
			{ keys: ["G", "D"],  description: "Go to Deals" },
			{ keys: ["G", "O"],  description: "Go to Companies" },
			{ keys: ["G", "S"],  description: "Go to Settings" },
		],
	},
	{
		id: "actions", title: "Actions", description: "Global action shortcuts available from any page.",
		shortcuts: [
			{ keys: ["⌘", "K"],  description: "Open command palette" },
			{ keys: ["C"],       description: "Create new record" },
			{ keys: ["⌘", "/"],  description: "Toggle AI chat" },
			{ keys: ["Esc"],     description: "Close dialog / panel" },
		],
	},
	{
		id: "table", title: "Table & List", description: "Shortcuts for navigating and selecting rows.",
		shortcuts: [
			{ keys: ["J"],       description: "Select next row" },
			{ keys: ["K"],       description: "Select previous row" },
			{ keys: ["Enter"],   description: "Open selected record" },
			{ keys: ["⌘", "A"],  description: "Select all rows" },
			{ keys: ["Delete"],  description: "Delete selected" },
		],
	},
	{
		id: "record", title: "Record Detail", description: "Shortcuts when viewing a record.",
		shortcuts: [
			{ keys: ["E"],       description: "Edit record" },
			{ keys: ["N"],       description: "Add note" },
			{ keys: ["R"],       description: "Add reminder" },
			{ keys: ["⌘", "S"],  description: "Save changes" },
		],
	},
];

/** Read-only reference page. No mutations, no queries. Same for all workspaces and roles. */
export function ShortcutsGroup() {
	return (
		<div className="grid gap-6">
			{SHORTCUT_SECTIONS.map((section) => (
				<SettingsSection key={section.id} id={`shortcuts.${section.id}`} title={section.title} description={section.description}>
					<div className="grid gap-y-2">
						{section.shortcuts.map((s) => (
							<div key={s.description} className="flex items-center justify-between py-1">
								<span className="text-sm text-muted-foreground">{s.description}</span>
								<div className="flex items-center gap-1">
									{s.keys.map((k, i) => (
										<span key={i} className="flex items-center gap-1">
											<Kbd>{k}</Kbd>
											{i < s.keys.length - 1 && <span className="text-xs text-muted-foreground">then</span>}
										</span>
									))}
								</div>
							</div>
						))}
					</div>
				</SettingsSection>
			))}
		</div>
	);
}
