/**
 * Module registry. Each `ModuleDef.key` matches a `cap.module` tag, so
 * `activeModules(org)` filters capabilities AND prompt context from one
 * switch — pipelines off → pipeline tools AND context disappear together.
 *
 * `isEnabled` reads a tiny `OrgSnapshot` (no live DB inside this module);
 * the host loads the snapshot once per turn and hands it in, so tests stay
 * pure and the cached prefix never depends on per-tenant data.
 */
import type { Capability } from "./types";

// ─── OrgSnapshot — the slice of org config the gate + context need ─────────

/**
 * The minimal org slice the module gate reads. Loaded once per turn from the
 * DB (or constructed directly in tests). Keep the shape narrow so the host
 * never accidentally reaches for fields the gate doesn't need.
 */
export type OrgSnapshot = {
	/** Module keys the org has explicitly hidden. Default: empty. */
	hiddenSlots: ReadonlySet<string>;
	/** VerticalProfile lookup key (org.industry). */
	industryKey?: string;
	/** Per-tenant labels — used by per-module contextProviders. */
	entityLabels?: {
		lead?: { singular: string; plural: string };
		contact?: { singular: string; plural: string };
		deal?: { singular: string; plural: string };
		company?: { singular: string; plural: string };
	};
	/** Per-tenant currency (used by a few context providers). */
	currency?: string;
};

/** A snapshot with no overrides — every module is enabled. Tests + S9 default. */
export const EMPTY_ORG_SNAPSHOT: OrgSnapshot = {
	hiddenSlots: new Set<string>(),
};

// ─── ModuleDef + registry ───────────────────────────────────────────────────

export type ModuleDef = {
	/** Stable key. Must match `cap.module` for every capability in the module. */
	key: string;
	/** Predicate over the org snapshot — false means tools + context are hidden. */
	isEnabled: (org: OrgSnapshot) => boolean;
	/**
	 * Optional per-turn tail block. Returns a short markdown snippet (or "")
	 * the host concatenates after the vertical addendum. Keep blocks tight —
	 * field/pipeline data lives in `describe_entity`/`describe_workspace`,
	 * NOT in the prompt.
	 */
	contextProvider?: (org: OrgSnapshot) => string;
};

const MODULES = new Map<string, ModuleDef>();

export function defineModule(def: ModuleDef): ModuleDef {
	if (MODULES.has(def.key)) {
		throw new Error(`[ai/registry] Duplicate module key: "${def.key}".`);
	}
	MODULES.set(def.key, def);
	return def;
}

export function getModule(key: string): ModuleDef | undefined {
	return MODULES.get(key);
}

export function listModules(): ModuleDef[] {
	return Array.from(MODULES.values());
}

/** TEST ONLY — clears the module registry so tests can re-seed. */
export function _resetModulesForTest(): void {
	MODULES.clear();
}

// ─── Active set + filtering ────────────────────────────────────────────────

/** Module keys enabled for this org. Capabilities NOT in this set are filtered out. */
export function activeModules(org: OrgSnapshot): Set<string> {
	const out = new Set<string>();
	for (const def of MODULES.values()) {
		if (def.isEnabled(org)) out.add(def.key);
	}
	return out;
}

/**
 * Filter capabilities by the active-module set. Capabilities whose `module`
 * is NOT registered fall through (default-on) — keeps third-party / WIP caps
 * working without forcing a registration just to be visible.
 */
export function filterCapabilitiesByModules(
	caps: Capability[],
	active: ReadonlySet<string>,
): Capability[] {
	return caps.filter((c) => {
		// Unregistered module keys default to enabled — the gate is for KNOWN
		// modules a workspace has explicitly hidden, not a fail-closed allow-list.
		if (!MODULES.has(c.module)) return true;
		return active.has(c.module);
	});
}

/**
 * Render the per-module context tail for the active set. Skips modules with
 * no `contextProvider`. Output is one block per module, separated by a
 * blank line so the markdown headings render cleanly.
 */
