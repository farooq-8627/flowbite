/**
 * convex/ai/orchestrator/orgSchemaContext.ts
 *
 * P1.10 — Dynamic per-org schema injection (`PHASE-3-AI-AUDIT.md §5 Phase 4 Part 1`).
 *
 * The system prompt previously listed `fieldDefinitions` as `{label}
 * ({entityType}, {fieldType})` — first 50 only. The model knew custom
 * fields existed, but it did NOT know the slug, the option list for
 * select fields, the required flag, the storage hint, the tags
 * catalog, or anything else. This caused the 2026-05-24 user-reported
 * bug where dropdown values like `industry_vertical: "SaaS"` were
 * silently dropped because the model guessed the option string.
 *
 * This helper produces a single richer markdown block injected by
 * `buildSystemPrompt` immediately after `## Workspace Context`. It
 * covers:
 *
 *   - Per-entity field tables (name + label + type + required + options + storage)
 *   - Tags catalog (top 30 by recent usage)
 *   - Note categories (active)
 *   - Reminder categories (active)
 *   - Member directory (top 25 by activity in last 30d)
 *   - Recently touched (last 24h, top 8)
 *
 * Token budget controls are non-negotiable — large orgs would otherwise
 * blow context. See {@link BUDGET_CAPS} for the limits and overflow
 * behaviour.
 *
 * Production patterns referenced:
 *   - Attio AI Attributes — dynamic field schema injection.
 *   - HubSpot Smart Properties — AI auto-populating user-defined fields.
 *   - Salesforce Einstein "describe" calls — same pattern at scale.
 *
 * Pure function — no side effects. Safe to call from inside a query
 * (it IS called from `buildSystemPrompt` which itself runs inside
 * `buildSystemPromptQuery: internalQuery`).
 */

