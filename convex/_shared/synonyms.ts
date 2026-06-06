/**
 * convex/_shared/synonyms.ts
 *
 * Single source of truth for LLM-friendly synonym maps used across AI tools.
 *
 * **Why this exists** (`PHASE-3-AI-AUDIT.md §6.5 E.T1.4`).
 *
 * Smaller models (NVIDIA Llama-3.3-70B, Gemini 2.5 Flash, Kimi K2) routinely
 * emit `entityType: "leads"` (plural) when the user said "leads", or
 * `fieldType: "file"` when the user wants to upload an attachment. The Zod
 * enum schemas accept only the canonical values (`"lead"`, not `"leads"`;
 * `"text"|"number"|"select"|...`, no `"file"`), so the call rejects, the
 * model retries with the same args, and the agent loop chews through its
 * step budget.
 *
 * The fix is **schema-level synonym coercion** — `z.preprocess` runs BEFORE
 * the inner validator and rewrites `"leads"` → `"lead"`, `"picklist"` →
 * `"select"`, `"file"` → `__NEEDS_CLARIFICATION__` (a sentinel the tool
 * picks up to call `ask_user_choice` instead of throwing).
 *
 * **Add new synonyms here, never inline.** Inline maps go stale; this
 * module is the canonical reference cited from every audit row.
 */

import { z } from "zod";

// ─── Sentinel values ─────────────────────────────────────────────────────────

/**
 * Marker the model emits (via the synonym map below) when its requested
 * fieldType has no canonical mapping. Tool execute branches detect it and
 * call `ask_user_choice` instead of throwing a Zod error.
 */
export const NEEDS_CLARIFICATION = "__NEEDS_CLARIFICATION__" as const;
export type NeedsClarification = typeof NEEDS_CLARIFICATION;

// ─── Entity-type synonyms ────────────────────────────────────────────────────
//
// CRM entity tools accept these singular ids: lead, contact, deal, company.
// Add lowercase variants only — the preprocess step lowercases input first.
//
// "people" is intentionally NOT mapped to a single value — it could mean
// lead OR contact depending on context. We send it through unchanged so the
// existing enum validator throws, and the model is told to ask_user_choice
// via the runbook on each create_* tool.

const ENTITY_TYPE_MAP: Record<string, string> = {
	// Plurals
	leads: "lead",
	contacts: "contact",
	deals: "deal",
	opportunities: "deal",
	companies: "company",
	accounts: "company",
	// Common variants
	prospect: "lead",
	prospects: "lead",
	person: "contact",
	persons: "contact",
	customer: "contact",
	customers: "contact",
	business: "company",
	businesses: "company",
	organization: "company",
	organizations: "company",
	organisation: "company",
	organisations: "company",
	firm: "company",
	firms: "company",
};

// ─── Per-turn org-label overrides (locked 2026-06-06) ──────────────────────
//
// Orgs can rename `lead → "Inquiry"`, `contact → "Client"`, etc. via
// `org.settings.entityLabels`. The describe_workspace tool already exposes
// those labels to the model, but smaller models (Gemini Flash, NVIDIA
// Llama, Mistrals) routinely emit `entityType: "inquiry"` when they should
// emit `"lead"` — the static map above doesn't know about per-org labels,
// so the Zod enum rejects the call and the agent burns a step retrying.
//
// Fix: `runtime/host.ts:runAgent` builds per-org aliases at turn start
// from `args.org.entityLabels` (lowercased singular + plural + slug → the
// canonical slot) and calls `setPerTurnEntityAliases(...)` BEFORE
// `streamText`. The Zod preprocessor below checks per-turn overrides
// first, then the static map. The host clears the overrides in a
// `finally` block so a previous turn's aliases never leak into the next.
//
// Race-safety: Convex actions run in their own V8 isolate per call. The
// streaming tool-call loop is sequential within a turn (no concurrent
// validation), so a simple module-level let is correct here. If we ever
// move to multi-turn concurrency in the same isolate, swap to
// `node:async_hooks::AsyncLocalStorage` (not done now to keep this file
// importable from non-Node convex modules — the synonym preprocessor is
// consumed by both action and mutation contexts).

let perTurnEntityAliases: Record<string, string> = {};

/**
 * Install per-turn entity-type aliases. Call once at turn start, BEFORE
 * any tool invocation runs. The map MUST use lowercased keys; the
 * preprocess pipeline lowercases the model's input before lookup.
 *
 * Idempotent — calling twice replaces the previous map.
 */
export function setPerTurnEntityAliases(aliases: Record<string, string>): void {
	perTurnEntityAliases = aliases;
}

