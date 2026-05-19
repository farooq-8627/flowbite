/**
 * Field-level activity logging helper.
 *
 * Why this exists
 * ───────────────
 * Every entity-update mutation used to emit a single activity log per call:
 *
 *     { action: "updated", description: "Lead updated: Acme Corp" }
 *
 * That meant the timeline showed "Lead updated" for every keystroke-batch
 * the user made — five renames in a row produced five identical entries
 * with no clue about what actually changed. The user couldn't tell from
 * the audit log whether someone fixed a typo, changed the assignee, or
 * moved them through statuses.
 *
 * This helper diffs the old document against the patch and emits ONE
 * activity log per changed field, with structured metadata so the
 * timeline can render a precise headline:
 *
 *     { action: "field_updated", description: "Status: new → qualified",
 *       metadata: { field: "status", fromValue: "new", toValue: "qualified" } }
 *
 * Output guarantees
 * ─────────────────
 *   - One log per primitive field that actually changed (deep-equals).
 *   - Each log carries `metadata.field` so the UI can pivot on it.
 *   - Each log carries `metadata.fromValue` + `metadata.toValue` as
 *     stringified primitives (anything more complex is summarised).
 *   - Sibling system fields (`updatedAt`, `normalizedPhone`, `sortOrder`)
 *     are ignored by default — they're noise. The caller passes
 *     `IGNORED_FIELDS` if it wants to add more.
 *   - When NO fields changed (e.g. only `updatedAt` flipped), zero logs
 *     are emitted. This silences the "Lead updated" entry that fired on
 *     every drag even when only the kanban sort order changed.
 *
 * Usage
 * ─────
 *
 *     await logFieldUpdates(ctx, {
 *       orgId, userId,
 *       entityType: "lead",
 *       entityId: leadId,
 *       personCode: lead.personCode,
 *       displayName: lead.displayName,
 *       before: lead,
 *       after: { ...lead, ...patch },
 *       fields: ["displayName", "email", "phone", "status", "source", "assignedTo"],
 *     });
 */

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { logActivity } from "../activityLogs/helpers";

/** Fields we never log — they're plumbing, not user-visible state. */
const DEFAULT_IGNORED = new Set([
	"updatedAt",
	"createdAt",
	"normalizedPhone",
	"sortOrder",
	"deletedAt",
]);

interface LogFieldUpdatesArgs {
	orgId: Id<"orgs">;
	userId: Id<"users">;
	entityType: string;
	entityId: string;
	/** When the entity is person-related, this denormalised code lets the
	    timeline read the entry from the by_org_and_personCode index. */
	personCode?: string;
	/** Human-readable subject ("Acme Corp") used in the headline tail. */
	displayName?: string;
	/** Full document BEFORE the patch — `await ctx.db.get(id)`. */
	before: Record<string, unknown>;
	/** Document AFTER the patch — `{ ...before, ...patch }`. */
	after: Record<string, unknown>;
	/** Fields the caller cares about. Anything outside this list is ignored. */
	fields: readonly string[];
	/** Extra fields to skip on top of the defaults. */
	ignored?: readonly string[];
}

/**
 * Diff `before` vs `after` over `fields` and emit one activity log per
 * field that actually changed. Returns the number of logs written.
 */
export async function logFieldUpdates(
	ctx: MutationCtx,
	args: LogFieldUpdatesArgs,
): Promise<number> {
	const ignored = new Set([...DEFAULT_IGNORED, ...(args.ignored ?? [])]);
	let logged = 0;

	for (const field of args.fields) {
		if (ignored.has(field)) continue;
		const fromRaw = args.before[field];
		const toRaw = args.after[field];

		// Deep-equality is overkill for primitives; a JSON compare catches
		// objects/arrays without a dependency on lodash. We only care that
		// "did the value actually change" — false negatives (different
		// object identity, same content) would produce noise logs.
		if (jsonEqual(fromRaw, toRaw)) continue;

		const fromValue = stringifyForLog(fromRaw);
		const toValue = stringifyForLog(toRaw);

		await logActivity(ctx, {
			orgId: args.orgId,
			userId: args.userId,
			action: "field_updated",
			entityType: args.entityType,
			entityId: args.entityId,
			personCode: args.personCode,
			description: buildDescription(field, fromValue, toValue),
			metadata: {
				field,
				fromValue,
				toValue,
			},
		});
		logged += 1;
	}

	return logged;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Coerce any value to a short, log-friendly string. */
function stringifyForLog(value: unknown): string {
	if (value === undefined || value === null) return "—";
	if (typeof value === "string") return value || "—";
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (Array.isArray(value)) return value.length === 0 ? "—" : `${value.length} items`;
	if (typeof value === "object") return "(object)";
	return String(value);
}

/** Human description: "status: new → qualified". */
function buildDescription(field: string, fromValue: string, toValue: string): string {
	const label = humanizeFieldName(field);
	return `${label}: ${fromValue} → ${toValue}`;
}

/** Convert camelCase to a friendlier label without a translation pipeline. */
function humanizeFieldName(field: string): string {
	if (!field) return field;
	const spaced = field
		.replace(/([A-Z])/g, " $1")
		.replace(/^./, (c) => c.toUpperCase())
		.trim();
	return spaced;
}

/** Stable JSON comparison — handles primitives, arrays, plain objects. */
function jsonEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (a === undefined || b === undefined) return false;
	if (a === null || b === null) return false;
	if (typeof a !== typeof b) return false;
	try {
		return JSON.stringify(a) === JSON.stringify(b);
	} catch {
		return false;
	}
}
