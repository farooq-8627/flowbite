/**
 * core/ai/components/reasoning/timelineTitles.ts
 *
 * Per-tool one-line titles for the thinking timeline. Each entry maps a
 * tool name to a function `(input, output) => { title, meta? }` so the
 * row reads like a Claude/ChatGPT trace ("Search CRM for 'sarah khan'" ·
 * "9 results") rather than the raw tool name.
 *
 * Adding a new tool? Append a row here. Unknown tools fall back to the
 * generic "<Pretty Name>" label, which still reads correctly.
 */

export interface RowTitle {
	title: string;
	/** Right-aligned metadata, e.g. "9 results" / "found" / "failed" */
	meta?: string;
}

function s(v: unknown, max = 60): string {
	if (typeof v !== "string") return "";
	const trimmed = v.trim();
	if (trimmed.length <= max) return trimmed;
	return `${trimmed.slice(0, max)}…`;
}

function arrLen(v: unknown): number {
	return Array.isArray(v) ? v.length : 0;
}

function prettify(name: string): string {
	return name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

type Resolver = (input: unknown, output: unknown) => RowTitle;

const RESOLVERS: Record<string, Resolver> = {
	// ── Always-on read tools ─────────────────────────────────────────
	search_crm: (input, output) => {
		const q = s((input as { query?: unknown })?.query);
		const o = (
			output as {
				data?: {
					leads?: unknown[];
					contacts?: unknown[];
					deals?: unknown[];
					companies?: unknown[];
				};
			}
		)?.data;
		const total =
			arrLen(o?.leads) + arrLen(o?.contacts) + arrLen(o?.deals) + arrLen(o?.companies);
		return {
			title: q ? `Search CRM for “${q}”` : "Search CRM",
			meta: o ? `${total} ${total === 1 ? "result" : "results"}` : undefined,
		};
	},
	get_entity_detail: (input) => {
		const code = s(
			(input as { personCode?: unknown; dealCode?: unknown; companyCode?: unknown })
				?.personCode ??
				(input as { dealCode?: unknown }).dealCode ??
				(input as { companyCode?: unknown }).companyCode,
		);
		return { title: code ? `Look up ${code}` : "Look up entity" };
	},
	get_dashboard_summary: () => ({ title: "Read dashboard summary" }),
	expand_tools: (input) => {
		const layer = s((input as { layer?: unknown })?.layer);
		return { title: layer ? `Activate ${prettify(layer)} layer` : "Activate tool layer" };
	},

	// ── Introspection tools (Week 1 #1.4) ────────────────────────────
	list_entity_fields: (input, output) => {
		const et = s((input as { entityType?: unknown })?.entityType);
		const count = (output as { data?: { fieldCount?: number } })?.data?.fieldCount;
		return {
			title: et ? `List ${et} fields` : "List entity fields",
			meta: typeof count === "number" ? `${count} field${count === 1 ? "" : "s"}` : undefined,
		};
	},
	list_pipelines: (_input, output) => {
		const count = (output as { data?: { pipelineCount?: number } })?.data?.pipelineCount;
		return {
			title: "List pipelines",
			meta:
				typeof count === "number"
					? `${count} pipeline${count === 1 ? "" : "s"}`
					: undefined,
		};
	},
	list_my_permissions: (_input, output) => {
		const count = (output as { data?: { count?: number } })?.data?.count;
		return {
			title: "List permissions",
			meta: typeof count === "number" ? `${count} keys` : undefined,
		};
	},
	list_active_layers: (_input, output) => {
		const expanded = (output as { data?: { expanded?: string[] } })?.data?.expanded;
		return {
			title: "List active layers",
			meta:
				expanded && expanded.length > 0 ? `${expanded.length} expanded` : "always-on only",
		};
	},

	// ── CRUD ────────────────────────────────────────────────────────
	create_lead: (input) => {
		const name = s((input as { name?: unknown })?.name);
		return { title: name ? `Create lead “${name}”` : "Create lead" };
	},
	create_contact: (input) => {
		const name = s((input as { name?: unknown })?.name);
		return { title: name ? `Create contact “${name}”` : "Create contact" };
	},
	create_company: (input) => {
		const name = s((input as { name?: unknown })?.name);
		return { title: name ? `Create company “${name}”` : "Create company" };
	},
	create_deal: (input) => {
		const title = s((input as { title?: unknown })?.title);
		return { title: title ? `Create deal “${title}”` : "Create deal" };
	},
	commit_create_lead: () => ({ title: "Save lead" }),
	commit_create_contact: () => ({ title: "Save contact" }),
	commit_create_company: () => ({ title: "Save company" }),
	commit_create_deal: () => ({ title: "Save deal" }),

	update_entity: (input) => {
		const code = s(
			(input as { personCode?: unknown; dealCode?: unknown; companyCode?: unknown })
				?.personCode ??
				(input as { dealCode?: unknown }).dealCode ??
				(input as { companyCode?: unknown }).companyCode,
		);
		return { title: code ? `Update ${code}` : "Update entity" };
	},
	commit_update_entity: () => ({ title: "Save changes" }),

	add_note: (input) => {
		const code = s((input as { personCode?: unknown; dealCode?: unknown })?.personCode);
		return { title: code ? `Add note to ${code}` : "Add note" };
	},
	create_reminder: (input) => {
		const t = s((input as { title?: unknown })?.title);
		return { title: t ? `Set reminder “${t}”` : "Set reminder" };
	},
	create_followup: () => ({ title: "Schedule follow-up" }),
	complete_reminder: () => ({ title: "Complete reminder" }),

	// ── Pipelines ───────────────────────────────────────────────────
	move_deal_stage: (input) => {
		const code = s((input as { dealCode?: unknown })?.dealCode);
		const stage = s((input as { stageCode?: unknown; stageName?: unknown })?.stageCode);
		return {
			title: code && stage ? `Move ${code} to ${stage}` : "Move deal stage",
		};
	},
	close_deal: (input) => {
		const code = s((input as { dealCode?: unknown })?.dealCode);
		const result = s((input as { result?: unknown })?.result);
		return { title: code ? `Close ${code} as ${result || "won/lost"}` : "Close deal" };
	},

	// ── Bulk ────────────────────────────────────────────────────────
	bulk_update: (input, output) => {
		const ids = arrLen((input as { ids?: unknown })?.ids);
		const ok = (output as { data?: { updated?: number } })?.data?.updated;
		return {
			title: ids ? `Bulk update ${ids} record${ids === 1 ? "" : "s"}` : "Bulk update",
			meta: typeof ok === "number" ? `${ok} updated` : undefined,
		};
	},

	// ── Interaction ─────────────────────────────────────────────────
	ask_user_choice: () => ({ title: "Ask the user to choose" }),
	ask_user_input: () => ({ title: "Ask the user for input" }),
};

/**
 * Resolve a friendly title (and optional metadata) for one tool-call row.
 * Falls back to a prettified version of the tool name.
 */
export function getRowTitle(toolName: string, input: unknown, output: unknown): RowTitle {
	const resolver = RESOLVERS[toolName];
	if (resolver) return resolver(input, output);
	return { title: prettify(toolName) };
}