/**
 * Drop the per-turn override map. Caller MUST run this in a `finally`
 * block around `streamText` so a leaked alias from a previous turn never
 * coerces an unrelated org's input.
 */
export function clearPerTurnEntityAliases(): void {
	perTurnEntityAliases = {};
}

/**
 * Build the per-turn alias map from an org's `entityLabels`. Walks every
 * slot's `singular` + `plural` + `slug` and maps each lowercased form to
 * the canonical slot. Already-canonical labels (`"Lead" → "lead"`) collapse
 * to identity entries which is harmless. Returns an empty map when the
 * caller passes `undefined` (e.g. tests, back-compat callers).
 *
 * Example: org renamed lead → "Inquiry" (plural "Inquiries", slug
 * "inquiries"). Returns `{ inquiry: "lead", inquiries: "lead", lead: "lead", leads: "lead" }`.
 */
export function buildOrgEntityAliases(
	labels:
		| {
				lead?: { singular?: string; plural?: string; slug?: string };
				contact?: { singular?: string; plural?: string; slug?: string };
				deal?: { singular?: string; plural?: string; slug?: string };
				company?: { singular?: string; plural?: string; slug?: string };
		  }
		| undefined,
): Record<string, string> {
	if (!labels) return {};
	const out: Record<string, string> = {};
	const slots: Array<["lead" | "contact" | "deal" | "company"]> = [
		["lead"],
		["contact"],
		["deal"],
		["company"],
	];
	for (const [slot] of slots) {
		const variants = labels[slot];
		if (!variants) continue;
		for (const form of [variants.singular, variants.plural, variants.slug]) {
			if (typeof form === "string" && form.length > 0) {
				out[form.toLowerCase()] = slot;
			}
		}
	}
	return out;
}

/**
 * Map a user/model-supplied entity type string to its canonical singular
 * form. Per-turn org-label overrides take precedence over the static
 * synonym map; the static map is the fallback for orgs that haven't
 * customised labels. Returns the input lowercased if no mapping is known
 * — the caller's Zod enum then validates against the canonical set.
 */
export function canonicalEntityType(raw: unknown): unknown {
	if (typeof raw !== "string") return raw;
	const key = raw.trim().toLowerCase();
	return perTurnEntityAliases[key] ?? ENTITY_TYPE_MAP[key] ?? key;
}

/**
 * Wrap an entityType enum so plural / variant inputs are coerced to the
 * canonical singular form before the enum validator runs.
 *
 * ```ts
 * entityType: entityTypeEnum() // accepts "lead"|"contact"|"deal"|"company"
 *                              // also auto-maps "leads"|"opportunities"|...
 * ```
 */
export function entityTypeEnum() {
	return z.preprocess(canonicalEntityType, z.enum(["lead", "contact", "deal", "company"]));
}

// ─── Field-type synonyms ─────────────────────────────────────────────────────
//
// Custom-field types accept these ids: text, number, select, multiselect,
// date, boolean, url, email. Tools that hit a non-canonical value should
// call ask_user_choice instead of throwing — the sentinel below is the
// mechanism for that branch.

const FIELD_TYPE_MAP: Record<string, string | NeedsClarification> = {
	// Direct synonyms
	picklist: "select",
	dropdown: "select",
	choice: "select",
	choices: "multiselect",
	"multi-select": "multiselect",
	"multi-choice": "multiselect",
	tags: "multiselect",
	checkbox: "boolean",
	bool: "boolean",
	yes_no: "boolean",
	yesno: "boolean",
	int: "number",
	integer: "number",
	float: "number",
	decimal: "number",
	currency: "number",
	money: "number",
	link: "url",
	website: "url",
	hyperlink: "url",
	"e-mail": "email",
	mail: "email",
	datetime: "date",
	timestamp: "date",
	day: "date",
	textarea: "text",
	"long-text": "text",
	longtext: "text",
	string: "text",
	str: "text",
	// Sentinel — needs explicit user clarification
	file: NEEDS_CLARIFICATION,
	files: NEEDS_CLARIFICATION,
	upload: NEEDS_CLARIFICATION,
	uploads: NEEDS_CLARIFICATION,
	attachment: NEEDS_CLARIFICATION,
	attachments: NEEDS_CLARIFICATION,
	image: NEEDS_CLARIFICATION,
	images: NEEDS_CLARIFICATION,
	photo: NEEDS_CLARIFICATION,
	photos: NEEDS_CLARIFICATION,
	document: NEEDS_CLARIFICATION,
	pdf: NEEDS_CLARIFICATION,
};

/**
 * Map a user/model-supplied field type to its canonical id. Returns
 * `__NEEDS_CLARIFICATION__` for "file"/"upload"/"attachment" etc. so the
 * tool branch can ask the user which canonical type they meant. Unknown
 * values fall through unchanged so the enum validator throws.
 */
