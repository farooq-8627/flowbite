/**
 * Action theme — per-action visual identity (ring color + icon + title).
 *
 * Why this is its own file
 * ────────────────────────
 * Every entry in the timeline gets a colored ring on the start side
 * that tells the user the **kind** of action at a glance, plus a tiny
 * icon inside the ring matching the action class. We resolve all of
 * this once at the merge boundary instead of branching on action
 * strings inside each leaf renderer.
 *
 * Color mapping (locked 2026-05-19)
 * ─────────────────────────────────
 *   - emerald ring + ✚ icon       → created
 *   - blue    ring + ✎ icon       → updated
 *   - red     ring + ✕ icon       → deleted
 *   - purple  ring + → icon       → converted / won / completed
 *   - rose    ring + ↓ icon       → lost
 *   - amber   ring + ⏰ icon       → reminder / follow-up created
 *   - yellow  ring + ✎ icon       → note added / edited
 *   - sky     ring + ✉ icon       → message sent
 *   - violet  ring + ⚲ icon       → AI action
 *   - slate   ring + ⚙ icon       → system / integration
 *   - fuchsia ring + ⇄ icon       → stage / status change
 *
 * Each entry carries a `theme` derived from this map. Renderers
 * consume `theme.ringClass` (Tailwind class for the colored ring),
 * `theme.icon` (lucide icon component), and `theme.titleVerb`
 * (the headline string — e.g. "Lead created", "Reminder set",
 * "Note added").
 */

import {
	ArrowDownRight,
	ArrowRight,
	BellPlus,
	Bot,
	CheckCircle2,
	FileEdit,
	type LucideIcon,
	MessageCircle,
	Pencil,
	Plus,
	Send,
	Settings,
	Trash2,
	UserCheck,
} from "lucide-react";

export type ActionTheme = {
	/** Tailwind class for the ring around the icon node (border-color). */
	ringClass: string;
	/** Tailwind class for the inner icon color. */
	iconClass: string;
	/** Tailwind class for the icon's tinted background bubble. */
	bgClass: string;
	/** Lucide icon component rendered inside the node. */
	Icon: LucideIcon;
	/** Headline for this entry — e.g. "Lead created". */
	titleVerb: string;
};

// ─── Subject formatting helper ───────────────────────────────────────────────

const ENTITY_LABELS: Record<string, string> = {
	lead: "Lead",
	contact: "Contact",
	person: "Profile",
	deal: "Deal",
	company: "Company",
	note: "Note",
	reminder: "Reminder",
	message: "Message",
	project: "Project",
	task: "Task",
};

export function entityLabel(entityType: string): string {
	return ENTITY_LABELS[entityType] ?? capitalise(entityType);
}

