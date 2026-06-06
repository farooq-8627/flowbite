/**
 * Owner-panel sidebar nav — static 8-item list.
 *
 * Parallel to `core/shell/shell/config/navigation.ts` but intentionally
 * NOT org-aware: the owner panel has no orgId, no modules, no entity
 * labels. The list is fixed; reordering requires a code change.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §5 (section catalog), §6 (UI pattern).
 */
import type { LucideIcon } from "lucide-react";
import {
	Brain,
	Building2,
	CreditCard,
	FileClock,
	Flag,
	KeyRound,
	LayoutDashboard,
	MessageSquareText,
	Settings,
	Shield,
	Tags,
	Users,
	Workflow,
} from "lucide-react";

export type OwnerNavItem = {
	/** URL path under the owner-panel slug, e.g. "/overview". */
	href: string;
	/** Display label (English-only — locked decision L9). */
	label: string;
	/** Lucide icon. */
	icon: LucideIcon;
	/** One-line tooltip / description for the rail. */
	description: string;
};

/**
 * The complete owner-panel navigation. Order matches the section catalog
 * in `PLATFORM-OWNER-PANEL.md §5` rows 1..8.
 */
export const OWNER_NAV: readonly OwnerNavItem[] = [
	{
		href: "/overview",
		label: "Overview",
		icon: LayoutDashboard,
		description: "Platform stats + recent admin actions.",
	},
	{
		href: "/users",
		label: "Users",
		icon: Users,
		description: "Search and manage user subscriptions across the platform.",
	},
	{
		href: "/organizations",
		label: "Organisations",
		icon: Workflow,
		description: "Search and manage workspaces — tier, members, suspend, delete.",
	},
	{
		href: "/tiers",
		label: "Tiers",
		icon: Tags,
		description: "Edit plan price + limits per tier.",
	},
	{
		href: "/industries",
		label: "Industries",
		icon: Building2,
		description: "Manage industry templates + onboarding picker.",
	},
	{
		href: "/reserved-slugs",
		label: "Reserved slugs",
		icon: Shield,
		description: "Reserved org / template / route names.",
	},
	{
		href: "/billing",
		label: "Billing",
		icon: CreditCard,
		description: "Provider keys + trial defaults (read-only env mask).",
	},
	{
		href: "/flags",
		label: "Feature flags",
		icon: Flag,
		description: "Global default toggle + per-org overrides.",
	},
	{
		href: "/ai-context",
		label: "AI context",
		icon: Brain,
		description: "Platform-wide AI system prompt + rule list.",
	},
	{
		href: "/ai-keys",
		label: "AI keys",
		icon: KeyRound,
		description: "Platform AI provider keys — used when no BYOK key is set.",
	},
	{
		href: "/whatsapp-templates",
		label: "WhatsApp templates",
		icon: MessageSquareText,
		description: "Cross-org WhatsApp template SSOT (built-ins + per-org overrides).",
	},
	{
		href: "/audit",
		label: "Audit log",
		icon: FileClock,
		description: "Append-only platform-action log with diff.",
	},
	{
		href: "/settings",
		label: "Settings",
		icon: Settings,
		description: "Owner profile + active OTP sessions + recent logins.",
	},
] as const;

/**
 * Resolves the active nav item from a URL pathname.
 *
 * Both the public slug-prefixed path (`/superadmin/users` — what client
 * components see via `usePathname()`) and the internal segment
 * (`/xowner/users` — what server-side route handlers see) are accepted.
 * We strip whichever first segment is present and compare the remaining
 * tail against the static nav config.
 */
export function getActiveOwnerNavItem(pathname: string): OwnerNavItem | undefined {
	if (!pathname.startsWith("/")) return undefined;
	// Drop the first segment (the public slug OR the internal `xowner`
	// literal — either way, it isn't part of the section path).
	const segments = pathname.split("/").filter(Boolean);
	if (segments.length === 0) return undefined;
	const tail = `/${segments.slice(1).join("/")}` || "/overview";
	const normalised = tail === "/" ? "/overview" : tail;
	return OWNER_NAV.find(
		(item) => normalised === item.href || normalised.startsWith(`${item.href}/`),
	);
}
