/**
 * Profile shell configuration — groups (left rail) + sections (toolbar pills).
 *
 * Mirrors the structure used by the Settings shell, but for a *person* rather
 * than the org's configuration. These groups are the tabs a salesperson /
 * account manager works through when catching up on a single lead or contact:
 *
 *   Overview   → vitals: contact info, assignee, company, tags, custom fields
 *   Messages   → human + AI-on-behalf chat threads (activity-chat)
 *   Timeline   → unified audit feed (activityLogs + stage changes + AI + etc)
 *   Notes      → agent-written briefs (AI briefing pinned at top)
 *   Deals      → all deals linked by personCode
 *   Reminders  → follow-ups and due / overdue items
 *   Calendar   → scheduled meetings + follow-up plan
 *
 * Keep this file purely presentational. Permission rules come from the
 * surrounding layout via `permissions` — sections that need a specific permission
 * set it here (e.g. `deals.view` for the Deals tab).
 */

import {
	Bell,
	CalendarDays,
	History,
	LayoutList,
	type LucideIcon,
	MessagesSquare,
	StickyNote,
	UserSquare2,
} from "lucide-react";
import type { ShellGroup, ShellSection } from "@/core/shared/layouts";

export type ProfileGroupId =
	| "overview"
	| "messages"
	| "timeline"
	| "notes"
	| "deals"
	| "reminders"
	| "calendar";

export const PROFILE_GROUPS: (ShellGroup & { id: ProfileGroupId; icon: LucideIcon })[] = [
	{ id: "overview", label: "Overview", icon: UserSquare2 },
	{ id: "messages", label: "Messages", icon: MessagesSquare },
	{ id: "timeline", label: "Timeline", icon: History },
	{ id: "notes", label: "Notes", icon: StickyNote },
	{ id: "deals", label: "Deals", icon: LayoutList, permission: "deals.view" },
	{ id: "reminders", label: "Reminders", icon: Bell, permission: "reminders.view" },
	{ id: "calendar", label: "Calendar", icon: CalendarDays },
];

export const DEFAULT_PROFILE_GROUP: ProfileGroupId = "overview";

/**
 * Sections — each one is a scrollable card inside its group's content area.
 *
 * Rule: every `<ProfileSection id="..." />` rendered on screen MUST have a
 * matching entry here (otherwise it won't appear in the toolbar and won't be
 * searchable). Entry ids use `group.section` naming so they're easy to scan.
 */
export const PROFILE_SECTIONS: ShellSection[] = [
	// Overview
	{
		id: "overview.vitals",
		groupId: "overview",
		label: "Vitals",
		description: "Name, personCode, avatar, status / stage, assignee.",
		keywords: ["avatar", "status", "stage", "assignee", "owner"],
	},
	{
		id: "overview.contact",
		groupId: "overview",
		label: "Contact",
		description: "Email, phone, WhatsApp, and preferred channel.",
		keywords: ["email", "phone", "whatsapp", "channel", "contact"],
	},
	{
		id: "overview.company",
		groupId: "overview",
		label: "Company",
		description: "Linked company and role at that company.",
		keywords: ["company", "organization", "account", "employer", "role"],
	},
	{
		id: "overview.tags",
		groupId: "overview",
		label: "Tags",
		description: "Tags applied to this person.",
		keywords: ["tag", "label", "categorize"],
	},
	{
		id: "overview.custom-fields",
		groupId: "overview",
		label: "Custom Fields",
		description: "Workspace-defined fields, stage-aware.",
		keywords: ["custom", "fields", "extras", "properties"],
	},

	// Messages
	{
		id: "messages.thread",
		groupId: "messages",
		label: "Conversation",
		description: "Human messages and AI on-behalf replies.",
		keywords: ["chat", "activity chat", "conversation", "ai reply"],
	},

	// Timeline
	{
		id: "timeline.feed",
		groupId: "timeline",
		label: "Feed",
		description:
			"Unified log — created, updated, stage change, AI action, WhatsApp, reminders.",
		keywords: ["audit", "activity", "history", "log", "feed"],
	},

	// Notes
	{
		id: "notes.ai-briefing",
		groupId: "notes",
		label: "AI Briefing",
		description: "AI-generated summary of the most important context.",
		keywords: ["briefing", "summary", "ai notes"],
	},
	{
		id: "notes.entries",
		groupId: "notes",
		label: "Notes",
		description: "Agent-written notes, editable.",
		keywords: ["note", "comment", "agent notes"],
	},

	// Deals
	{
		id: "deals.list",
		groupId: "deals",
		label: "Deals",
		description: "Every deal linked via personCode.",
		keywords: ["deal", "opportunity", "pipeline", "won", "lost"],
		permission: "deals.view",
	},

	// Reminders
	{
		id: "reminders.list",
		groupId: "reminders",
		label: "Reminders",
		description: "All follow-ups scheduled for this person.",
		keywords: ["follow-up", "reminder", "due", "overdue"],
		permission: "reminders.view",
	},

	// Calendar
	{
		id: "calendar.upcoming",
		groupId: "calendar",
		label: "Upcoming",
		description: "Scheduled meetings and follow-up plan.",
		keywords: ["meeting", "event", "schedule", "calendar"],
	},
];