export function canonicalFieldType(raw: unknown): unknown {
	if (typeof raw !== "string") return raw;
	const key = raw.trim().toLowerCase();
	return FIELD_TYPE_MAP[key] ?? key;
}

/**
 * Wrap a fieldType enum so common synonyms are auto-mapped and
 * file-shaped intents resolve to the `__NEEDS_CLARIFICATION__` sentinel.
 *
 * Tools using this enum MUST handle the sentinel in their execute branch:
 *
 * ```ts
 * if (args.fieldType === NEEDS_CLARIFICATION) {
 *   return askUserChoice("Which type of field do you want?", FIELD_TYPE_OPTIONS);
 * }
 * ```
 */
export function fieldTypeEnum() {
	return z.preprocess(
		canonicalFieldType,
		z.enum([
			"text",
			"number",
			"select",
			"multiselect",
			"date",
			"boolean",
			"url",
			"email",
			NEEDS_CLARIFICATION,
		]),
	);
}

/**
 * Canonical fieldType set the model should pick from when the user is asked
 * to clarify (see `NEEDS_CLARIFICATION` branch above). Used by the
 * `ask_user_choice` helper inside `create_field`.
 */
export const FIELD_TYPE_CLARIFICATION_OPTIONS: ReadonlyArray<{
	value: string;
	label: string;
	hint?: string;
}> = [
	{ value: "text", label: "Text", hint: "Free-form text — names, descriptions" },
	{ value: "number", label: "Number", hint: "Whole or decimal numbers" },
	{ value: "select", label: "Select (one)", hint: "Pick one from a list" },
	{ value: "multiselect", label: "Multiselect", hint: "Pick many from a list" },
	{ value: "date", label: "Date", hint: "Calendar date" },
	{ value: "boolean", label: "Yes / No", hint: "True or false" },
	{ value: "url", label: "URL", hint: "Website or link" },
	{ value: "email", label: "Email", hint: "Email address" },
];

// ─── Code normalisation ──────────────────────────────────────────────────────
//
// PHASE-3-AI-AUDIT.md §6.5 audit row 5. Codes used by the AI follow the shape
// `<PREFIX>-<NUMBER>` (P-001, D-042, CO-007, T-003). Small models routinely
// emit them without the dash (`P001`), with extra spaces (`P 001`), or in a
// mixed case (`p-001`). All variants should resolve to the canonical form
// before we hit the indexed `getByXCode` queries — those are case-sensitive
// and exact-match.
//
// Rules (intentionally narrow — false-coercion would silently re-route to a
// different record):
//   • Prefix is any LETTERS-only run at the start (case-insensitive). We
//     uppercase it.
//   • Number is the trailing digit run. We zero-pad to at least 3 digits
//     so `P-7` → `P-007` (matches the generator's default width).
//   • Spaces / underscores / dots between prefix and number are collapsed
//     to a single dash.
//   • Anything else (no letters, no digits, weird suffixes like "P-001a")
//     is returned UNCHANGED. The caller's exact-match query will fail
//     loudly and the model's runbook will tell it to fall back to
//     `search_crm` — that's safer than silently rewriting to a sibling.
//
// Returns the original input verbatim when the value isn't a string.

const CODE_RE = /^\s*([A-Za-z]{1,4})\s*[-_. ]?\s*(\d{1,8})\s*$/;
const MIN_NUMBER_WIDTH = 3;

/**
 * Map a raw code (e.g. `"P001"`, `"  d-42 "`, `"co_7"`) to its canonical
 * form (`"P-001"`, `"D-042"`, `"CO-007"`). Non-strings + unparseable
 * inputs pass through unchanged so callers can still see the original
 * value for error messages.
 */
export function normaliseCode(raw: unknown): unknown {
	if (typeof raw !== "string") return raw;
	const m = raw.match(CODE_RE);
	if (!m) return raw;
	const prefix = m[1].toUpperCase();
	const number = m[2].padStart(MIN_NUMBER_WIDTH, "0");
	return `${prefix}-${number}`;
}

/**
 * Wrap a `z.string()` so the model's emitted code is normalised BEFORE the
 * inner validator runs. Use in tool schemas:
 *
 * ```ts
 * code: codeString().describe("personCode (P-XXX), dealCode (D-XXX), …")
 * ```
 *
 * Pairs with `entityTypeEnum()` so plural / casing variants both coerce
 * cleanly without requiring the model to be precise.
 */
export function codeString(): z.ZodTypeAny {
	return z.preprocess((v) => normaliseCode(v), z.string().min(1));
}
