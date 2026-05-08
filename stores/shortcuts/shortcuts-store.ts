/**
 * Keyboard Shortcuts Store
 *
 * Single source of truth for all keyboard shortcuts.
 * Shortcuts are editable from /[orgSlug]/settings/shortcuts.
 * Tooltips read from this store — updating a shortcut updates all tooltips instantly.
 *
 * Format: modifier is always ⌘ (Mac) / Ctrl (Win/Linux). Key is a single character.
 * All shortcuts use meta: true so they require ⌘/Ctrl — no bare keys that conflict with browser.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ShortcutDef {
  /** Human-readable action name */
  label: string;
  /** The key (e.g. "b", ".", "k") */
  key: string;
  /** Whether ⌘/Ctrl is required (always true — bare keys conflict with browser) */
  meta?: boolean;
  /** Display string shown in tooltips, e.g. "⌘B" */
  display: string;
}

export type ShortcutId =
  | "toggleSidebar"
  | "toggleAIPanel"
  | "search"
  | "notifications"
  | "toggleTheme"
  | "toggleFullscreen";

export type ShortcutsMap = Record<ShortcutId, ShortcutDef>;

/**
 * Shortcut key assignments (all require ⌘/Ctrl):
 *  ⌘B  — Toggle Sidebar       (B = "bar")
 *  ⌘.  — Toggle AI Panel      (. = quick access)
 *  ⌘K  — Search               (universal command palette convention)
 *  ⌘N  — Notifications        (N = notifications; ⌘N opens new window only in some apps)
 *  ⌘D  — Toggle Theme         (D = dark/light)
 *  ⌘E  — Toggle Fullscreen    (E = expand; avoids ⌘F=find, ⌘T=tab, ⌘W=close)
 */
const DEFAULTS: ShortcutsMap = {
  toggleSidebar:    { label: "Toggle Sidebar",    key: "b", meta: true, display: "⌘B" },
  toggleAIPanel:    { label: "Toggle AI Panel",   key: ".", meta: true, display: "⌘." },
  search:           { label: "Search",            key: "k", meta: true, display: "⌘K" },
  notifications:    { label: "Notifications",     key: "a", meta: true, display: "⌘A" },
  toggleTheme:      { label: "Toggle Theme",      key: "d", meta: true, display: "⌘D" },
  toggleFullscreen: { label: "Toggle Fullscreen", key: "e", meta: true, display: "⌘E" },
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
    { name: "orbitly-shortcuts-v2" },
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
  return metaMatch && e.key === def.key;
}
