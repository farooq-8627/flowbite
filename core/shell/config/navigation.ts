/**
 * Navigation Configuration — Dynamic, workspace-driven navigation.
 *
 * Routes are dynamic: `[module]` segment in URL comes from org's module config.
 * Each workspace can rename "Leads" → "Inquiries" and the URL becomes /inquiries.
 *
 * Architecture:
 * - `DEFAULT_MODULES` = factory defaults (used when org has no custom config)
 * - Org stores `settings.modules[]` in DB with custom slugs/labels
 * - `buildNavigation()` takes org modules and returns sidebar nav groups
 * - `[module]/page.tsx` resolves slug → entity type via this config
 */

import type { LucideIcon } from "lucide-react";
import {
	LayoutDashboard,
	UserSearch,
	Users,
	Building2,
	Handshake,
	Bell,
	Settings,
	Palette,
} from "lucide-react";

// --- Entity Types (stable, never changes) ---

export const ENTITY_TYPES = ["leads", "contacts", "companies", "deals"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

// --- Module Config (stored per-org in DB) ---

export interface ModuleConfig {
	/** URL path segment — workspace-customizable */
	slug: string;
	/** Internal entity type — stable, used by code */
	type: EntityType;
	/** Display label — workspace-customizable */
	label: string;
	/** Arabic label */
	labelAr?: string;
	/** Lucide icon name */
	icon: string;
	/** Whether this module is enabled for this workspace */
	enabled: boolean;
	/** Display order in sidebar */
	order: number;
}

// --- Default Modules (factory config) ---

export const DEFAULT_MODULES: ModuleConfig[] = [
	{ slug: "leads", type: "leads", label: "Leads", labelAr: "العملاء المحتملون", icon: "user-search", enabled: true, order: 1 },
	{ slug: "contacts", type: "contacts", label: "Contacts", labelAr: "جهات الاتصال", icon: "users", enabled: true, order: 2 },
	{ slug: "companies", type: "companies", label: "Companies", labelAr: "الشركات", icon: "building-2", enabled: true, order: 3 },
	{ slug: "deals", type: "deals", label: "Deals", labelAr: "الصفقات", icon: "handshake", enabled: true, order: 4 },
];

// --- Icon Map (icon string → component) ---

const ICON_MAP: Record<string, LucideIcon> = {
	"layout-dashboard": LayoutDashboard,
	"user-search": UserSearch,
	users: Users,
	"building-2": Building2,
	handshake: Handshake,
	bell: Bell,
	settings: Settings,
	palette: Palette,
};

export function getIcon(iconName: string): LucideIcon {
	return ICON_MAP[iconName] ?? LayoutDashboard;
}

// --- Navigation Builder ---

export interface NavItem {
	title: string;
	url: string;
	icon: LucideIcon;
	type?: EntityType;
}

export interface NavGroup {
	id: string;
	label?: string;
	items: NavItem[];
}

/**
 * Build sidebar navigation from org's module config.
 * @param orgSlug - Organization slug for URL prefix
 * @param modules - Org's module config (from DB or defaults)
 * @param locale - Current locale for label selection
 */
export function buildNavigation(
	orgSlug: string,
	modules: ModuleConfig[] = DEFAULT_MODULES,
	locale: string = "en",
): NavGroup[] {
	const base = `/${orgSlug}/dashboard`;

	const crmItems: NavItem[] = modules
		.filter((m) => m.enabled)
		.sort((a, b) => a.order - b.order)
		.map((m) => ({
			title: locale === "ar" && m.labelAr ? m.labelAr : m.label,
			url: `${base}/${m.slug}`,
			icon: getIcon(m.icon),
			type: m.type,
		}));

	return [
		{
			id: "overview",
			items: [
				{ title: locale === "ar" ? "لوحة التحكم" : "Dashboard", url: base, icon: LayoutDashboard },
			],
		},
		{
			id: "crm",
			label: "CRM",
			items: crmItems,
		},
	];
}

// --- Slug Resolution ---

/**
 * Resolve a URL slug to its entity type using org's module config.
 * Used by `[module]/page.tsx` to determine which entity to render.
 */
export function resolveModuleType(
	slug: string,
	modules: ModuleConfig[] = DEFAULT_MODULES,
): EntityType | null {
	const mod = modules.find((m) => m.slug === slug && m.enabled);
	return mod?.type ?? null;
}

/**
 * Get the slug for a given entity type (reverse lookup).
 * Used when code needs to link to an entity page.
 */
export function getModuleSlug(
	type: EntityType,
	modules: ModuleConfig[] = DEFAULT_MODULES,
): string {
	const mod = modules.find((m) => m.type === type && m.enabled);
	return mod?.slug ?? type;
}
