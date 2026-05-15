"use client";

import { useQuery } from "convex/react";
import { Check, Languages, Maximize, Minimize, Moon, Sun } from "lucide-react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarSeparator,
	useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";
import {
	buildNavigation,
	DEFAULT_MODULES,
	type ModuleConfig,
	type NavGroup,
} from "@/core/shell/config/navigation";
import { usePathname as useIntlPathname, useRouter } from "@/i18n/navigation";
import { persistPreference } from "@/lib/preferences/preferences-storage";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";
import { matchesShortcut, useShortcut } from "@/stores/shortcuts/shortcuts-store";
import { NavUser } from "./nav-user";
import { WorkspaceSwitcher } from "./workspace-switcher";

export function AppSidebar({
	orgSlug,
	...props
}: React.ComponentProps<typeof Sidebar> & { orgSlug?: string }) {
	const sidebar_variant = usePreferencesStore((s) => s.sidebar_variant);
	const sidebar_collapsible = usePreferencesStore((s) => s.sidebar_collapsible);
	// next-intl's usePathname returns the locale-stripped path (e.g. "/acme/leads")
	// which matches the URLs produced by buildNavigation(). Using Next's raw
	// usePathname would prefix the locale ("/en/acme/leads") and break the
	// active-route comparison below.
	const pathname = useIntlPathname();

	// Entity labels come from the org's saved config (Convex-reactive).
	// Rename "Lead" → "Inquiry" in Settings and the sidebar updates instantly.
	// Defaults are returned while the query is in-flight so the UI never flashes blank.
	const labels = useEntityLabels();

	// Also read the per-module visibility flags + order overrides from the same
	// org settings. Users can toggle a module off (e.g. freelancers hide
	// "Companies") or drag-reorder the sidebar — both flow through this memo.
	const orgs = useQuery(api.orgs.queries.listMyOrgs);
	const orgEntry = orgs?.find((o) => o.org.slug === orgSlug);
	const moduleOverrides = useMemo(() => {
		const overrides = new Map<string, { hidden?: boolean; order?: number; label?: string }>();
		for (const mod of orgEntry?.org.settings?.modules ?? []) {
			overrides.set(mod.slot, {
				hidden: mod.hidden,
				order: mod.order,
				label: mod.label,
			});
		}
		return overrides;
	}, [orgEntry]);

	// Build a label-aware, hidden-aware module list. We keep DEFAULT_MODULES'
	// icons as the base and override label + slug + order + enabled from org
	// config. Any module marked `hidden` is filtered out entirely.
	const modules = useMemo<ModuleConfig[]>(() => {
		return DEFAULT_MODULES.map((m) => {
			const slot =
				m.type === "leads"
					? "lead"
					: m.type === "contacts"
						? "contact"
						: m.type === "deals"
							? "deal"
							: "company";
			const override = moduleOverrides.get(slot);
			return {
				...m,
				label: override?.label ?? labels[slot].plural,
				slug: labels[slot].slug,
				order: override?.order ?? m.order,
				enabled: m.enabled && override?.hidden !== true,
			};
		});
	}, [labels, moduleOverrides]);

	const navGroups = buildNavigation(orgSlug ?? "", modules);

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
	const { state, isMobile } = useSidebar();
	// When the sidebar is rendered as the mobile Sheet the full content is
	// always visible regardless of the `state` flag (which tracks the
	// desktop open/closed state). Treat that case as "expanded" so the
	// three footer icons sit on one row with space-between instead of
	// stacking vertically the way they do in the desktop icon rail.
	const isExpanded = isMobile || state === "expanded";

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
			if (matchesShortcut(e, sc)) {
				e.preventDefault();
				toggle();
			}
		}
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [sc, toggle]);

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					onClick={toggle}
					aria-label={label}
					className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius)] text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
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
			if (matchesShortcut(e, sc)) {
				e.preventDefault();
				toggle();
			}
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
					type="button"
					onClick={toggle}
					aria-label={label}
					className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius)] text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
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
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					aria-label="Switch language"
					className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius)] cursor-pointer text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
				>
					<Languages className="size-4" />
				</button>
			</DropdownMenuTrigger>

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
	/**
	 * A nav item matches when it is the current page, OR the current path is
	 * a descendant of it. The descendant rule only applies to items that
	 * actually have a sub-path beyond the workspace root — otherwise the
	 * Dashboard entry (url = `/${orgSlug}`) would light up on every inner
	 * route because every CRM URL starts with `/${orgSlug}/`.
	 */
	function isItemActive(itemUrl: string): boolean {
		if (itemUrl === pathname) return true;
		// Count meaningful path segments. `/acme` → 1 segment, `/acme/leads` → 2.
		// Only items with ≥ 2 segments are allowed to match descendants.
		const segmentCount = itemUrl.split("/").filter(Boolean).length;
		if (segmentCount < 2) return false;
		return pathname.startsWith(`${itemUrl}/`);
	}

	return (
		<SidebarGroup className="py-1">
			{group.label && (
				// `group-data-[collapsible=icon]:hidden` fully unmounts the
				// label when the sidebar collapses to icon mode. The shadcn
				// default uses `-mt-8 + opacity-0` to retract an h-8 label,
				// but our `h-6` override breaks that math and the label leaks
				// up into the workspace switcher area, blocking clicks. Using
				// `display: none` (via `hidden`) is the unambiguous fix and
				// matches the pattern already used elsewhere in the sidebar
				// (menu-action, badge, sub-menu).
				<SidebarGroupLabel className="h-6 px-2 group-data-[collapsible=icon]:hidden">
					{group.label}
				</SidebarGroupLabel>
			)}
			<SidebarGroupContent>
				<SidebarMenu>
					{group.items.map((item) => (
						<SidebarMenuItem key={item.url}>
							<SidebarMenuButton
								asChild
								isActive={isItemActive(item.url)}
								tooltip={item.title}
								className="h-8"
							>
								<Link href={item.url}>
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
