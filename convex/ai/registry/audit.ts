/**
 * Audit feed — one row per AI capability action.
 *
 * Reuses `activityLogs` (locked decision #11 + schema rule 7) with
 * `actorType:"ai"`. `writeAudit` is called from `runCapability` AFTER
 * `cap.run()` resolves (success OR business_error), schedules an internal
 * mutation, and NEVER throws — telemetry must not break the model's turn.
 *
 * Args are redacted before storage: sensitive keys dropped, long values
 * truncated, only top-level shape kept. Auditors see WHICH capability ran
 * with WHAT shape — never raw secrets.
 */
import type { ActionCtx } from "../../_generated/server";
import type { Capability, CapabilityCtx, CapabilityResult, Outcome } from "./types";

// ─── Tunables ───────────────────────────────────────────────────────────────

/** Audit only outcomes where the capability actually executed (or tried to). */
const AUDITABLE_OUTCOMES: ReadonlySet<Outcome> = new Set([
	"ok",
	"partial",
	"business_error",
	"infra_retry",
]);

/** Sensitive keys never persisted to the audit row, even truncated. */
const SENSITIVE_KEYS: ReadonlySet<string> = new Set([
	"password",
	"secret",
	"token",
	"apiKey",
	"api_key",
	"ssn",
	"creditCard",
	"credit_card",
	"cvv",
	"otp",
	"authorization",
	"auth",
]);

/** Max chars for any single redacted value before it's truncated. */
const MAX_VALUE_LENGTH = 60;

/** Max top-level keys retained in the redacted summary. */
const MAX_KEYS = 12;

// ─── Types ──────────────────────────────────────────────────────────────────

/** Where the action originated. Channel-or-trigger; small free-form string. */
export type AuditSource =
	| "chat"
	| "whatsapp"
	| "mcp"
	| "rest"
	| "autonomous"
	| "autonomous_reply"
	| "standing_order";

/** What `writeAudit` receives. Pure shape — easy to test without a live ctx. */
export type AuditEvent = {
	capability: Capability;
	args: unknown;
	result: CapabilityResult;
	ctx: CapabilityCtx;
	/** Optional override; defaults to `principal.channel` when omitted. */
	source?: AuditSource;
};

/** The redacted args shape persisted on the audit row's metadata blob. */
export type RedactedArgs = {
	keys: string[];
	values: Record<string, string>;
	truncated: boolean;
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Write one audit row for a capability run. Never throws. Skips when:
 *   - the outcome doesn't represent execution (denied / channel_blocked / etc.),
 *   - `ctx.ctx` is undefined (test harness — keeps unit tests pure),
 *   - the scheduler call itself throws (caught + logged + swallowed).
 */
export async function writeAudit(event: AuditEvent): Promise<void> {
	try {
		if (!AUDITABLE_OUTCOMES.has(event.result.status)) return;
		const ctx = event.ctx.ctx as ActionCtx | undefined;
		if (!ctx || typeof ctx.runMutation !== "function") return;

		const redacted = redactArgs(event.args);
		const source = event.source ?? event.ctx.principal.channel;
		const description = buildDescription(event);
		const metadata = buildMetadata(event, redacted, source);

		const { internal } = await import("../../_generated/api");
		await ctx.runMutation(internal.ai._logAIActivityInternal.logAIActivity, {
			orgId: event.ctx.principal.orgId,
			userId: event.ctx.principal.userId,
			action: `ai.cap.${event.capability.name}`,
			entityType: "ai_capability",
			entityId: event.capability.name,
			description,
			toolName: event.capability.name,
			...(metadata ? { metadata } : {}),
		});
	} catch (err) {
		// Audit failures must never break the user's turn. Keep the warning
		// short — not the same as a structured log line.
		console.warn("[ai/audit] writeAudit failed:", err);
	}
}

// ─── Redaction ──────────────────────────────────────────────────────────────

/**
 * Redact args for storage. Walks ONLY the top-level shape — drops sensitive
 * keys, truncates long values, stringifies primitives, replaces nested
 * objects with the literal `"{…}"` and arrays with `"[N items]"`.
 *
 * Exported for test reuse.
 */
export function redactArgs(args: unknown): RedactedArgs {
	if (!args || typeof args !== "object") {
		return { keys: [], values: {}, truncated: false };
	}
	const entries = Object.entries(args as Record<string, unknown>);
	const allKeys = entries.map(([k]) => k);
	const truncated = entries.length > MAX_KEYS;
	const limited = entries.slice(0, MAX_KEYS);

	const values: Record<string, string> = {};
	for (const [key, value] of limited) {
		if (SENSITIVE_KEYS.has(key.toLowerCase())) {
			values[key] = "[redacted]";
			continue;
		}
		values[key] = stringifyShallow(value);
	}
	return { keys: allKeys, values, truncated };
}

/** Convert one arg value to a short, audit-safe string. */
function stringifyShallow(value: unknown): string {
	if (value === null) return "null";
	if (value === undefined) return "undefined";
	const t = typeof value;
	if (t === "string") return truncate(value as string);
	if (t === "number" || t === "boolean" || t === "bigint") return String(value);
	if (Array.isArray(value)) return `[${value.length} items]`;
	if (t === "object") return "{…}";
	return truncate(String(value));
}

function truncate(s: string, max = MAX_VALUE_LENGTH): string {
	return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// ─── Description + metadata builders ───────────────────────────────────────

/** Build the activityLogs `description` — short human-readable line. */
function buildDescription(event: AuditEvent): string {
	const status = event.result.status;
	const headline = truncate(event.result.headline ?? "", 120);
	const verb = status === "ok" || status === "partial" ? "ran" : `failed (${status})`;
	return headline.length > 0
		? `AI ${verb} ${event.capability.name}: ${headline}`
		: `AI ${verb} ${event.capability.name}`;
}

/**
 * Pack the redacted args + outcome facets into a `metadata` map. The
 * activityLogs validator only accepts string/number/boolean values, so we
 * stringify-then-pack — auditors deserialise from the JSON blob.
 */
function buildMetadata(
	event: AuditEvent,
	redacted: RedactedArgs,
	source: string,
): Record<string, string | number | boolean> | undefined {
	const md: Record<string, string | number | boolean> = {
		status: event.result.status,
		channel: event.ctx.principal.channel,
		source,
		riskTier: event.capability.risk,
		module: event.capability.module,
		group: event.capability.group,
		argKeys: redacted.keys.join(","),
		argSummary: serialiseValues(redacted.values),
	};
	if (redacted.truncated) md.argTruncated = true;
	if (event.ctx.conversationId) md.conversationId = String(event.ctx.conversationId);
	if (event.result.errors && event.result.errors.length > 0) {
		md.errorCount = event.result.errors.length;
	}
	return md;
}

/** Stringify `{key: value}` map as `key1=value1; key2=value2` capped to MAX. */
function serialiseValues(values: Record<string, string>): string {
	const parts: string[] = [];
	for (const [k, v] of Object.entries(values)) {
		parts.push(`${k}=${v}`);
	}
	return truncate(parts.join("; "), 480);
}
