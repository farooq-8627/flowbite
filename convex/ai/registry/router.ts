/**
 * Adaptive router. Picks groups to preload in step 0 via deterministic
 * keyword + page-context mapping. Misroutes are recovered by
 * `discover_capabilities` (the model calls it from any step), so a typo or
 * absent group degrades to "no preload" instead of crashing — group keys
 * are intersected with the live registry.
 *
 * Deterministic on purpose: an LLM router would defeat the cached prefix.
 */
import { listGroupKeys } from "./catalog";
import type { Capability } from "./types";

/** Optional context the host passes alongside the user's message. */
export type RouteCtx = {
	/** Page-mode context from the frontend (e.g. user is on /profile/P-001). */
	entityType?: string;
	/** Personcode / dealcode / companycode currently in view. */
	entityCode?: string;
	/** A short page-context summary the frontend already built. */
	routeSummary?: string;
	/** The trigger that started this turn — affects which groups we preload. */
	trigger?: "chat" | "autonomous" | "autonomous_reply";
};

/** What the router returns. The host loads `groups`'s capabilities in step 0. */
export type RouteDecision = {
	/** Group keys to preload in step 0 (intersected with what's registered). */
	groups: string[];
	/** Why the router chose these — useful for debugging / telemetry. */
	source: "keyword" | "page-context" | "default";
	/** The set of keywords (if any) that matched. */
	matched: string[];
};

/**
 * Keyword → group(s) mapping. Order is significant: the FIRST match wins
 * for `source: "keyword"` so more-specific intents (e.g. `convert lead`)
 * land in the right group even when a less-specific keyword ("lead") is
 * also present. Each entry contributes its target group(s) to the result;
 * a match adds groups but doesn't stop subsequent entries from adding more.
 */
type KeywordRule = {
	pattern: RegExp;
	groups: string[];
};

/**
 * The keyword table. Built so it stays correct even as Stage S3+ rolls in
 * groups we don't have yet — unmatched group keys are filtered by
 * intersection with `listGroupKeys(caps)`, so the router degrades to "no
 * preload" rather than "preload a non-existent group" if a typo slips in.
 *
 * Patterns are case-insensitive and prefer word-boundary anchoring to
 * avoid eg. "tagged" matching "tag" outside an admin context.
 */
