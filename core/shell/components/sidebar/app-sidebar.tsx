"use client";

import Link from "next/link";
import { usePathname as useNextPathname } from "next/navigation";
import { usePathname as useIntlPathname } from "@/i18n/navigation";
import { Maximize, Minimize, Moon, Sun, Languages, Check } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";

import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, SidebarSeparator, useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";
import { persistPreference } from "@/lib/preferences/preferences-storage";
import { buildNavigation, DEFAULT_MODULES, type NavGroup } from "@/core/shell/config/navigation";
import { useShortcut, matchesShortcut } from "@/stores/shortcuts/shortcuts-store";
import { NavUser } from "./nav-user";
import { WorkspaceSwitcher } from "./workspace-switcher";

export function AppSidebar({
  orgSlug,
  ...props
}: React.ComponentProps<typeof Sidebar> & { orgSlug?: string }) {
  const sidebar_variant = usePreferencesStore((s) => s.sidebar_variant);
  const sidebar_collapsible = usePreferencesStore((s) => s.sidebar_collapsible);
  const pathname = useNextPathname();
  const navGroups = buildNavigation(orgSlug ?? "", DEFAULT_MODULES);

  return (
    <Sidebar {...props} variant={sidebar_variant} collapsible={sidebar_collapsible}>
      <SidebarHeader className="py-2">
        <WorkspaceSwitcher currentOrgSlug={orgSlug ?? ""} />
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {navGroups.map((group) => (
          <NavGroupSection key={group.id} group={group} pathname={pathname} />
        ))}
      </SidebarContent>

      <SidebarFooter className="py-2 gap-0">
        <SidebarFooterUtils />
        <SidebarSeparator className="my-1" />
        <NavUser orgSlug={orgSlug} />
      </SidebarFooter>
    </Sidebar>
  );
}

// ─── Footer Utilities ─────────────────────────────────────────────────────────

function SidebarFooterUtils() {
  const { state } = useSidebar();
  const isExpanded = state === "expanded";

  /**
   * Smooth transition fix:
   * flex-direction is not animatable. Instead we use a grid with
   * grid-template-columns: when expanded → 3 equal columns (row),
   * when collapsed → 1 column (stack). grid-template-columns IS animatable.
   */
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: isExpanded ? "repeat(3, 1fr)" : "1fr",
        transition: "grid-template-columns 200ms ease",
        padding: isExpanded ? "4px 8px" : "4px 0",
        justifyItems: "center",
        gap: "2px",
      }}
    >
      <ThemeToggleButton />
      <FullscreenToggleButton />
      <LanguageDropdownButton />
    </div>
  );
}

// ─── Theme: 2-state toggle ────────────────────────────────────────────────────

function ThemeToggleButton() {
  const theme_mode = usePreferencesStore((s) => s.theme_mode);
  const resolvedThemeMode = usePreferencesStore((s) => s.resolvedThemeMode);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);
  const sc = useShortcut("toggleTheme");

  const resolved = resolvedThemeMode ?? theme_mode;
  const next = resolved === "dark" ? "light" : "dark";
  const Icon = resolved === "dark" ? Sun : Moon;
  const label = resolved === "dark" ? "Switch to Light" : "Switch to Dark";

  const toggle = useCallback(() => {
    setThemeMode(next);
    void persistPreference("theme_mode", next);
  }, [next, setThemeMode]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (matchesShortcut(e, sc)) { e.preventDefault(); toggle(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sc, toggle]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button" onClick={toggle} aria-label={label}
          className="flex size-7 shrink-0 items-center justify-center rounded-[--radius] text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          <Icon className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-1">
        {label} <SidebarKbd>{sc.display}</SidebarKbd>
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Fullscreen toggle ────────────────────────────────────────────────────────

function FullscreenToggleButton() {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const sc = useShortcut("toggleFullscreen");

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggle = useCallback(() => {
    if (!document.fullscreenElement) void document.documentElement.requestFullscreen();
    else void document.exitFullscreen();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (matchesShortcut(e, sc)) { e.preventDefault(); toggle(); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sc, toggle]);

  const Icon = isFullscreen ? Minimize : Maximize;
  const label = isFullscreen ? "Exit fullscreen" : "Enter fullscreen";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button" onClick={toggle} aria-label={label}
          className="flex size-7 shrink-0 items-center justify-center rounded-[--radius] text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
        >
          <Icon className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-1">
        {label} <SidebarKbd>{sc.display}</SidebarKbd>
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Language switcher ────────────────────────────────────────────────────────

const LOCALES = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "ar", label: "العربية", dir: "rtl" },
] as const;

function LanguageDropdownButton() {
  const locale = useLocale();
  const router = useRouter();
  // Use next-intl's usePathname — returns path WITHOUT locale prefix
  const pathname = useIntlPathname();

  const switchLocale = (next: string) => {
    router.replace(pathname, { locale: next });
    document.documentElement.dir = next === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = next;
  };

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button" aria-label="Switch language"
              className="flex size-7 shrink-0 items-center justify-center rounded-[--radius] text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
            >
              <Languages className="size-4" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">Language</TooltipContent>
      </Tooltip>

      <DropdownMenuContent side="right" align="end" className="min-w-36">
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => switchLocale(l.code)}
            className="flex items-center justify-between gap-3"
            dir={l.dir}
          >
            <span>{l.label}</span>
            {locale === l.code && <Check className="size-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Nav Group Section ────────────────────────────────────────────────────────

function NavGroupSection({ group, pathname }: { group: NavGroup; pathname: string }) {
  return (
    <SidebarGroup className="py-1">
      {group.label && <SidebarGroupLabel className="h-6 px-2">{group.label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {group.items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton
                asChild
                isActive={item.url === pathname || (item.url.length > 1 && pathname.startsWith(item.url + "/"))}
                tooltip={item.title}
                className="h-8"
              >
                <Link prefetch={false} href={item.url}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

/** Kbd badge inside sidebar tooltips — white text on dark tooltip bg */
function SidebarKbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-white/20 bg-white/10 px-1 py-0.5 font-mono text-[10px] leading-none text-white">
      {children}
    </kbd>
  );
}
