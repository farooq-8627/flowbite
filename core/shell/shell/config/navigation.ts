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
	Activity,
	Bell,
	Building2,
	Handshake,
	LayoutDashboard,
	ListChecks,
	ListTodo,
	MessageSquare,
	Palette,
	ScrollText,
	Settings,
	StickyNote,
	UserCircle,
	UserSearch,
	Users,
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
	{
		slug: "leads",
		type: "leads",
		label: "Leads",
		labelAr: "العملاء المحتملون",
		icon: "user-search",
		enabled: true,
		order: 1,
	},
	{
		slug: "contacts",
		type: "contacts",
		label: "Contacts",
		labelAr: "جهات الاتصال",
		icon: "users",
		enabled: true,
		order: 2,
	},
	{
		slug: "companies",
		type: "companies",
		label: "Companies",
		labelAr: "الشركات",
		icon: "building-2",
		enabled: true,
		order: 3,
	},
	{
		slug: "deals",
		type: "deals",
		label: "Deals",
		labelAr: "الصفقات",
		icon: "handshake",
		enabled: true,
		order: 4,
	},
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
	/**
	 * Stable identifier for cross-cutting decoration (e.g. an unread-
	 * count badge attached by the sidebar). Optional — most items
	 * never need it. Today only `"ai.audit"` is referenced
	 * (B.42 follow-up — drives the audit-feed unread badge).
	 */
	id?: string;
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
 * @param permissions - Current member's permission keys. Used to gate nav
 *   entries that are tied to a specific permission (e.g. the AI Audit feed
 *   only renders when the member holds `ai.audit.view`). An empty array
 *   means "no permission-gated entries are surfaced", which is the safe
 *   default while membership is still loading.
 * @param aiFeatures - Per-org sidebar-visibility flags for AI surfaces.
 *   When `auditFeed === false` the audit-feed entry is hidden even from
 *   members who hold `ai.audit.view`; when `nextActions === false` the
 *   next-actions entry is hidden even from members who hold
 *   `ai.trace.view`. Undefined / missing = visible (preserves the
 *   pre-flag behaviour). The server-side gate at
 *   `convex/ai/queries/auditFeed.ts:listAuditFeed` (and the analogous
 *   next-actions reader) STILL enforces the permission, so hiding a
 *   sidebar entry never grants access — this is a UI-only switch.
 */
export function buildNavigation(
	orgSlug: string,
	modules: ModuleConfig[] = DEFAULT_MODULES,
	locale: string = "en",
	permissions: ReadonlyArray<string> = [],
	aiFeatures: { auditFeed?: boolean; nextActions?: boolean } | undefined = undefined,
): NavGroup[] {
	// Dashboard is at /[orgSlug]/ — no /dashboard segment
	const base = `/${orgSlug}`;

	const crmItems: NavItem[] = modules
		.filter((m) => m.enabled)
		.sort((a, b) => a.order - b.order)
		.map((m) => ({
			title: locale === "ar" && m.labelAr ? m.labelAr : m.label,
			url: `${base}/${m.slug}`,
			icon: getIcon(m.icon),
			type: m.type,
		}));

	// ── Workspace group — cross-cutting, NEVER renamed per industry ─────────
	// Slugs are reserved in convex/_shared/reservedSlugs.ts so an org cannot
	// rename a CRM entity to "messages", "calendar", etc.
	const workspaceItems: NavItem[] = [
		{
			title: locale === "ar" ? "الملف الشخصي" : "Profile",
			url: `${base}/profile`,
			icon: UserCircle,
		},
		{
			title: locale === "ar" ? "الرسائل" : "Messages",
			url: `${base}/messages`,
			icon: MessageSquare,
		},
		// Tasks consolidates the legacy `Reminders` + `Follow-ups` surfaces into
		// ONE noun (Stage 4D rename, TASKS-RENAME-PLAN.md decisions #8 + #9).
		// The list/calendar/today views are switchable inside the page via a
		// toolbar toggle. Cadence-style follow-ups still exist as a `type` chip
		// on each task, not as a separate route or sidebar item.
		{
			title: locale === "ar" ? "المهام" : "Tasks",
			url: `${base}/tasks`,
			icon: ListTodo,
		},
		{
			title: locale === "ar" ? "الملاحظات" : "Notes",
			url: `${base}/notes`,
			icon: StickyNote,
		},
		{
			title: locale === "ar" ? "الجدول الزمني" : "Timeline",
			url: `${base}/timeline`,
			icon: Activity,
		},
	];

	// ── AI group — manager-facing observability surfaces.
	//
	// Today this group only contains the org-wide audit feed (B.39). Each
	// entry declares the permission key it requires; the entry is only
	// surfaced when the current member holds that key. The group itself is
	// hidden when no entry is visible (e.g. plain Members on default roles).
	//
	// Cross-link: `convex/_shared/permissions/catalog.ts` is the SSOT for
	// every key referenced here. The audit-feed query at
	// `convex/ai/queries/auditFeed.ts:listAuditFeed` and the route
	// `app/[locale]/(private)/[orgSlug]/ai/audit/page.tsx` enforce the same
	// `ai.audit.view` key server-side, so removing the nav entry alone
	// never grants access — the server is the source of truth.
	const permissionSet = new Set(permissions);
	// Per-org sidebar visibility for AI surfaces (B.42 follow-up).
	// `=== false` is the explicit OFF check — `undefined` keeps the
	// historical default of "visible" so existing workspaces don't
	// silently lose surfaces when the slot is added.
	const auditFeedVisible = aiFeatures?.auditFeed !== false;
	const nextActionsVisible = aiFeatures?.nextActions !== false;
	const aiItems: NavItem[] = [];
	if (auditFeedVisible && permissionSet.has("ai.audit.view")) {
		aiItems.push({
			id: "ai.audit",
			title: locale === "ar" ? "سجل الذكاء الاصطناعي" : "Audit feed",
			url: `${base}/ai/audit`,
			icon: ScrollText,
		});
	}
	if (nextActionsVisible && permissionSet.has("ai.trace.view")) {
		// Surface the proactive next-actions list alongside the audit feed.
		// `ai.trace.view` is the broadest AI-observability key we already
		// grant Members by default; using it here keeps "AI" visible to
		// anyone who can already see at least one AI surface, instead of
		// hiding the entire group from default Members.
		aiItems.push({
			title: locale === "ar" ? "الإجراءات التالية" : "Next actions",
			url: `${base}/ai/next-actions`,
			icon: ListChecks,
		});
	}

	const groups: NavGroup[] = [
		{
			id: "overview",
			items: [
				{
					title: locale === "ar" ? "لوحة التحكم" : "Dashboard",
					url: base,
					icon: LayoutDashboard,
				},
			],
		},
		{
			id: "workspace",
			label: locale === "ar" ? "مساحة العمل" : "Workspace",
			items: workspaceItems,
		},
		{
			id: "crm",
			label: "CRM",
			items: crmItems,
		},
	];

	if (aiItems.length > 0) {
		groups.push({
			id: "ai",
			label: locale === "ar" ? "الذكاء الاصطناعي" : "AI",
			items: aiItems,
		});
	}

	return groups;
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
export function getModuleSlug(type: EntityType, modules: ModuleConfig[] = DEFAULT_MODULES): string {
	const mod = modules.find((m) => m.type === type && m.enabled);
	return mod?.slug ?? type;
}
