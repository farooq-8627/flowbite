"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useShortcutsStore, type ShortcutId, type ShortcutsMap } from "@/stores/shortcuts/shortcuts-store";

const SHORTCUT_ORDER: ShortcutId[] = [
  "toggleSidebar",
  "toggleAIPanel",
  "search",
  "notifications",
  "toggleTheme",
  "toggleFullscreen",
];

export function ShortcutsSettingsView() {
  const { shortcuts, setShortcut, resetAll } = useShortcutsStore();

  const handleKeyChange = (id: ShortcutId, key: string) => {
    const isFKey = /^F\d+$/.test(key);
    const display = isFKey ? key : `⌘${key.toUpperCase()}`;
    setShortcut(id, { key, display, meta: !isFKey });
  };

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Keyboard Shortcuts</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Customize shortcuts. Changes apply immediately and update all tooltips.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetAll} className="gap-1.5">
          <RotateCcw className="size-3.5" />
          Reset all
        </Button>
      </div>

      <div className="divide-y rounded-[var(--radius)] border">
        {SHORTCUT_ORDER.map((id) => {
          const s = shortcuts[id];
          return (
            <div key={id} className="flex items-center justify-between gap-4 px-4 py-3">
              <Label className="text-sm font-medium">{s.label}</Label>
              <div className="flex items-center gap-2">
                {s.meta && (
                  <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                    ⌘
                  </kbd>
                )}
                <Input
                  className="h-7 w-16 text-center font-mono text-xs"
                  value={s.key}
                  maxLength={4}
                  onChange={(e) => handleKeyChange(id, e.target.value)}
                  aria-label={`Shortcut key for ${s.label}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        For F-keys (F10, F11) the ⌘ modifier is not used. For letter keys, ⌘ is always applied.
      </p>
    </div>
  );
}
