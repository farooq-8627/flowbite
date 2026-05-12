/**
 * Keyboard Shortcuts Store
 *
 * Single source of truth for all keyboard shortcuts.
 * Shortcuts are editable from /[orgSlug]/settings/shortcuts.
 * Tooltips read from this store — updating a shortcut updates all tooltips instantly.
 *
 * Format:
 *   - `meta`: require ⌘ (Mac) / Ctrl (Win/Linux).
 *   - `shift`: optional second modifier; combined with `meta` for combos like ⌘⇧L.
 *   - `key`: single character or F-key name.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ShortcutDef {
	/** Human-readable action name */
	label: string;
	/** The key (e.g. "b", ".", "k") */
	key: string;
	/** Whether ⌘/Ctrl is required */
	meta?: boolean;
	/** Whether Shift is required */
	shift?: boolean;
	/** Display string shown in tooltips, e.g. "⌘B" or "⌘⇧L" */
	display: string;
}

export type ShortcutId =
	| "toggleSidebar"
	| "toggleAIPanel"
	| "search"
	| "notifications"
	| "toggleTheme"
	| "toggleFullscreen"
	// Entity-page shortcuts (require shift to avoid collisions with core bindings)
	| "toggleView"
	| "entitySearch"
	| "gotoLeads"
	| "gotoContacts"
	| "gotoDeals"
	| "gotoCompanies";

export type ShortcutsMap = Record<ShortcutId, ShortcutDef>;

/**
 * Shortcut key assignments:
 *  ⌘B  — Toggle Sidebar
 *  ⌘.  — Toggle AI Panel
 *  ⌘K  — Search (global command palette)
 *  ⌘A  — Notifications
 *  ⌘D  — Toggle Theme
 *  ⌘E  — Toggle Fullscreen
 *  ⌘⇧V — Toggle view (list/board) on entity page
 *  ⌘⇧F — Focus entity-page search field
 *  ⌘⇧L — Go to Leads
 *  ⌘⇧N — Go to Contacts (N = coNtact, C collides with copy)
 *  ⌘⇧D — Go to Deals
 *  ⌘⇧O — Go to Companies (O = orgs/cOmpanies)
 */
const DEFAULTS: ShortcutsMap = {
	toggleSidebar: { label: "Toggle Sidebar", key: "b", meta: true, display: "⌘B" },
	toggleAIPanel: { label: "Toggle AI Panel", key: ".", meta: true, display: "⌘." },
	search: { label: "Search", key: "k", meta: true, display: "⌘K" },
	notifications: { label: "Notifications", key: "a", meta: true, display: "⌘A" },
	toggleTheme: { label: "Toggle Theme", key: "d", meta: true, display: "⌘D" },
	toggleFullscreen: { label: "Toggle Fullscreen", key: "e", meta: true, display: "⌘E" },
	toggleView: {
		label: "Toggle List / Board",
		key: "v",
		meta: true,
		shift: true,
		display: "⌘⇧V",
	},
	entitySearch: {
		label: "Search entity page",
		key: "f",
		meta: true,
		shift: true,
		display: "⌘⇧F",
	},
	gotoLeads: { label: "Go to Leads", key: "l", meta: true, shift: true, display: "⌘⇧L" },
	gotoContacts: {
		label: "Go to Contacts",
		key: "n",
		meta: true,
		shift: true,
		display: "⌘⇧N",
	},
	gotoDeals: { label: "Go to Deals", key: "d", meta: true, shift: true, display: "⌘⇧D" },
	gotoCompanies: {
		label: "Go to Companies",
		key: "o",
		meta: true,
		shift: true,
		display: "⌘⇧O",
	},
};

interface ShortcutsStore {
	shortcuts: ShortcutsMap;
	setShortcut: (id: ShortcutId, def: Partial<ShortcutDef>) => void;
	resetAll: () => void;
}

export const useShortcutsStore = create<ShortcutsStore>()(
	persist(
		(set) => ({
			shortcuts: DEFAULTS,
			setShortcut: (id, def) =>
				set((s) => ({
					shortcuts: {
						...s.shortcuts,
						[id]: { ...s.shortcuts[id], ...def },
					},
				})),
			resetAll: () => set({ shortcuts: DEFAULTS }),
		}),
		{
			// Bumped version because we added entity shortcuts + the `shift` flag.
			name: "orbitly-shortcuts-v3",
		},
	),
);

/** Returns the display string for a shortcut (e.g. "⌘B") */
export function useShortcut(id: ShortcutId): ShortcutDef {
	return useShortcutsStore((s) => s.shortcuts[id]);
}

/**
 * Checks if a KeyboardEvent matches a shortcut definition.
 * Used in useEffect keydown handlers.
 */
export function matchesShortcut(e: KeyboardEvent, def: ShortcutDef): boolean {
	const metaMatch = def.meta ? e.metaKey || e.ctrlKey : !e.metaKey && !e.ctrlKey;
	const shiftMatch = def.shift ? e.shiftKey : !e.shiftKey;
	return metaMatch && shiftMatch && e.key.toLowerCase() === def.key.toLowerCase();
}