const KEYWORD_RULES: KeywordRule[] = [
	// People — code-shaped lookups + the lead/contact lifecycle verbs.
	{ pattern: /\bp-\d+\b/i, groups: ["leads", "contacts"] },
	{
		pattern:
			/\b(lead|leads|new\s+lead|create\s+lead|qualify|disqualify|convert\s+(?:this|the|to))\b/i,
		groups: ["leads"],
	},
	{ pattern: /\b(contact|contacts|book\s+(?:a\s+)?contact)\b/i, groups: ["contacts"] },

	// Deals — codes + stage moves + valuation talk.
	{ pattern: /\bd-\d+\b/i, groups: ["deals"] },
	{
		pattern:
			/\b(deal|deals|opportunity|pipeline\s+stage|move\s+(?:to|stage)|close\s+(?:the\s+)?deal|won|lost)\b/i,
		groups: ["deals"],
	},

	// Companies / accounts.
	{ pattern: /\bc-\d+\b/i, groups: ["companies"] },
	{
		pattern: /\b(company|companies|account|accounts|add\s+person\s+to)\b/i,
		groups: ["companies"],
	},

	// Tasks / scheduling — kills the dueAt class of misroute.
	{ pattern: /\bt-\d+\b/i, groups: ["tasks"] },
	{
		pattern:
			/\b(task|tasks|todo|to-?do|reminder|reminders|follow[\s-]?up|followup|schedule|reschedule|due\s+(?:date|on)|next\s+(?:tuesday|tues|monday|mon|wed|thursday|thurs|friday|fri|sat|sun|week)|tomorrow)\b/i,
		groups: ["tasks"],
	},

	// Notes + activity feed.
	{ pattern: /\b(note|notes|add\s+a\s+note|note\s+(?:for|on))\b/i, groups: ["notes"] },
	{ pattern: /\b(timeline|activity|history|recent\s+activity)\b/i, groups: ["timeline"] },

	// Notifications.
	{ pattern: /\b(notification|notifications|inbox|unread)\b/i, groups: ["notifications"] },

	// Workspace config — verb-noun bigrams only (matches the philosophy of
	// the legacy router's heuristic — bare nouns like "stage" or "field"
	// MUST NOT trigger settings on their own, or "next stage" in a task
	// request lands in the wrong group).
	{
		pattern:
			/\b(rename\s+(?:the\s+)?(?:[\w-]+\s+){0,3}(?:pipeline|stage|tag|workflow|field|role|note\s+category)|create\s+(?:a\s+|new\s+|the\s+)?(?:[\w-]+\s+){0,3}(?:pipeline|stage|tag|field|saved\s+view|role|note\s+category)|delete\s+(?:the\s+)?(?:[\w-]+\s+){0,3}(?:pipeline|stage|tag|field|saved\s+view|role)|edit\s+(?:the\s+)?(?:[\w-]+\s+){0,3}(?:pipeline|stage|workspace|role|tag|field\s+definition|saved\s+view)|reorder\s+(?:stages|tags|fields|note\s+categories))\b/i,
		groups: ["pipelines", "fields", "tags", "views", "categories"],
	},

	// Members / RBAC.
	{
		pattern:
			/\b(invite\s+(?:a\s+)?(?:member|user|teammate)|invite\s+\S+@\S+|manage\s+(?:role|member|permission)|remove\s+member)\b/i,
		groups: ["members"],
	},

	// Bulk / destructive — preload but the gate (S1) still requires step-up.
	{
		pattern: /\b(bulk\s+(?:update|delete|close)|delete\s+all|update\s+all)\b/i,
		groups: ["bulk"],
	},

	// Messaging.
	{
		pattern:
			/\b(message|messages|whatsapp|send\s+(?:a\s+)?(?:dm|message)|reply\s+(?:to|with))\b/i,
		groups: ["messaging"],
	},
];

/**
 * Pick the groups to preload for this turn.
 *
 * `caps` is the list of registered capabilities (used to filter to groups
 * that actually exist). The router never returns a group key that has no
 * capabilities — it'd be a guaranteed waste of model attention.
 */
export function adaptiveRouter(
	message: string,
	routeCtx: RouteCtx | undefined,
	caps: Capability[],
): RouteDecision {
	const registeredGroups = new Set(listGroupKeys(caps));
	const matched: string[] = [];
	const groups = new Set<string>();

	// 1. Page-context preload: if the user is on /profile/P-001, preload
	//    `leads`/`contacts` regardless of message text. Cheap and safe.
	let source: RouteDecision["source"] = "default";
	if (routeCtx?.entityType) {
		const t = routeCtx.entityType.toLowerCase();
		if (t === "lead" || t === "contact" || t === "person") {
			if (registeredGroups.has("leads")) groups.add("leads");
			if (registeredGroups.has("contacts")) groups.add("contacts");
			source = "page-context";
		} else if (t === "deal") {
			if (registeredGroups.has("deals")) groups.add("deals");
			source = "page-context";
		} else if (t === "company") {
			if (registeredGroups.has("companies")) groups.add("companies");
			source = "page-context";
		}
	}

	// 2. Keyword scan over the user's message.
	const text = message ?? "";
	for (const rule of KEYWORD_RULES) {
		if (rule.pattern.test(text)) {
			matched.push(rule.pattern.source);
			for (const g of rule.groups) {
				if (registeredGroups.has(g)) groups.add(g);
			}
			if (source !== "page-context") source = "keyword";
		}
	}

	return {
		groups: Array.from(groups).sort((a, b) => a.localeCompare(b)),
		source: groups.size > 0 ? source : "default",
		matched,
	};
}