export function renderActiveModuleContext(org: OrgSnapshot, active: ReadonlySet<string>): string {
	const blocks: string[] = [];
	for (const key of active) {
		const def = MODULES.get(key);
		if (!def?.contextProvider) continue;
		const block = def.contextProvider(org).trim();
		if (block.length > 0) blocks.push(block);
	}
	return blocks.join("\n\n");
}

// ─── Module registrations ──────────────────────────────────────────────────
//
// Default-on philosophy: a module is enabled unless its key sits in
// `org.hiddenSlots`. The legacy entity-slot config (org.settings.modules)
// uses `hidden: true` for "this slot is off" — the loader maps those slots
// directly into `hiddenSlots`.
//
// `core` is always on regardless — `discover_capabilities`, `search_crm`,
// `describe_entity`, `describe_workspace`, `read_conversation`, `ask_user`
// are foundational.

const isHiddenSlot = (key: string) => (org: OrgSnapshot) => !org.hiddenSlots.has(key);

defineModule({
	key: "core",
	isEnabled: () => true,
});

defineModule({
	key: "leads",
	isEnabled: isHiddenSlot("leads"),
	contextProvider: (org) => {
		const plural = org.entityLabels?.lead?.plural ?? "Leads";
		return `### ${plural} module\nIntake records live in this module. Use \`create_lead\` for new captures, \`convert_lead\` to promote to a contact, and \`update_entity\` for field edits. Always \`search_crm\` for a duplicate before creating.`;
	},
});

defineModule({
	key: "contacts",
	isEnabled: isHiddenSlot("contacts"),
	contextProvider: (org) => {
		const plural = org.entityLabels?.contact?.plural ?? "Contacts";
		return `### ${plural} module\nConverted leads. Person-records keep their \`personCode\` across the lead→contact transition; never delete + recreate to "convert".`;
	},
});

defineModule({
	key: "deals",
	isEnabled: isHiddenSlot("deals"),
	contextProvider: (org) => {
		const plural = org.entityLabels?.deal?.plural ?? "Deals";
		return `### ${plural} module\nTracked opportunities. Use \`move_stage\`, \`close_deal\`, \`reopen_deal\`, \`change_pipeline\`. Stage codes/names resolve server-side; pass either form.`;
	},
});

defineModule({
	key: "companies",
	isEnabled: isHiddenSlot("companies"),
	contextProvider: (org) => {
		const plural = org.entityLabels?.company?.plural ?? "Companies";
		return `### ${plural} module\nAccount-level records. \`create_company\` accepts a \`personCodes\` list to attach contacts at creation time.`;
	},
});

defineModule({
	key: "tasks",
	isEnabled: isHiddenSlot("tasks"),
	contextProvider: () =>
		`### Tasks module\nUse \`create_task\` for any time-bound action. Natural-language dates ("next Tuesday", "tomorrow 9am") are coerced server-side against the org timezone — pass them as-is.`,
});

defineModule({
	key: "notes",
	isEnabled: isHiddenSlot("notes"),
	contextProvider: () =>
		`### Notes module\nFree-form annotations on people / deals / companies. Use \`add_note\` to record observations, \`pin_note\` to surface the important ones.`,
});

defineModule({
	key: "timeline",
	isEnabled: isHiddenSlot("timeline"),
	// No context provider — `list_org_timeline` is self-explanatory.
});

defineModule({
	key: "notifications",
	isEnabled: isHiddenSlot("notifications"),
	// User-scoped at the schema layer; no per-org tail.
});

defineModule({
	key: "pipelines",
	isEnabled: isHiddenSlot("pipelines"),
	contextProvider: () =>
		`### Pipelines module\nDeal stage progressions are configurable per-org. \`describe_workspace\` returns the live stage list; never hard-code stage names.`,
});

defineModule({
	key: "fields",
	isEnabled: isHiddenSlot("fields"),
	contextProvider: () =>
		`### Fields module\nCustom field definitions live here. Read schema via \`describe_entity\` before any write — labels, types, and options can change without notice.`,
});

defineModule({
	key: "tags",
	isEnabled: isHiddenSlot("tags"),
	// Self-explanatory.
});