function capitalise(s: string): string {
	if (!s) return s;
	return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Headline resolver ───────────────────────────────────────────────────────

/**
 * Combines `entityType` + `action` into a human-readable headline.
 *
 * Examples:
 *   ("lead",     "created")           → "Lead created"
 *   ("lead",     "converted")         → "Lead converted to contact"
 *   ("deal",     "won")               → "Deal won"
 *   ("deal",     "lost")              → "Deal lost"
 *   ("deal",     "stage_changed")     → "Deal stage changed"
 *   ("reminder", "created")           → "Reminder set"
 *   ("note",     "created")           → "Note added"
 *   ("contact",  "deleted")           → "Contact deleted"
 *
 * Special case `field_updated`: the caller-supplied description (set by
 * `logFieldUpdates`) already reads "Status: new → qualified" — that's
 * what the user wants to see in the title. We let the renderer fall
 * back to the description when present; otherwise we synthesise a
 * generic "{Entity} updated" so the row is still meaningful.
 */
function resolveHeadline(entityType: string, action: string): string {
	const label = entityLabel(entityType);

	// Special cases that don't follow the "{Entity} {verb-past}" template
	if (action === "converted" && (entityType === "lead" || entityType === "contact")) {
		return "Lead converted to contact";
	}
	if (action === "won") return `${label} won`;
	if (action === "lost") return `${label} lost`;
	if (action === "stage_changed") return `${label} stage changed`;
	if (action === "status_changed") return `${label} status changed`;

	// Granular field-level update — the headline lives in `description`.
	// Bare-entry renderer reads `description` first when action ===
	// "field_updated"; we still return a sensible fallback here for
	// surfaces that ignore `description`.
	if (action === "field_updated") return `${label} updated`;

	// Reminder verbs
	if (action === "reminder_created" || action === "followup_created") return "Reminder set";
	if (action === "reminder_completed" || action === "followup_completed")
		return "Reminder completed";
	if (action === "reminder_deleted") return "Reminder removed";
	if (action === "reminder_updated") return "Reminder updated";

	// Note verbs
	if (action === "note_created") return "Note added";
	if (action === "note_updated") return "Note edited";
	if (action === "note_deleted") return "Note removed";
	if (action === "note_pinned") return "Note pinned";

	// Message verbs
	if (action === "message_sent") return "Message sent";

	// CRUD fallback — works for action == "created" / "updated" / "deleted"
	const verb = action.replace(/_/g, " ");
	return `${label} ${verb}`;
}

// ─── Theme resolver ──────────────────────────────────────────────────────────

/**
 * Pick the theme for an entry. Two inputs because the rules are different:
 *   - Activity logs: use `action` (CRUD verb) + `entityType` for the headline.
 *   - Notes / reminders: synthesise an action ("note_created" /
 *     "reminder_created") and pass `note` / `reminder` as entityType so
 *     the headline reads "Note added" / "Reminder set".
 */
export function resolveActionTheme(args: {
	entityType: string;
	action: string;
	actorType?: string;
}): ActionTheme {
	const { action, entityType, actorType } = args;
	const titleVerb = resolveHeadline(entityType, action);

	// AI / system overrides — they always carry their own visual identity,
	// regardless of the underlying CRUD verb.
	if (actorType === "ai") {
		return {
			ringClass: "border-violet-500/70",
			iconClass: "text-violet-700",
			bgClass: "bg-violet-50",
			Icon: Bot,
			titleVerb,
		};
	}
	if (actorType === "system" || actorType === "integration") {
		return {
			ringClass: "border-slate-400/70",
			iconClass: "text-slate-700",
			bgClass: "bg-slate-50",
			Icon: Settings,
			titleVerb,
		};
	}

	// Verb-driven palette
	if (action.includes("converted")) {
		return {
			ringClass: "border-purple-500/70",
			iconClass: "text-purple-700",
			bgClass: "bg-purple-50",
			Icon: UserCheck,
			titleVerb,
		};
	}
	if (
		action === "won" ||
		action === "deal_won" ||
		action === "completed" ||
		action.includes("completed")
	) {
		return {
			ringClass: "border-emerald-500/70",
			iconClass: "text-emerald-700",
			bgClass: "bg-emerald-50",
			Icon: CheckCircle2,
			titleVerb,
		};
	}
	if (action === "lost" || action === "deal_lost") {
		return {
			ringClass: "border-rose-500/70",
			iconClass: "text-rose-700",
			bgClass: "bg-rose-50",
			Icon: ArrowDownRight,
			titleVerb,
		};
	}
	if (action.includes("stage") || action.includes("status")) {
		return {
			ringClass: "border-fuchsia-500/70",
			iconClass: "text-fuchsia-700",
			bgClass: "bg-fuchsia-50",
			Icon: ArrowRight,
			titleVerb,
		};
	}
	if (action.includes("deleted") || action.includes("removed")) {
		return {
			ringClass: "border-red-500/70",
			iconClass: "text-red-700",
			bgClass: "bg-red-50",
			Icon: Trash2,
			titleVerb,
		};
	}
	if (action.includes("reminder") || action.includes("followup")) {
		return {
			ringClass: "border-amber-500/70",
			iconClass: "text-amber-700",
			bgClass: "bg-amber-50",
			Icon: BellPlus,
			titleVerb,
		};
	}
	if (action.includes("note")) {
		return {
			ringClass: "border-yellow-500/70",
			iconClass: "text-yellow-700",
			bgClass: "bg-yellow-50",
			Icon: FileEdit,
			titleVerb,
		};
	}
	if (action.includes("message") || action.includes("sent")) {
		return {
			ringClass: "border-sky-500/70",
			iconClass: "text-sky-700",
			bgClass: "bg-sky-50",
			Icon: Send,
			titleVerb,
		};
	}
	if (action.includes("updated") || action.includes("edited") || action.includes("changed")) {
		return {
			ringClass: "border-blue-500/70",
			iconClass: "text-blue-700",
			bgClass: "bg-blue-50",
			Icon: Pencil,
			titleVerb,
		};
	}
	if (action.includes("created") || action.includes("added")) {
		return {
			ringClass: "border-emerald-500/70",
			iconClass: "text-emerald-700",
			bgClass: "bg-emerald-50",
			Icon: Plus,
			titleVerb,
		};
	}

	// Catch-all
	return {
		ringClass: "border-slate-300/70",
		iconClass: "text-slate-700",
		bgClass: "bg-slate-50",
		Icon: MessageCircle,
		titleVerb,
	};
}
