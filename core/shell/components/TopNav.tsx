"use client";

import { useEffect, useState } from "react";
import { Bell, Bot, Search, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useShortcut, matchesShortcut } from "@/stores/shortcuts/shortcuts-store";
import { AutoBreadcrumb } from "./AutoBreadcrumb";
import { useNavSlotNode } from "@/core/shell/context/nav-slot-context";

/**
 * TopNav — Icon-only top navigation bar.
 *
 * Left:  sidebar trigger (⌘B by default, editable) + page-specific slot
 * Right: search + notifications + separator + AI chat toggle
 *
 * All shortcuts read from useShortcutsStore — editing /settings/shortcuts
 * updates tooltips here instantly.
 */
export function TopNav({
  onToggleChat,
  onToggleSearch,
  onToggleNotifications,
}: {
  onToggleChat?: () => void;
  onToggleSearch?: () => void;
  onToggleNotifications?: () => void;
}) {
  const scAI    = useShortcut("toggleAIPanel");
  const scSearch = useShortcut("search");
  const slot = useNavSlotNode();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (matchesShortcut(e, scAI))    { e.preventDefault(); onToggleChat?.(); }
      if (matchesShortcut(e, scSearch)) { e.preventDefault(); onToggleSearch?.(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [scAI, scSearch, onToggleChat, onToggleSearch]);

  return (
    <header
      className={cn(
        "flex h-12 shrink-0 items-center gap-2 border-b rounded-t-[var(--radius)] transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12",
        "[html[data-navbar-style=sticky]_&]:sticky [html[data-navbar-style=sticky]_&]:top-0 [html[data-navbar-style=sticky]_&]:z-50 [html[data-navbar-style=sticky]_&]:bg-background/80 [html[data-navbar-style=sticky]_&]:backdrop-blur-md",
      )}
    >
      <div className="relative flex w-full items-center px-4 lg:px-6">
        {/* Left: trigger + breadcrumb */}
        <div className="flex shrink-0 items-center gap-2">
          <SidebarTriggerWithTooltip />
          <AutoBreadcrumb />
        </div>

        {/* Center: route-specific slot — absolutely centered so it never shifts left/right */}
        {slot && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="pointer-events-auto flex w-full max-w-2xl items-center gap-2 rounded-[var(--radius)] bg-muted/60 px-3 py-1.5">
              {slot}
            </div>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right */}
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon" variant="ghost"
                onClick={onToggleSearch}
                aria-label="Search"
                className="size-8 text-muted-foreground hover:text-foreground"
              >
                <Search className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="flex items-center gap-1">
              Search <Kbd>{scSearch.display}</Kbd>
            </TooltipContent>
          </Tooltip>

          <NotificationBell onToggleNotifications={onToggleNotifications} />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon" variant="ghost"
                onClick={onToggleChat}
                aria-label="Toggle AI Assistant"
                className="size-8 text-muted-foreground hover:text-foreground"
              >
                <Bot className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="flex items-center gap-1">
              AI Assistant <Kbd>{scAI.display}</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </header>
  );
}

/** Sidebar trigger reads its shortcut from the store */
function SidebarTriggerWithTooltip() {
  const sc = useShortcut("toggleSidebar");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <SidebarTrigger className="-ms-1" />
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-1">
        Toggle sidebar <Kbd>{sc.display}</Kbd>
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Notification Bell ────────────────────────────────────────────────────────

const MOCK_NOTIFICATIONS = [
  { id: "1", title: "New lead assigned",     body: "Ahmad Al-Rashid was assigned to you", time: "2m ago",  read: false },
  { id: "2", title: "Deal moved to Proposal", body: "Dubai Marina deal advanced",          time: "1h ago",  read: false },
  { id: "3", title: "Reminder due",           body: "Follow up with Fatima Hassan",        time: "3h ago",  read: true  },
];

function NotificationBell({ onToggleNotifications }: { onToggleNotifications?: () => void }) {
  const [open, setOpen] = useState(false);
  const sc = useShortcut("notifications");
  const unread = MOCK_NOTIFICATIONS.filter((n) => !n.read).length;

  // Wire keyboard shortcut directly to toggle this popover
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (matchesShortcut(e, sc)) {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sc]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              size="icon" variant="ghost"
              aria-label="Notifications"
              className="relative size-8 text-muted-foreground hover:text-foreground"
            >
              <Bell className="size-4" />
              {unread > 0 && (
                <span className="absolute top-1.5 end-1.5 size-2 rounded-full bg-destructive" />
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="flex items-center gap-1">
          Notifications <Kbd>{sc.display}</Kbd>
        </TooltipContent>
      </Tooltip>

      <PopoverContent align="end" className="w-80 p-0" sideOffset={8}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">Notifications</span>
          {unread > 0 && (
            <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <CheckCheck className="size-3.5" />
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-80 overflow-y-auto">
          {MOCK_NOTIFICATIONS.map((n) => (
            <div
              key={n.id}
              className={cn(
                "flex gap-3 px-4 py-3 border-b last:border-0 cursor-pointer hover:bg-muted/50 transition-colors",
                !n.read && "bg-muted/30",
              )}
            >
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", !n.read ? "bg-primary" : "bg-transparent")} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-tight">{n.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{n.body}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">{n.time}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t px-4 py-2.5">
          <button type="button" className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors">
            View all notifications
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Kbd badge — explicit foreground so it's always visible regardless of tooltip bg */
function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-white/20 bg-white/10 px-1 py-0.5 font-mono text-[10px] leading-none text-white">
      {children}
    </kbd>
  );
}
