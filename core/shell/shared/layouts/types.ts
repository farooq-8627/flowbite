/**
 * Shared shell-layout types.
 *
 * The "shell layout" is the left-rail + topnav-pills + scrollable-content
 * pattern first built for /settings. It is now used by /profile/[personCode]
 * and is ready for any future view that needs the same structure.
 *
 * A shell has two levels of navigation:
 *   - Groups     → the left rail (e.g. Workspace, Team, CRM, Appearance, …)
 *                  or for profile: Overview, Messages, Timeline, Deals, …
 *   - Sections   → pills injected into the topnav slot for the active group,
 *                  AND the search index (Fuse.js over label + keywords + description).
 *
 * Permissions are enforced top-down:
 *   - If group.ownerOnly → requires org.delete
 *   - Else group.permission → requires that exact permission
 *   - Sections inherit from group; can tighten further via their own permission / ownerOnly
 */

import type { LucideIcon } from "lucide-react";

/** Top-level nav group — one per row in the left rail. */
export type ShellGroup = {
	/** Stable id used in URL query param + renderGroup dispatch. */
	id: string;
	/** Human-readable label. */
	label: string;
	/** Lucide icon component (not a string). */
	icon: LucideIcon;
	/** If set, user must have this permission OR be owner to see the group. */
	permission?: string;
	/** If true, only org owners (`org.delete`) see this group. */
	ownerOnly?: boolean;
};

/** A section under a group — becomes a pill in the toolbar + a row in Fuse index. */
export type ShellSection = {
	/** DOM id of the rendered section card. */
	id: string;
	/** Which group this section belongs to. */
	groupId: string;
	/** Short label shown as a pill in the toolbar. */
	label: string;
	/** Longer description — appears in search results and fed to Fuse. */
	description?: string;
	/** Extra search terms that don't appear in the UI but should match. */
	keywords?: string[];
	/** If set, user must have this permission OR be owner to see the section. */
	permission?: string;
	/** If true, only org owners (`org.delete`) see this section. */
	ownerOnly?: boolean;
};