defineModule({
	key: "savedViews",
	isEnabled: isHiddenSlot("savedViews"),
	// Self-explanatory.
});

defineModule({
	key: "noteCategories",
	isEnabled: isHiddenSlot("noteCategories"),
	// Self-explanatory.
});

// ─── H.13 V2 ports — messaging / files / dashboard / analytics / creative /
// ─── interaction / proactive — registered so an org can hide each one via
// ─── `org.settings.modules`. Default-on; the gate is purely a hide-switch.

defineModule({
	key: "messaging",
	isEnabled: isHiddenSlot("messaging"),
	contextProvider: () =>
		`### Messaging module\nIn-app chat threads attach to entities (lead/deal/company) via conversations + messages. Use \`send_message\` for outbound text, \`list_messages\` to read context, \`start_dm\` for a 1:1 thread between members. Never compose for the customer over WhatsApp without an explicit ask.`,
});

defineModule({
	key: "files",
	isEnabled: isHiddenSlot("files"),
	contextProvider: () =>
		`### Files module\nUploads scope to (entityType, entityId). \`list_files\` reads, \`attach_file\` re-scopes/tags, \`update_file_tags\` patches tags, \`remove_file\` soft-deletes. The org's max-size + MIME whitelist live in \`org.settings.fileUpload\` — \`describe_workspace\` exposes them.`,
});

defineModule({
	key: "dashboard",
	isEnabled: isHiddenSlot("dashboard"),
	contextProvider: () =>
		`### Dashboard module\nThe AI's dashboard surface: \`render_widget\` pins an ephemeral widget card to the user's dashboard, \`annotate_widget\` writes a chip alongside a widget, \`score_deal\` recomputes a deal's deterministic score, \`explain_deal_score\` runs the LLM explainer, \`list_anomalies\` reads + refreshes the org's anomaly feed.`,
});

defineModule({
	key: "analytics",
	isEnabled: isHiddenSlot("analytics"),
	contextProvider: () =>
		`### Analytics module\nDeterministic + AI-narrated insights on top of the org's CRM data. Use \`get_briefing\` / \`refresh_briefing\` for the daily user briefing + weekly org insight, \`analyze_metric\` for a metric-narrative, \`cohort_analysis\` / \`member_performance\` / \`pipeline_velocity\` for canned rollups.`,
});

defineModule({
	key: "creative",
	isEnabled: isHiddenSlot("creative"),
	contextProvider: () =>
		`### Creative module\nLLM-backed drafts: \`draft_message\` (outbound message draft), \`draft_proposal\` (deal proposal draft), \`summarise_conversation\` (extract decisions + action items), \`web_scrape\` (fetch + clean a URL via Firecrawl). All quota-gated; deterministic fallback when no key is configured.`,
});

defineModule({
	key: "interaction",
	isEnabled: isHiddenSlot("interaction"),
	contextProvider: () =>
		`### Interaction module\nStructured-input prompts for the chat surface. \`ask_user_input\` requests a single free-text field, \`ask_user_choice\` requests one of N labelled options. Returns an \`ambiguous\` envelope; the chat UI renders the form. Reach for these when \`ask_user\` (the core tool) is too unstructured.`,
});

defineModule({
	key: "proactive",
	isEnabled: isHiddenSlot("proactive"),
	contextProvider: () =>
		`### Proactive module\nThe AI's surfaced suggestions live in \`aiNextActions\`. \`list_next_actions\` reads the user's ranked list (stale leads, stuck deals, overdue tasks); \`dismiss_next_action\` removes a row + records the fingerprint so the next rebuild suppresses it.`,
});

defineModule({
	key: "quarantined",
	isEnabled: isHiddenSlot("quarantined"),
	contextProvider: () =>
		`### Quarantined module\nLong-running parsers + enrichers gated by 2FA: \`import_csv_lead\` (parse a leads CSV upload via the quarantined LLM parser), \`analyze_file\` (passport / listing-photo / invoice OCR), \`enrich_record\` (fill missing fields via web search). Each emits a \`csvImports\` / \`fileAnalyses\` / \`enrichmentRuns\` row the user reviews before commit.`,
});