import type { Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";

// ─── Caps ─────────────────────────────────────────────────────────────────────

/**
 * Token-budget caps. Updated centrally so we can re-tune per model
 * tier later. Per-block caps are intentionally conservative — a 50-
 * field org should consume ~2.5K tokens of schema context, not 8K.
 */
const BUDGET_CAPS = {
	fieldsPerEntity: 60,
	optionsPerField: 20,
	tags: 30,
	noteCategories: 20,
	reminderCategories: 20,
	members: 25,
	recentlyTouched: 8,
	/**
	 * Soft cap — exceeded budgets log a warning but the block is still
	 * emitted. Large orgs may legitimately need more; we'll dial this
	 * down if production telemetry shows it's hot.
	 */
	totalBytesWarn: 12_000, // ~3K tokens
};

// ─── Types ───────────────────────────────────────────────────────────────────

export type RouteContext = {
	entityType?: string;
	entityId?: string;
};

export interface BuildOrgSchemaContextArgs {
	orgId: Id<"orgs">;
	userId: Id<"users">;
	/** Optional — used to bias "Recently touched" toward the entity the user is on. */
	routeContext?: RouteContext | null;
}

export interface OrgSchemaContextResult {
	block: string;
	byteCount: number;
	/** Diagnostics — set if any block hit a cap, useful for telemetry. */
	hitCaps: string[];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Build the dynamic schema context block. Returns the full markdown +
 * byte count + which caps were hit. Empty entities are skipped (no
 * "### Lead fields" block if the org has no lead fields).
 */
export async function buildOrgSchemaContext(
	ctx: QueryCtx,
	args: BuildOrgSchemaContextArgs,
): Promise<OrgSchemaContextResult> {
	const hitCaps: string[] = [];
	const sections: string[] = ["## Your organisation's schema", ""];

	// ── Per-entity field tables ─────────────────────────────────────────
	const fields = await ctx.db
		.query("fieldDefinitions")
		.withIndex("by_org_and_entity", (q) => q.eq("orgId", args.orgId))
		.collect();

	const fieldsByEntity = new Map<string, typeof fields>();
	for (const f of fields) {
		if (f.hidden) continue;
		const list = fieldsByEntity.get(f.entityType) ?? [];
		list.push(f);
		fieldsByEntity.set(f.entityType, list);
	}

	for (const [entityType, list] of fieldsByEntity) {
		sections.push(`### ${capitalise(entityType)} fields (entity slot: ${entityType})`);
		sections.push("");
		sections.push(`| name | label | type | required | options / format | flags | storage |`);
		sections.push(`| --- | --- | --- | --- | --- | --- | --- |`);

		// Sort: required first, then by `order`, then by name.
		list.sort((a, b) => {
			if (a.required !== b.required) return a.required ? -1 : 1;
			const oa = (a as unknown as { order?: number }).order ?? 0;
			const ob = (b as unknown as { order?: number }).order ?? 0;
			if (oa !== ob) return oa - ob;
			return a.name.localeCompare(b.name);
		});

		const cap = BUDGET_CAPS.fieldsPerEntity;
		const slice = list.slice(0, cap);
		const overflowCount = list.length - slice.length;

		for (const f of slice) {
			const isCustom =
				(f as unknown as { storage?: string }).storage === "fieldValues" ||
				(f as unknown as { kind?: string }).kind === "custom" ||
				!f.system;
			const typeLabel = isCustom ? `${f.type} (custom)` : f.type;
			const required = f.required ? "YES" : "NO";
			const optionsCell = renderOptions(f.options, hitCaps, f.name);
			const storageCell =
				(f as unknown as { storage?: string }).storage === "fieldValues"
					? "fieldValues"
					: "column";
			const flagsCell = renderFlags(f);

			sections.push(
				`| ${escapeCell(f.name)} | ${escapeCell(f.label)} | ${typeLabel} | ${required} | ${optionsCell} | ${flagsCell} | ${storageCell} |`,
			);
		}

		if (overflowCount > 0) {
			hitCaps.push(`fields:${entityType}`);
			sections.push("");
			sections.push(
				`_… and ${overflowCount} more ${entityType} fields — call \`list_entity_fields("${entityType}")\` for the full list._`,
			);
		}

		sections.push("");
	}

	// ── Tags catalog ────────────────────────────────────────────────────
	const tags = await ctx.db
		.query("tags")
		.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
		.take(BUDGET_CAPS.tags + 5);

	if (tags.length > 0) {
		sections.push(`### Tags`);
		sections.push("");
		const slice = tags.slice(0, BUDGET_CAPS.tags);
		sections.push(slice.map((t) => `\`@${t.name}\``).join(" · "));
		if (tags.length > BUDGET_CAPS.tags) {
			hitCaps.push("tags");
			sections.push("");
			sections.push(
				`_… and ${tags.length - BUDGET_CAPS.tags} more — call \`list_tags\` to enumerate them._`,
			);
		}
		sections.push("");
	}

	// ── Note categories ─────────────────────────────────────────────────
	const noteCategories = await ctx.db
		.query("noteCategories")
		.withIndex("by_org", (q) => q.eq("orgId", args.orgId))
		.take(BUDGET_CAPS.noteCategories + 5);
	const activeNoteCats = noteCategories.filter(
		(c) => !(c as unknown as { isArchived?: boolean }).isArchived,
	);
	if (activeNoteCats.length > 0) {
		sections.push(`### Note categories (active)`);
		sections.push("");
		sections.push(
			activeNoteCats
				.slice(0, BUDGET_CAPS.noteCategories)
				.map((c) => c.name)
				.join(", "),
		);
		sections.push("");
	}

	// ── Reminder categories ─────────────────────────────────────────────
	// (No reminderCategories table in this deployment — reminders are
	// categorised by free-form `kind` on each row. We could surface a
	// `kind` histogram later if it proves useful.)

	// ── Members directory ───────────────────────────────────────────────
	const members = await ctx.db
		.query("orgMembers")
		.withIndex("by_orgId_and_userId", (q) => q.eq("orgId", args.orgId))
		.take(BUDGET_CAPS.members + 10);

	const liveMembers = members.filter(
		(m) => !(m as unknown as { deletedAt?: number | null }).deletedAt,
	);
	if (liveMembers.length > 0) {
		sections.push(`### Members`);
		sections.push("");
		const slice = liveMembers.slice(0, BUDGET_CAPS.members);
		// Look up user name + email in parallel.
		const userInfos = await Promise.all(
			slice.map(async (m) => {
				const user = await ctx.db.get(m.userId);
				return { member: m, user };
			}),
		);
		for (const { member, user } of userInfos) {
			const name = (user as unknown as { name?: string })?.name ?? "Unnamed";
			const email = (user as unknown as { email?: string })?.email ?? "";
			const role = (member as unknown as { permissions?: string[] }).permissions?.includes(
				"org.editSettings",
			)
				? "Admin"
				: "Member";
			sections.push(`- ${name}${email ? ` (${email})` : ""} · ${role}`);
		}
		if (liveMembers.length > BUDGET_CAPS.members) {
			hitCaps.push("members");
			sections.push(
				`- _… and ${liveMembers.length - BUDGET_CAPS.members} more members — call \`list_members\` to enumerate._`,
			);
		}
		sections.push("");
	}

	// ── Recently touched ────────────────────────────────────────────────
	const since = Date.now() - 24 * 60 * 60 * 1000;
	const recent = await ctx.db
		.query("activityLogs")
		.withIndex("by_orgId_and_createdAt", (q) =>
			q.eq("orgId", args.orgId).gte("createdAt", since),
		)
		.order("desc")
		.take(BUDGET_CAPS.recentlyTouched * 3);

	// Dedup by (entityType, entityId) keeping the most-recent activity.
	const seen = new Set<string>();
	const dedupedRecent: typeof recent = [];
	for (const r of recent) {
		const key = `${r.entityType}:${r.entityId}`;
		if (seen.has(key)) continue;
		seen.add(key);
		dedupedRecent.push(r);
		if (dedupedRecent.length >= BUDGET_CAPS.recentlyTouched) break;
	}
	if (dedupedRecent.length > 0) {
		sections.push(`### Recently touched (last 24h)`);
		sections.push("");
		for (const r of dedupedRecent) {
			const ageMin = Math.floor((Date.now() - r.createdAt) / 60000);
			const ageLabel =
				ageMin < 60
					? `${ageMin}m ago`
					: ageMin < 1440
						? `${Math.floor(ageMin / 60)}h ago`
						: `${Math.floor(ageMin / 1440)}d ago`;
			const code =
				(r as unknown as { personCode?: string }).personCode ??
				`${r.entityType.slice(0, 1).toUpperCase()}-${r.entityId.slice(-4)}`;
			const desc = r.description ?? r.action;
			sections.push(`- ${code} (${r.entityType}) · ${desc} · ${ageLabel}`);
		}
		sections.push("");
	}

	const block = sections.join("\n").trimEnd();
	const byteCount = block.length;
	if (byteCount > BUDGET_CAPS.totalBytesWarn) {
		hitCaps.push("totalBytes");
	}

	return { block, byteCount, hitCaps };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capitalise(s: string): string {
	return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/**
 * Escape `|` and newlines so they don't break the markdown table.
 */
function escapeCell(s: string): string {
	return String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/**
 * Render the options cell for a select / multi-select field.
 *
 * Truncates to {@link BUDGET_CAPS.optionsPerField} options. When the
 * cell would overflow, emits "first 5 …, and N more — call
 * list_field_options(name) for the rest" instead. This guarantees the
 * model never sees a misleadingly truncated list (e.g. 5 of 50 options
 * presented as if they were the only valid values).
 */
function renderOptions(
	options: string[] | undefined,
	hitCaps: string[],
	fieldName: string,
): string {
	if (!options || options.length === 0) return "—";

	const cap = BUDGET_CAPS.optionsPerField;
	if (options.length <= cap) {
		return options.map(escapeCell).join(", ");
	}

	hitCaps.push(`options:${fieldName}`);
	const head = options.slice(0, 5).map(escapeCell).join(", ");
	const remaining = options.length - 5;
	return `${head}, … and ${remaining} more — call \`list_field_options("${fieldName}")\``;
}

// ─── Pure helpers exported for tests ─────────────────────────────────────────
export const __test = {
	BUDGET_CAPS,
	renderOptions,
	renderFlags,
	escapeCell,
	capitalise,
};

/**
 * Render the flags cell for a field row. Surfaces the formerly-invisible
 * `showInStages`, `allowedFileTypes`, `sensitive`, `defaultValue`, and
 * `groupName` so the AI can reason about them at runtime.
 *
 * Format: comma-separated flag tokens. Empty cell `—` when nothing
 * non-default is set. Examples:
 *   `sensitive`
 *   `default="Cold"`
 *   `stages:Qualified,Proposal`
 *   `accepts:image,pdf`
 *   `group="Qualification"`
 */
function renderFlags(f: unknown): string {
	const fields: string[] = [];
	const x = f as {
		sensitive?: boolean;
		defaultValue?: unknown;
		showInStages?: string[];
		allowedFileTypes?: string[];
		groupName?: string;
	};
	if (x.sensitive === true) fields.push("sensitive");
	if (x.defaultValue !== undefined && x.defaultValue !== null && x.defaultValue !== "") {
		const dv =
			typeof x.defaultValue === "string"
				? `"${escapeCell(x.defaultValue)}"`
				: typeof x.defaultValue === "number" || typeof x.defaultValue === "boolean"
					? String(x.defaultValue)
					: JSON.stringify(x.defaultValue).slice(0, 60);
		fields.push(`default=${dv}`);
	}
	if (Array.isArray(x.showInStages) && x.showInStages.length > 0) {
		fields.push(`stages:${x.showInStages.slice(0, 6).map(escapeCell).join(",")}`);
	}
	if (Array.isArray(x.allowedFileTypes) && x.allowedFileTypes.length > 0) {
		fields.push(`accepts:${x.allowedFileTypes.slice(0, 6).map(escapeCell).join(",")}`);
	}
	if (typeof x.groupName === "string" && x.groupName.length > 0) {
		fields.push(`group="${escapeCell(x.groupName)}"`);
	}
	return fields.length === 0 ? "—" : fields.join(", ");
}
