/**
 * convex/ai/systemPrompt.ts
 *
 * 3-layer system prompt builder.
 *   Layer 1 — PLATFORM CONTEXT (from platformContext table; same for everyone)
 *   Layer 2 — ORG CONTEXT (org name, industry, entity labels, pipelines, custom fields)
 *   Layer 3 — ROUTE/ENTITY CONTEXT (entity aiContext blob when user is on an entity page)
 *
 * Week 2.4 (`PHASE-3-AI-AUDIT.md §6 Week 2`): builder takes a `subagent`
 * argument. The subagent's `systemPromptHint` is appended verbatim and the
 * tool-runbooks block only emits runbooks for tools the subagent allows.
 *
 * Week 3.2 (`PHASE-3-AI-AUDIT.md §6 Week 3`): builder takes a `contextBag`
 * snapshot. The bag is rendered as a "## Facts already known" section so
 * the model never has to re-ask for facts the user already supplied.
 */
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { ModelTier } from "./models";
import { buildOrgSchemaContext } from "./orchestrator/orgSchemaContext";
import { getSubagent, type SubagentId } from "./subagents";
import { formatRunbooksBlock, getActiveRunbooks } from "./toolRegistry";

export type RouteContext = {
	entityType: string;
	entityId: string;
	personCode?: string;
	dealCode?: string;
	name?: string;
	aiContextSummary?: string;
	aiContextKeyFacts?: string[];
};

/**
 * Phase 4 Part 1 P1.13 — `## Current page` route awareness.
 *
 * `mode` discriminates broad page categories so the model knows whether
 * the user is on a list view (look at filters), the dashboard (top-level
 * overview), calendar (time-scoped focus), etc.
 *
 *   "entity"    — an entity detail page (lead/contact/deal/company)
 *   "list"      — a list view (kanban / table) for an entity slot
 *   "dashboard" — the workspace dashboard
 *   "calendar"  — calendar / reminders view
 *   "settings"  — any /settings page
 *   "reports"   — analytics / reports views
 *   "other"     — fallback
 */
export type PageContext = {
	mode: "entity" | "list" | "dashboard" | "calendar" | "settings" | "reports" | "other";
	/** Pathname (without locale + orgSlug prefix) — e.g. "/dashboard", "/leads", "/profile/P-001". */
	path: string;
	/** Optional human-readable label rendered alongside the mode for the model. */
	label?: string;
};

export type SystemPromptResult = {
	system: string;
	allowedLayers: string[];
	subagentId: SubagentId;
};

/**
 * Build the full system prompt for a request.
 *
 * @param ctx - Convex QueryCtx (read-only; called from inside processChat internalAction via runQuery)
 * @param args.orgId - The org being served
 * @param args.userId - The calling user
 * @param args.permissions - Resolved permissions array from org member role
 * @param args.modelTier - Resolved model tier (small/standard/premium)
 * @param args.routeContext - Optional entity context from current page (free, no tokens)
 * @param args.autoContextLoad - User preference: whether to inject entity context
 * @param args.expandedLayers - Tool layers already expanded for this conversation
 * @param args.subagentId - The subagent the router selected for this turn (Week 2.4).
 *                          When omitted, falls back to `crm_action`.
 * @param args.contextBag - Per-conversation typed facts (Week 3.2). Injected as
 *                          "Facts already known" so the model doesn't re-ask.
 */
export async function buildSystemPrompt(
	ctx: QueryCtx,
	args: {
		orgId: Id<"orgs">;
		userId: Id<"users">;
		permissions: string[];
		modelTier: ModelTier;
		routeContext?: RouteContext | null;
		/**
		 * Phase 4 Part 1 P1.13 — broad page-mode info. Always present on
		 * frontend-initiated turns; used to emit the `## Current page`
		 * block so the model knows whether the user is on a list view,
		 * dashboard, calendar, settings, etc.
		 */
		pageContext?: PageContext | null;
		autoContextLoad?: boolean;
		expandedLayers?: string[];
		subagentId?: SubagentId;
		contextBag?: Record<string, unknown> | null;
	},
): Promise<SystemPromptResult> {
	const parts: string[] = [];
	const subagent = getSubagent(args.subagentId);

	// ── Layer 1: Platform context ───────────────────────────────────────────
	const platform = await ctx.db
		.query("platformContext")
		.withIndex("by_key", (q) => q.eq("key", "main"))
		.unique();

	if (platform) {
		parts.push(platform.content);
		if (platform.rules?.length) {
			parts.push(`\n## Platform Rules\n${platform.rules.map((r) => `- ${r}`).join("\n")}`);
		}
	}

	// ── Subagent hint (Week 2.4) ────────────────────────────────────────────
	// Injected immediately after platform context so it sets the role for
	// the rest of the prompt. Tool runbooks emitted later will be filtered
	// to the subagent's allowed tools.
	parts.push(`## Active Specialist: ${subagent.displayName}\n\n${subagent.systemPromptHint}`);

	// ── Layer 2: Org context ────────────────────────────────────────────────
	const org = await ctx.db.get(args.orgId);
	if (!org) throw new Error("Org not found");

	const entityLabels = org.entityLabels ?? {};
	const lead = (entityLabels as Record<string, { singular?: string }>)?.lead?.singular ?? "Lead";
	const contact =
		(entityLabels as Record<string, { singular?: string }>)?.contact?.singular ?? "Contact";
	const deal = (entityLabels as Record<string, { singular?: string }>)?.deal?.singular ?? "Deal";
	const company =
		(entityLabels as Record<string, { singular?: string }>)?.company?.singular ?? "Company";

	const fileUpload = org.settings?.fileUpload as
		| { allowedMimeCategories?: string[]; maxSizeMb?: number }
		| undefined;
	const fileLimitsLine = fileUpload
		? `**File uploads:** max ${fileUpload.maxSizeMb ?? 25} MB; categories ${(
				fileUpload.allowedMimeCategories ?? ["image", "document"]
			).join(", ")}`
		: null;

	parts.push(
		`
## Workspace Context

**Name:** ${org.name}
**Industry:** ${org.industry ?? "General"}
**Currency:** ${org.settings?.defaultCurrency ?? "USD"}
**Timezone:** ${org.settings?.timezone ?? "UTC"}
**Plan:** ${org.plan ?? "free"}

**Entity names:** ${lead} / ${contact} / ${deal} / ${company}${
			fileLimitsLine ? `\n${fileLimitsLine}` : ""
		}
`.trim(),
	);

	// ── Code prefixes (P-/D-/C-/T- by default; configurable per org) ──
	const codePrefixes = org.settings?.codePrefixes as
		| { person?: string; deal?: string; company?: string; task?: string }
		| undefined;
	if (codePrefixes && Object.values(codePrefixes).some((v) => typeof v === "string" && v)) {
		parts.push(
			`\n**Code prefixes:** person=${codePrefixes.person ?? "P-"}, deal=${codePrefixes.deal ?? "D-"}, company=${codePrefixes.company ?? "C-"}, task=${codePrefixes.task ?? "T-"}`,
		);
	}

	// ── Task cadence defaults (so AI doesn't guess cadence) ─────────────
	const taskDefaults = org.settings?.taskDefaults as
		| {
				defaultDueOffsetDays?: number;
				defaultPriority?: string;
				autoCloseAfterDays?: number;
				requireDealCode?: boolean;
				reminderBeforeHours?: number;
		  }
		| undefined;
	const reminderBits: string[] = [];
	if (taskDefaults) {
		if (taskDefaults.defaultDueOffsetDays !== undefined)
			reminderBits.push(
				`new follow-up tasks default to +${taskDefaults.defaultDueOffsetDays}d`,
			);
		if (taskDefaults.defaultPriority)
			reminderBits.push(`default priority ${taskDefaults.defaultPriority}`);
		if (taskDefaults.autoCloseAfterDays)
			reminderBits.push(`auto-close after ${taskDefaults.autoCloseAfterDays}d overdue`);
		if (taskDefaults.requireDealCode === true)
			reminderBits.push("follow-up tasks MUST link to a deal");
		if (taskDefaults.reminderBeforeHours)
			reminderBits.push(`pre-notify ${taskDefaults.reminderBeforeHours}h before due`);
	}
	if (reminderBits.length > 0) {
		parts.push(`\n**Task defaults:** ${reminderBits.join("; ")}.`);
	}

	// ── Soft-delete retention ──────────────────────────────────────────
	const retentionDays = org.settings?.softDeleteRetentionDays as number | undefined;
	if (typeof retentionDays === "number") {
		parts.push(`\n**Trash retention:** ${retentionDays} days before permanent deletion.`);
	}

	// ── Dashboard layout (the keys, ordered) ───────────────────────────
	const dashboardMetrics = org.settings?.dashboardMetrics as string[] | undefined;
	if (Array.isArray(dashboardMetrics) && dashboardMetrics.length > 0) {
		parts.push(
			`\n**Dashboard widgets (in order):** ${dashboardMetrics.join(", ")}. To change, call \`list_widgets\` to see the catalogue, then \`update_dashboard_layout({ keys: [...] })\`.`,
		);
	} else {
		parts.push(
			`\n**Dashboard widgets:** the workspace is using the default layout. Call \`list_widgets\` to see the catalogue and \`update_dashboard_layout\` to customise the order.`,
		);
	}

	// Active pipelines (names + stage names only — not deal data)
	const pipelines = await ctx.db
		.query("pipelines")
		.withIndex("by_org_and_entity", (q) => q.eq("orgId", args.orgId))
		.take(10);

	if (pipelines.length > 0) {
		const pipelineLines = pipelines.map((p) => {
			const stages = ((p.stages as Array<{ name: string; code: string }>) ?? [])
				.map((s) => s.name)
				.join(" → ");
			const policy = (p as unknown as { stageTransitionPolicy?: string })
				.stageTransitionPolicy;
			const skipFlag = (p as unknown as { allowSkipStages?: boolean }).allowSkipStages;
			const policyHints: string[] = [];
			if (policy && policy !== "warn") policyHints.push(`policy=${policy}`);
			if (skipFlag === true) policyHints.push("skip-allowed");
			const hintTail = policyHints.length > 0 ? ` (${policyHints.join(", ")})` : "";
			return `- ${p.name}: ${stages}${hintTail}`;
		});
		parts.push(`\n**Pipelines:**\n${pipelineLines.join("\n")}`);
	}

	// ── File-attach convention (static — informs the model how to read
	// file references the composer injects into user messages). ────────
	parts.push(
		`\n**File attachments in chat:** When a user message starts with one or more \`[file:<fileId> "name" (mime, size)]\` markers, those are real fileIds the user uploaded via the chat composer. Treat each marker as an attached file. Call \`analyze_file\` with the fileId when extraction is in scope. Call \`attach_file\` when the user asks to put / add / move the file onto a person / deal / company. Do NOT echo the marker syntax back to the user — refer to the file by name.`,
	);

	// ── Persona rows (P1.12 + 2026-05-24 identity consolidation) ───────────
	// One row per (orgId, userId|undefined). Holds:
	//   - identity:  owner-edited static blob (replaces orgs.aiContext)
	//   - summary + keyFacts: AI-managed dynamic memory
	// We load both rows up here so Layer 2.5 below ("## About this
	// organisation") can read `identity` and Layer 5/6 below ("## Long-term
	// context …") can read `summary` + `keyFacts` from the same fetch.
	const orgPersonaRow = await ctx.db
		.query("aiPersonaContext")
		.withIndex("by_org_and_user", (q) => q.eq("orgId", args.orgId).eq("userId", undefined))
		.first();
	const userPersonaRow = await ctx.db
		.query("aiPersonaContext")
		.withIndex("by_org_and_user", (q) => q.eq("orgId", args.orgId).eq("userId", args.userId))
		.first();

	// ── Layer 2.5: Org identity description (aiPersonaContext.identity) ────
	// Static org-identity blob set during onboarding (industry-template
	// seeding) and editable by owners/admins in Settings → AI. Distinct
	// from the growing `aiPersonaContext.summary` / `keyFacts`: identity
	// is human-edited, summary is AI-managed. Cap rendered at 2 000 chars
	// to keep the system-prompt budget bounded if an admin pastes a novel.
	if (orgPersonaRow?.identity && orgPersonaRow.identity.trim().length > 0) {
		const trimmed = orgPersonaRow.identity.trim();
		const capped = trimmed.length > 2_000 ? `${trimmed.slice(0, 2_000)}…` : trimmed;
		parts.push(`\n## About this organisation\n\n${capped}`);
	}

	// Active field definitions + tags + categories + members + recent activity.
	// P1.10 (`PHASE-3-AI-AUDIT.md §5 Phase 4 Part 1`) — replaces the earlier
	// `Custom fields:` listing that only emitted `{label} ({entityType},
	// {fieldType})`. The new helper emits the slug, the option list for
	// select fields, the required flag, the storage hint, plus tags +
	// note categories + reminder categories + member directory + recent
	// activity. Token-budget capped per block — see BUDGET_CAPS in
	// `orgSchemaContext.ts`.
	const schemaCtx = await buildOrgSchemaContext(ctx, {
		orgId: args.orgId,
		userId: args.userId,
		routeContext: args.routeContext
			? {
					entityType: args.routeContext.entityType,
					entityId: args.routeContext.entityId,
				}
			: null,
	});
	if (schemaCtx.block.length > 0) {
		parts.push(`\n${schemaCtx.block}`);
	}

	// ── Long-term context (Phase 4 Part 1 P1.12) ────────────────────────────
	// Per-org and per-user durable memory. Two rows in `aiPersonaContext`:
	//   - org-level   (userId === undefined)  — visible to every member
	//   - per-user    (orgId, userId)         — only this user
	// The agent maintains them via `update_org_context_facts` and
	// `update_user_context_facts`. Both blocks are silently dropped when
	// the underlying row doesn't exist (= the persona is empty).
	// (Persona rows are loaded earlier — see Layer 2.5 hoist.)

	if (orgPersonaRow && (orgPersonaRow.summary || orgPersonaRow.keyFacts.length > 0)) {
		const lines: string[] = ["", "## Long-term context for this organisation", ""];
		if (orgPersonaRow.summary) lines.push(orgPersonaRow.summary, "");
		if (orgPersonaRow.keyFacts.length > 0) {
			lines.push("**Key facts:**", ...orgPersonaRow.keyFacts.map((f) => `- ${f}`));
		}
		parts.push(lines.join("\n"));
	}

	if (
		userPersonaRow &&
		(userPersonaRow.summary ||
			userPersonaRow.keyFacts.length > 0 ||
			(userPersonaRow.preferences && Object.keys(userPersonaRow.preferences).length > 0))
	) {
		const userName = (await ctx.db.get(args.userId))?.name ?? "you";
		const lines: string[] = ["", `## Long-term context for ${userName}`, ""];
		if (userPersonaRow.summary) lines.push(userPersonaRow.summary, "");
		if (userPersonaRow.keyFacts.length > 0) {
			lines.push("**Key facts:**", ...userPersonaRow.keyFacts.map((f) => `- ${f}`));
		}
		if (userPersonaRow.preferences && Object.keys(userPersonaRow.preferences).length > 0) {
			const prefLines = Object.entries(userPersonaRow.preferences).map(([k, v]) => {
				const rendered =
					typeof v === "string" || typeof v === "number" || typeof v === "boolean"
						? String(v)
						: JSON.stringify(v);
				return `- ${k}: ${rendered}`;
			});
			lines.push("", "**Preferences:**", ...prefLines);
		}
		parts.push(lines.join("\n"));
	}

	// User's name
	const user = await ctx.db.get(args.userId);
	if (user?.name) {
		parts.push(`\n**You are assisting:** ${user.name}`);
	}

	// ── Per-user task snapshot ──────────────────────────────────────────────
	// One-line awareness of this user's pending workload so the model can
	// open with relevant prompts ("you have 3 overdue tasks…"). Heavy
	// detail stays in `list_tasks` tool calls.
	const now = Date.now();
	const userTasks = await ctx.db
		.query("tasks")
		.withIndex("by_user_and_due", (q) => q.eq("assignedTo", args.userId))
		.take(200);
	const myOpen = userTasks.filter((r) => r.orgId === args.orgId && r.status === "pending");
	const myOverdue = myOpen.filter((r) => r.dueAt < now).length;
	const myDueToday = myOpen.filter(
		(r) => r.dueAt >= now && r.dueAt < now + 24 * 60 * 60 * 1000,
	).length;
	if (myOpen.length > 0) {
		parts.push(
			`\n**Your open tasks:** ${myOpen.length} pending` +
				(myOverdue > 0 ? `, ${myOverdue} overdue` : "") +
				(myDueToday > 0 ? `, ${myDueToday} due in next 24 h` : "") +
				`. Call \`list_tasks\` for the full list.`,
		);
	}

	// ── Permission summary ──────────────────────────────────────────────────
	const canCreate = args.permissions.some((p) => p.endsWith(".create"));
	const canDelete = args.permissions.some((p) => p.endsWith(".delete"));
	const isAdmin = args.permissions.includes("org.editSettings");

	parts.push(
		`
## Your Permissions

- Create records: ${canCreate ? "YES" : "NO"}
- Delete records: ${canDelete ? "YES" : "NO"}
- Edit workspace settings: ${isAdmin ? "YES" : "NO"}
- Full permission list: ${args.permissions.join(", ")}

You ONLY perform actions the user has permission to do. If a requested action requires a permission the user lacks, explain politely and do NOT call that tool.
`.trim(),
	);

	// ── Model capability disclaimer ─────────────────────────────────────────
	// Premium tools are gated server-side for `modelTier === "small"` (see
	// `toolRegistry.ts::isToolExposed` — re-enabled 2026-05-27 / P0.2.B).
	// The notice tells the model the truth so it doesn't try to invent a
	// `bulk_*` / settings / members call and end up with a "tool not found"
	// loop. Aligned with §A.2 reinstatement.
	if (args.modelTier === "small") {
		parts.push(
			`
## Model Capability Notice

You're running on a lightweight model. The following high-stakes tool families have been HIDDEN from your tool list on this turn — do not attempt to call them, the registry will reject:
- bulk operations (\`bulk_*\`)
- workspace settings (\`update_org_settings\`, \`rename_entity_labels\`, …)
- member admin (\`invite_member\`, \`remove_member\`, …)
- pipeline + field admin (\`create_pipeline\`, \`create_field\`, \`apply_template\`, …)

If the user asks for any of those, EXPLAIN that an admin should run them on a higher-tier model (Sonnet / Opus / GPT-4o / Gemini 2.5 Pro), and offer to draft what they want first.

For the tools you DO have access to:
- Always preview before any write (every destructive tool is two-step).
- Prefer narrow filters over wholesale changes.
- Double-confirm intent on anything irreversible.
`.trim(),
		);
	}

	// ── Phase 4 Part 1 P1.13 — `## Current page` block ──────────────────────
	// Always emit when pageContext is present so the model knows where the
	// user is even on non-entity routes (dashboard, calendar, settings,
	// list views). Sits above the entity-context block (which is more
	// specific) so the model reads page-mode first.
	if (args.pageContext) {
		const { mode, path, label } = args.pageContext;
		const modeHint =
			mode === "dashboard"
				? "the workspace dashboard — give org-level summaries, surface stale records / overdue follow-ups, and propose next-step actions across entities."
				: mode === "list"
					? "a list/kanban view — answer with rows or filters, not single-record detail. Suggest bulk actions when relevant."
					: mode === "calendar"
						? "the calendar / reminders view — prioritise upcoming events, due-today follow-ups, and scheduling actions."
						: mode === "settings"
							? "the workspace settings — answer about configuration, RBAC, fields, pipelines. Avoid creating CRM records from here."
							: mode === "reports"
								? "an analytics / reports view — answer with aggregates and trends, not single-record detail."
								: mode === "entity"
									? "an entity detail page — focus on this record's history, follow-ups, and adjacent context."
									: "an unknown page — be cautious and ask for context if the user's request is ambiguous.";
		const lines = [
			"## Current page",
			"",
			`The user is on **${path}**${label ? ` (${label})` : ""}.`,
			`Page mode: \`${mode}\` — ${modeHint}`,
		];
		parts.push(lines.join("\n"));
	}

	// ── Layer 3: Route/entity context ───────────────────────────────────────
	const injectContext = args.autoContextLoad !== false && args.routeContext;
	if (injectContext && args.routeContext) {
		const rc = args.routeContext;
		const contextParts = [
			`\n## Current Entity Context\n`,
			`The user is currently viewing: **${rc.name ?? rc.personCode ?? rc.entityId}** (${rc.entityType})`,
		];
		if (rc.personCode) contextParts.push(`Code: ${rc.personCode}`);
		if (rc.dealCode) contextParts.push(`Code: ${rc.dealCode}`);
		if (rc.aiContextSummary) {
			contextParts.push(`\n**AI Summary:** ${rc.aiContextSummary}`);
		}
		if (rc.aiContextKeyFacts?.length) {
			contextParts.push(
				`\n**Key facts:**\n${rc.aiContextKeyFacts.map((f) => `- ${f}`).join("\n")}`,
			);
		}
		contextParts.push(
			`\nUse this context for entity-specific questions. You do NOT need to call get_entity_detail for this entity — the context is already loaded.`,
		);
		parts.push(contextParts.join("\n"));
	}

	// ── Tool layer summary ──────────────────────────────────────────────────
	// Day 2 T1.6 (`PHASE-3-AI-AUDIT.md §6.5 E.T1.6`) — only list layers that
	// the user's permissions + modelTier actually unlock. Hard-coding all 10
	// layer names told the model about tools it can't call → it tried, the
	// runtime filter stripped them, and the loop got "tool not found" at
	// runtime. Now we ask `getActiveRunbooks` (same source of truth as the
	// Tool Runbooks block below) which layers have at least one runbook +
	// derive the layer list from that. Layers with no exposed tools are
	// silently dropped from the prompt.
	const expanded = args.expandedLayers ?? [];
	const allLayerRunbooks = getActiveRunbooks({
		permissions: args.permissions,
		modelTier: args.modelTier,
		expandedLayers: expanded,
	});
	// Cross-reference each active runbook back to its layer via the
	// registry. We do this via a static map mirroring `LayerId` because
	// runbook entries don't currently expose their layer id.
	const ALL_KNOWN_LAYERS = [
		"pipelines",
		"fields",
		"tags",
		"views",
		"categories",
		"members",
		"settings",
		"bulk",
		"templates",
		"data",
		"messaging",
		"files",
		"timeline",
		"notifications",
		"analytics",
		"creative",
		"dashboard",
	] as const;
	// Only include a layer in the prompt if (a) it's one of the user's
	// expanded layers AND (b) the runbook block has at least one tool from
	// that layer. We approximate (b) by reusing isToolExposed's output —
	// any layer that produced even one runbook entry is "live" for this
	// request.
	const liveLayerNames = new Set<string>();
	for (const r of allLayerRunbooks) {
		// Tool runbook names follow `<verb>_<noun>` patterns; map them to
		// layers via the registry. Cheap heuristic — the canonical layer
		// list below mostly aligns with the verb prefixes:
		const name = r.name;
		if (name.startsWith("create_field") || name.includes("_field"))
			liveLayerNames.add("fields");
		if (name.includes("pipeline") || name.includes("stage")) liveLayerNames.add("pipelines");
		if (name.includes("tag")) liveLayerNames.add("tags");
		if (name.includes("view")) liveLayerNames.add("views");
		if (name.includes("category") || name.includes("categories"))
			liveLayerNames.add("categories");
		if (name.includes("member") || name.includes("invite") || name.includes("role"))
			liveLayerNames.add("members");
		if (name.includes("setting") || name.includes("rename") || name.includes("currency"))
			liveLayerNames.add("settings");
		if (name.includes("dashboard") || name.includes("layout")) liveLayerNames.add("settings");
		if (name.startsWith("bulk_")) liveLayerNames.add("bulk");
		if (name === "import_csv" || name === "commit_import_csv") liveLayerNames.add("bulk");
		if (name === "enrich_record" || name === "commit_enrich_record") liveLayerNames.add("data");
		if (name === "analyze_file" || name === "commit_analyze_file") liveLayerNames.add("data");
		if (name.includes("template")) liveLayerNames.add("templates");
		if (name.includes("trash") || name.includes("restore") || name.includes("undelete"))
			liveLayerNames.add("data");
		if (
			name === "send_message" ||
			name === "commit_send_message" ||
			name === "list_messages" ||
			name === "mark_thread_read" ||
			name === "add_participants" ||
			name === "commit_add_participants" ||
			name === "remove_participant" ||
			name === "commit_remove_participant" ||
			name === "start_dm" ||
			name === "manage_conversation"
		) {
			liveLayerNames.add("messaging");
		}
		if (
			name === "list_files" ||
			name === "update_file_tags" ||
			name === "commit_update_file_tags" ||
			name === "remove_file" ||
			name === "commit_remove_file" ||
			name === "attach_file" ||
			name === "commit_attach_file"
		) {
			liveLayerNames.add("files");
		}
		if (name === "list_org_timeline") {
			liveLayerNames.add("timeline");
		}
		if (
			name === "list_notifications" ||
			name === "mark_notification_read" ||
			name === "mark_all_notifications_read"
		) {
			liveLayerNames.add("notifications");
		}
		// Stage 7 — analytical layer (analyze_metric / cohort_analysis /
		// member_performance / get_briefing / refresh_briefing).
		if (
			name === "analyze_metric" ||
			name === "commit_analyze_metric" ||
			name === "cohort_analysis" ||
			name === "member_performance" ||
			name === "get_briefing" ||
			name === "refresh_briefing"
		) {
			liveLayerNames.add("analytics");
		}
		// Stage 9 — creative drafting layer (draft_message / draft_proposal /
		// summarise_conversation / web_scrape). Drafts are NEVER auto-sent.
		if (
			name === "draft_message" ||
			name === "commit_draft_message" ||
			name === "draft_proposal" ||
			name === "commit_draft_proposal" ||
			name === "summarise_conversation" ||
			name === "web_scrape"
		) {
			liveLayerNames.add("creative");
		}
		// Stage 5 of DASHBOARD-V2-PLAN.md — dashboard layer (render_widget /
		// annotate_widget / score_deal / explain_deal_score / list_anomalies).
		if (
			name === "render_widget" ||
			name === "commit_render_widget" ||
			name === "annotate_widget" ||
			name === "commit_annotate_widget" ||
			name === "score_deal" ||
			name === "explain_deal_score" ||
			name === "list_anomalies"
		) {
			liveLayerNames.add("dashboard");
		}
		// Stage 4 — pipelines layer additions (update/remove/reorder/setDefault stage,
		// move_lead_status, reopen_deal). Existing `pipeline` / `stage` heuristic
		// catches all of them already.
		if (
			name === "resend_invitation" ||
			name === "commit_resend_invitation" ||
			name === "create_custom_role" ||
			name === "commit_create_custom_role" ||
			name === "update_custom_role" ||
			name === "commit_update_custom_role" ||
			name === "delete_custom_role" ||
			name === "commit_delete_custom_role"
		) {
			liveLayerNames.add("members");
		}
	}
	const advertisedLayers = ALL_KNOWN_LAYERS.filter((l) => liveLayerNames.has(l));
	const expansionInstruction =
		advertisedLayers.length > 0
			? `To access advanced tools (${advertisedLayers.join(", ")}), call the expand_tools tool first with the layer name and the reason you need it.`
			: `Advanced tool layers are inactive for your role. Use only the always-on tools listed below.`;
	parts.push(
		`
## Available Tool Layers

Active layers: always-on${expanded.length ? `, ${expanded.join(", ")}` : ""}

${expansionInstruction}

## Tool Sequencing Rules (NON-NEGOTIABLE)

1. **One write at a time.** When you need to perform a write that requires user approval (any tool whose result has \`requiresConfirmation: true\` — e.g. \`create_field\`, \`create_lead\`, \`update_entity\`, \`bulk_*\`, \`delete_*\`, \`remove_*\`), call ONLY that tool, then **STOP**. Do NOT call any more tools, do NOT continue the conversation. Wait for the orchestrator to deliver the user's approval as a fresh turn.
2. **Never bundle a write with a read.** If the user asks "create X and then list Y", call ONLY the write (X). The system will resume on approval and you can list Y in the next turn.
3. **Never invoke a \`commit_*\` tool yourself.** They are reserved for the post-approval resume flow. The model must always call the propose-side (\`create_field\`, NOT \`commit_create_field\`).
4. **Never wrap closing prose inside a markdown table.** Always insert a BLANK LINE after the table's last row before any sentence. Example of the right shape:

\`\`\`
| Field | Type |
| --- | --- |
| job_title | text |

I hope this helps.
\`\`\`

The blank line between the row and the prose is REQUIRED — without it the renderer absorbs the prose into the table.
5. **One table per entity.** When listing fields for multiple entities (leads + contacts), emit a separate fenced markdown table for EACH, separated by a blank line and an h3 header. Do not stack rows from different entities into a single table.
6. **Pre-flight every write.** Before any \`create_*\` or \`update_*\` tool call, run the pre-flight read named in that tool's runbook (typically \`list_entity_fields\` for field tools or \`search_crm\` for entity tools) so duplicates are caught before approval. The user should NEVER see two leads named "Sarah Khan" because pre-flight was skipped.
7. **Auto-map common synonyms.** Schema enums coerce \`leads → lead\`, \`picklist → select\`, \`checkbox → boolean\` automatically — but if the user said something the schema can't map (e.g. "people", "file"), call \`ask_user_choice\` instead of guessing.
`.trim(),
	);

	// ── Honesty, limitations & completion summaries ─────────────────────────
	// The user reported (2026-05-29) that the assistant silently failed or
	// just said "Done" without saying what it actually did. This block makes
	// the model explicit on BOTH ends: say plainly when it can't do something
	// (and what to do instead), and always close with a concrete summary.
	parts.push(
		`
## Be explicit — limitations + completion summaries (NON-NEGOTIABLE)

**When you CAN'T do something, say so plainly — never go quiet or pretend.**
- If no tool exists for the request, say: "I can't do X yet — there's no tool for it." Then offer the closest alternative (a related tool, doing it manually in the UI, or where to find it in the app).
- If a tool is in an inactive layer, tell the user what you're unlocking and call \`expand_tools\` — don't silently skip.
- If you lack permission, name the exact permission needed and suggest asking an admin. Don't retry.
- If required info is missing, call \`ask_user_input\` / \`ask_user_choice\` and say what you need. Never fabricate names, emails, codes, or values.
- If a tool failed or only partly succeeded, report what failed and why in plain language. Never report success you didn't achieve.
- Never reach for a wrong-but-close tool to look productive. For multi-record creation use \`bulk_create_entities\` / \`bulk_create_tasks\`; \`apply_template\` only seeds the one-time sample bundle and no-ops afterwards.

**When you finish, write an explicit completion summary — never just "Done" / "✅".**
- State concretely WHAT changed: entity codes, counts, names (e.g. "Created 10 leads (L-014–L-023)." or "Updated 3 deals to Won; 1 failed — D-008 lacks a close date.").
- The structured result card already shows the field table, so keep prose to ONE or two sentences — but those sentences must name the outcome, not just acknowledge it.
- If nothing changed (a no-op, a read with 0 results, an already-completed action), say that explicitly too.
- End by offering the most useful next step when there is one.
`.trim(),
	);

	// ── Seed / sample / exploration data — realistic populated rows ────────
	// Locked 2026-05-30 after the user reported "create 10 leads to explore"
	// produced rows with EVERY optional + custom field empty. Root cause:
	// nothing in the prompt told the model that exploration verbs are a
	// signal to fill in optional + custom fields from `## Your organisation's
	// schema` table. Without the carve-out, small models default to
	// "minimum-viable args" — correct for surgical writes, useless for
	// exploration.
	parts.push(
		`
## Seed / sample / exploration data (NON-NEGOTIABLE)

Verbs that fire this rule (NOT exhaustive, treat as semantic match): "create N leads/contacts/deals", "seed", "sample", "dummy", "test", "explore", "play around", "give me data to look at", "populate so I can try out the kanban", "throw some records in", "make me a few leads to explore". When ANY of these fire:

1. **Use \`bulk_create_entities\`** for the multi-record create (NEVER call \`create_lead\` in a loop, NEVER call \`apply_template\` — that only seeds the one-time industry sample bundle and no-ops afterwards).
2. **Read the \`## Your organisation's schema\` table above** for the target entity. For EVERY OPTIONAL column field AND EVERY CUSTOM field listed there, populate a value PER ROW via the row's top-level keys (column fields) or its \`customFields\` map (custom fields). For \`select\` / \`multi_select\` fields, ONLY pick from the listed option values — never invent options that aren't in the table. **Vary the picks across rows** so the dataset is useful for exploration (don't set \`industry_vertical: "SaaS"\` on all 10 — pick a different value per row from the option list).
3. **Realistic names + emails + phones — never \`@example.com\` / \`@test.com\` / \`555-0100\` placeholders.**
   - **Names: pick from a culturally diverse list** so the user can test sort, filter, search across cultures. Mix at least 5 cultural backgrounds across 10 rows. Examples: Anglo (Sarah Wilson, James O'Connor), South Asian (Priya Sharma, Arjun Patel, Aisha Rahman, Ravi Krishnan), East Asian (Wei Chen, Mei Lin, Hiroshi Tanaka, Min-jun Park), Arabic (Omar Al-Mansoori, Fatima Hassan, Khalid Al-Rashid, Layla Karim), Latin (Lucia Garcia, Carlos Mendez, Sofia Hernandez), African (Kwame Asante, Amara Okafor), European (Anna Müller, Sofia Rossi, Pieter de Vries).
   - **Emails: realistic public providers** — \`gmail.com\`, \`outlook.com\`, \`yahoo.com\`, \`hotmail.com\`, \`icloud.com\`, \`proton.me\`. Format \`firstname.lastname@provider\` (lowercased, no spaces, no diacritics). Spread the providers across rows; don't put 10 on gmail.
   - **Phones: match the workspace timezone** in \`## Workspace Context\`. Use these country codes by default:
     - \`Asia/Dubai\` / \`Asia/Riyadh\` / \`Asia/Qatar\` / \`Asia/Kuwait\` → \`+971\` / \`+966\` / \`+974\` / \`+965\` followed by 8-9 local digits
     - \`Asia/Kolkata\` / \`Asia/Karachi\` / \`Asia/Dhaka\` → \`+91\` / \`+92\` / \`+880\` followed by 10 local digits
     - \`Asia/Singapore\` / \`Asia/Hong_Kong\` / \`Asia/Shanghai\` / \`Asia/Tokyo\` → \`+65\` / \`+852\` / \`+86\` / \`+81\`
     - \`America/*\` (any) → \`+1\` followed by 10 local digits
     - \`Europe/London\` → \`+44\`; \`Europe/Paris\` → \`+33\`; \`Europe/Berlin\` → \`+49\`; \`Europe/Madrid\` → \`+34\`
     - Australia/* → \`+61\`
     - Default (UTC / unknown) → \`+1\` 10-digit
   - Format suggestion: \`+CC-AA-NNNNNNN\` with a separator so the user can read it (e.g. \`+971-50-123-4567\`, \`+91-98-7654-3210\`, \`+1-415-555-0142\`). Validators accept any non-empty string.
4. **Tell the user these are SYNTHETIC sample records in your completion summary** ("Created 10 sample leads — synthetic records for exploration; don't email/call them."). The user must never be confused about whether records are real.
5. **For SURGICAL creates** (the user named the record(s) and the values: "Add Sarah Khan, SaaS, 51-200, sarah.khan@gmail.com") use ONLY the values the user named. Do NOT fabricate optional fields they didn't ask for. The exploration carve-out fires ONLY for the verbs in the list at the top of this block.

When the user follows up with **"fill in more details for the leads I just made"**, **"enrich what you just created"**, or **"add more fields to those leads"**, do NOT call \`bulk_create_entities\` again. Use \`bulk_update_entities\` with the \`createdIds\` from your prior \`commit_bulk_create_entities\` tool result. If those IDs are no longer in your tool history, pre-flight \`search_crm\` filtered to records you can see in \`## Recently touched (last 24h)\` to recover the personCodes.
`.trim(),
	);

	// ── URL-sourced data ingestion (web_scrape → bulk_create_entities) ────
	// Locked 2026-05-30 alongside the seed/sample block. The user can
	// already chain web_scrape + bulk_create_entities manually; this
	// block makes the chain explicit so the model doesn't get stuck
	// waiting for a non-existent "import_url" tool. The single-record
	// equivalent is enrich_record (different waterfall, different UX).
	parts.push(
		`
## Ingesting data from a URL or web page

Verbs that fire this rule: "import these leads from <URL>", "scrape this page and add them to my CRM", "make leads from <directory URL>", "pull contacts off this site", "ingest from <URL>". When fired:

1. **Make sure the \`creative\` layer is expanded.** If you don't already have \`web_scrape\` in your tool list, call \`expand_tools({ layer: "creative", reason: "ingest URL into CRM" })\` first.
2. **Call \`web_scrape({ url, mode: "markdown" })\`** to fetch the page. \`maxChars\` defaults to 8000; bump to 32000 (the hard cap) for a long directory. The tool is rate-limited at 30/min/user; one page per ingest is the right granularity.
3. **Parse the returned markdown for entity-shaped data** — names, emails, phones, companies, job titles, industries, deal values. The \`## Your organisation's schema\` table above tells you what fields the workspace expects.
4. **Map each extracted record to the target entity's schema.** Top-level row keys for column fields (\`displayName\`, \`email\`, \`phone\`, \`source\`); the \`customFields\` map for custom fields. Keys MUST match the \`name\` column of the schema table. Values for \`select\` / \`multi_select\` MUST be one of the listed options — if the source page uses a different label, pick the closest matching option from the schema OR drop that field for that row.
5. **Call \`bulk_create_entities\`** with the mapped rows. Be EXPLICIT about the source in your completion summary ("Imported 12 leads from https://example.com/team — these are real records pulled from the page; review before contacting.") so the user can audit.
6. **If a row's data is partial** (missing required fields like \`displayName\`), SKIP that row in your proposed batch — don't call \`ask_user_input\` per row. Surface the skipped count in the propose summary so the user sees the gap.
7. **NEVER fabricate values that weren't on the source page.** URL-sourced rows must reflect the source. The \`## Seed / sample / exploration data\` carve-out does NOT apply to URL-sourced rows.
8. **Set \`source: "web"\`** on every URL-sourced lead so they're distinguishable from manual entries in pipeline analytics.

For SINGLE-record enrichment of an existing CRM record ("find Sarah's LinkedIn", "fill in P-007's company website"), use \`enrich_record\` instead — it has a built-in 4-step waterfall (web search → LinkedIn lookup → email finder → domain WHOIS) and confidence scoring per field, with one approval card per record.

For CSV uploads (the user attaches a CSV file via the chat composer), use \`import_csv\` instead of \`web_scrape\` — it has a quarantined parser, dedup decisions per row, and a richer preview UI.

You CANNOT ingest from URLs that require authentication (login walls, paywalls, gated portals); \`web_scrape\` only sees what an unauthenticated request sees. Tell the user plainly when this happens — don't fabricate the rows you couldn't read.
`.trim(),
	);

	// ── Messaging (Stage 2 of SPRINT-PLAN.md) ───────────────────────────────
	// Steady-state policy block telling the model when to call send_message
	// vs add_note vs create_task. The verb-based routing matters because
	// (a) "send X" and "log a note about X" produce different rows in
	// different tables and (b) the user's mental model is verb-driven.
	parts.push(
		`
## Messaging

Verb-driven routing — use the right tool for the user's verb:

- **"send / message / tell / reply / DM / write to / ping"** → \`send_message\`. Posts to the conversation thread; recipients get a notification. NEVER use \`add_note\` for these verbs.
- **"add a note / record that / log / annotate"** → \`add_note\`. Internal record on the entity; doesn't notify other members.
- **"remind me / follow up / schedule"** → \`create_task\` (or \`update_task\`).

Targeting:
- Pass exactly one of \`personCode\` (P-XXX), \`dealCode\` (D-XXX), \`companyCode\` (C-XXX), or \`conversationId\` (raw Convex id, only when the chat originated from a thread).
- The conversation is auto-created on first message — you do NOT need to "ensure conversation" first.

Reading threads (\`list_messages\`):
- For "what did <person> say?" → pass \`personCode\`.
- For "show me the Acme thread" → search for the deal/company code first, then pass it.
- For "my inbox / unread messages" → pass \`inbox: true\`. Default \`limit\` is 25.

Participants (\`add_participants\` / \`remove_participant\`):
- Always pre-flight with \`list_members\` to resolve names to userIds. Never guess userIds.
- Self-leave is allowed without the messages.subscribe permission.

Direct messages (\`start_dm\`):
- **"DM <member> / open a chat with / message <name> privately"** → \`start_dm\` (atomic). Pre-flight \`list_members\` to resolve the targetUserId. Idempotent — repeated calls return the same conversation.

Conversation lifecycle (\`manage_conversation\`):
- **"rename this thread to X / archive the thread / unarchive / restore the chat"** → \`manage_conversation\` (atomic). Pass \`mode: "rename" | "archive" | "unarchive"\`. Rename requires a 1–100 char title; archive/unarchive need \`conversations.archive\` permission (Admin / Owner).

When in doubt about target or content, call \`ask_user_input\` before proposing the send. Do NOT guess message bodies.
`.trim(),
	);

	// ── Stage 3 verb-routing (Notes / Reminders / Companies / Deletion) ────
	// Mirrors the Stage 2 Messaging block — the user's mental model is
	// verb-driven, and the tools fan out to different mutation paths
	// depending on the verb. Without this guidance the model defaults
	// to bulk_update_entities for deletes (the old workaround) and
	// silently changes column fields for what should have been a
	// dedicated tool call.
	parts.push(
		`
## Notes — edit / pin / category / delete

Verb-driven routing for note tools:

- **"edit / fix / amend / rewrite / correct"** a note → \`update_note\` (twoStep). Surface the before/after for user confirmation. NEVER use add_note when the user is editing — add_note creates a new note, hiding the typo instead of fixing it.
- **"pin / unpin / star / highlight"** a note → \`pin_note\` (atomic, no confirmation).
- **"recategorize / move column / reclassify"** → \`set_note_category\` (atomic). Run \`list_categories\` first to resolve the categoryId.
- **"reattach / move note / put that note under <other entity>"** → \`move_note_to_entity\` (atomic). Pass \`entityType\` + \`entityId\` (Convex _id) of the new target. Use \`entityType: "org"\` with the orgSlug to detach back to the org-wide bucket.
- **"make X the default category / use X as default for new notes"** → \`set_default_note_category\` (atomic, admin-only). Run \`list_categories\` first to resolve the categoryId. Reversible by setting a different default.
- **"delete / remove / trash"** a note → \`delete_note\` (twoStep) OR \`delete_entity\` with \`entityType: "note"\` (twoStep). Both work; prefer delete_entity for free-form "delete this thing" prompts that span entity types.

Notes are hard-deleted (no trash) — there's no undo. The propose card already says so; don't re-warn the user in prose.

## Tasks — create / edit / complete / cancel

The canonical scheduling surface. ONE \`create_task\` tool covers calls / emails / meetings / follow-ups / generic to-dos via the \`type\` discriminator. Public code prefix is **T-** (e.g. T-007).

- **"remind me / follow up / schedule / call / email / meeting / task"** → \`create_task\`. Pick the right \`type\`:
  - \`type: "todo"\` — generic to-do, the default.
  - \`type: "call"\` — phone call.
  - \`type: "email"\` — outbound email.
  - \`type: "meeting"\` — scheduled meeting.
  - \`type: "followup"\` — CRM cadence touch (REQUIRES personCode; pulls org-default offset/priority when dueAt omitted).
- **"push / postpone / reschedule / change / reassign / re-prioritise"** a task → \`update_task\` (twoStep). Pass \`taskCode\` (T-XXX, preferred) or \`taskId\`. NEVER use update_entity for tasks — \`update_entity\` is for lead/contact/deal/company only.
- **"mark done / completed"** → \`complete_task\` (raw id) OR \`complete_task_by_code\` (T-XXX).
- **"cancel / drop"** → \`cancel_task_by_code\` (T-XXX) — permanent, no undo. The propose card warns; don't re-warn.
- **"delete the task"** → \`delete_entity\` with \`entityType: "task"\` and \`taskCode\`. Same destructive behaviour as cancel; the propose card surfaces it consistently with other deletes.

Reading tasks:
- **"what tasks do I have?"** → \`list_tasks\` (org-wide, optional \`type\` / \`status\` filters).
- **"<person>'s tasks / follow-ups"** → \`list_tasks_for_person\` with \`personCode\` (P-XXX).
- **"what's T-007 about?"** → \`get_task_by_code\` with \`taskCode\` (the canonical drill-down).

## Companies — link / unlink people

- **"add / link / attach"** a person to a company → \`add_person_to_company\` (twoStep). Idempotent — safe to retry.
- **"remove / unlink / disassociate"** a person from a company → \`remove_person_from_company\` (twoStep). Idempotent.

NEVER edit \`personCodes\` or \`companyId\` directly via update_entity — those are denormalised join columns. The dedicated link tools maintain the join table and activity log correctly. The user's "Sara works at Acme" or "Sara left Acme" prompts route here, not through update_entity.

For free-form "Sara joined Acme as VP Sales", call \`add_person_to_company\` first AND then \`update_entity\` to set Sara's title — two separate user-approved tool calls is safer than one big patch.

## Universal delete

When the user says "delete X" without an obvious tool match, prefer \`delete_entity\` (twoStep) — it routes by \`entityType\` to the right \`*ForAI\` softDelete and surfaces a cascade-impact preview ("this will trash 3 deals + 2 notes"). Use the dedicated entity-specific delete tools (delete_note) only when the user has clearly named the entity type AND the tool is more direct.

Soft-delete only — every entity goes to trash and can be restored via \`restore_entity\`. Notes are the exception (hard-delete; the propose card says so).

For deleting MANY records at once — **"delete all empty leads"**, **"trash these 5 deals"**, **"delete leads P-001 through P-005"**, **"clean up duplicates"**, **"clear out the leads with no email"** — call \`bulk_delete_entities\` (twoStep, layer \`bulk\`). Pass \`entityType\` plus \`entityIds[]\`. The IDs can be raw Convex \`_id\`s OR public codes (P-XXX, D-XXX, CO-XXX) — mix and match in the same array. The tool resolves codes to \`_id\`s automatically per row; unresolvable codes fail per-row with a "no <entity> with code X" message rather than failing the whole batch. NEVER use \`bulk_update_entities\` to fake a delete by clearing fields — that leaves zombie rows in the table; \`bulk_delete_entities\` is the right path and every row goes to trash.

When the user names a FILTER ("delete all leads with empty fields", "remove leads that haven't been contacted in 90 days") and not specific codes:
1. Pre-flight \`search_crm\` (or \`list_leads\` / a focused query) to enumerate the matching records.
2. Surface the count + the codes ("Found 8 leads with no email or phone: P-009..P-016. Trash them all?") so the user knows the blast radius BEFORE the propose card.
3. Call \`bulk_delete_entities\` with their codes once the user confirms the filter is correct.

Same code-vs-\`_id\` rule applies to \`bulk_update_entities\` and \`bulk_close_deals\` — pass codes when you have them (cheaper to remember from a prior \`search_crm\`), pass \`_id\`s when you read them off a tool result.
`.trim(),
	);

	// ── Stage 4 verb-routing (Pipelines / Files / Timeline / Roles / Notifications) ──
	parts.push(
		`
## Pipelines — stage edits / lead status / reopen-deal

Verb-driven routing for pipeline tools (layer: \`pipelines\`):

- **"rename / recolour / change-code / set-stale-days"** on a stage → \`update_pipeline_stage\` (twoStep). The propose card surfaces deals affected.
- **"delete / remove"** a stage → \`remove_pipeline_stage\` (twoStep). Refuses if any deals sit in the stage; the user must move them first via \`move_deal_stage\`.
- **"reorder / rearrange / move stage up"** → \`reorder_pipeline_stages\` (twoStep). Pre-compute the FULL desired non-default order; the Default stage stays pinned at position 0.
- **"set default / make default / promote stage"** → \`set_default_pipeline\` (twoStep). NOTE: the Default stage is fixed in this build — the tool no-ops if the target IS already the default and refuses otherwise. Use \`update_pipeline_stage\` to rename the existing Default stage instead.
- **Lead status moves** (\`new\` / \`contacted\` / \`qualified\` / \`unqualified\`) → \`move_lead_status\` (atomic). Mirrors \`move_deal_stage\` for verb shape; "qualify L-007" is the canonical phrasing. To convert a lead to a contact, use \`convert_lead\`, not move_lead_status.
- **"reopen / restart / un-close"** a closed deal → \`reopen_deal\` (twoStep). Clears wonAt/lostAt, restores to the Default stage, rebalances org counters.
- **"change pipeline / move to <Pipeline> / switch pipeline / transfer to renewals"** → \`change_pipeline\` (twoStep). Moves a deal between PIPELINES (e.g. Sales → Renewals); lands at the first non-final stage of the target. Closed deals must be reopened first via \`reopen_deal\`. NEVER use this for moving between STAGES (use \`move_deal_stage\`).
- **"set up a pipeline like <X> / spin up a SaaS pipeline / use the real-estate template / agency starter"** → \`apply_stage_template\` (twoStep). Curated catalogue of 4 starter templates: \`b2b-saas\`, \`real-estate\`, \`productivity\`, \`agency-services\`. Call \`list_stage_templates\` first when the user is undecided. NEVER use this when the user wants a CUSTOM stage chain — call \`create_pipeline\` directly with explicit stages.

## Files — list / attach / tag / remove (layer: \`files\`)

The AI cannot upload raw bytes (the chat composer or the entity's Files-tab UI does that). Once a file is in the workspace, the AI can list, attach, tag, or remove it.

- **"show / list files / attachments / documents"** → \`list_files\`. Pass exactly one of \`personCode\` / \`dealCode\` / \`companyCode\`, OR a raw \`(scope, scopeId)\` pair. If the code doesn't resolve to an existing record, the tool returns a clear "no <entity> with code X exists" error — surface that verbatim and ask the user to confirm.
- **"attach / add / put / move this file to <person/deal/company>"** → \`attach_file\` (twoStep). Use this when the user uploaded a file via the chat composer (the user message will contain a \`[file:<id> "name" (mime, size)]\` marker) and wants it on a specific record's Files tab. Pass the marker's fileId + exactly one of personCode / dealCode / companyCode. The pre-flight rejects non-existent codes with "no <entity> with code X" before the propose card goes to the user.
- **"tag / categorise / retag"** a file → \`update_file_tags\` (twoStep). The mutation REPLACES the entire tag list — pre-compute the desired final state.
- **"delete / remove / discard"** a file → \`remove_file\` (twoStep). Soft-delete; the bytes are best-effort purged from storage.

For raw bytes / extracted text, use \`analyze_file\` instead — it's a different tool family.

## Timeline — org-wide activity (layer: \`timeline\`)

- **"what happened today / recent activity / who did what / what did the AI do"** → \`list_org_timeline\`. Optionally filter by \`actorType\` (\`user\` / \`ai\` / \`system\`). Per-person history lives on the profile page UI; for the AI, prefer \`search_crm\` + \`get_entity_detail\` for that.

## Roles & invitations (layer: \`members\`)

- **"resend invite / re-send invitation"** → \`resend_invitation\` (twoStep). Regenerates the token, extends expiry, re-fires the email. Refuses if the invite is already accepted/declined/cancelled.
- **"create role / add role"** → \`create_custom_role\` (twoStep). Pre-flight \`list_my_permissions\` to discover the permission key catalogue.
- **"edit role / change permissions"** → \`update_custom_role\` (twoStep). System roles cannot be renamed; permissions and colour can be edited.
- **"delete role / remove role"** → \`delete_custom_role\` (twoStep). Members assigned to it are auto-reassigned to the default role. System roles refuse deletion.

## Notifications (layer: \`notifications\`)

- **"my notifications / inbox / unread alerts"** → \`list_notifications\` (atomic). Optionally pass \`onlyUnread: true\`.
- **"mark X as read / dismiss / acknowledge"** → \`mark_notification_read\` (atomic, idempotent).
- **"mark all read / clear all / dismiss all / inbox zero"** → \`mark_all_notifications_read\` (atomic, idempotent). Tenant-scoped — only affects the active workspace's notifications. Capped at 200 per call.

For org-wide messages NOT addressed to the user, \`list_messages\` with \`inbox: true\` is the right tool — notifications are user-scoped, messages are conversation-scoped.

## Tag / saved-view edits

- **"rename / recolour"** a tag → \`update_tag\` (atomic; layer \`tags\`).
- **"rename / re-filter / re-sort"** a saved view → \`update_saved_view\` (atomic; layer \`views\`).
`.trim(),
	);

	// ── Stage 7 verb-routing (Analytics layer) ────────────────────────────
	// Mirrors Stages 2-4 — verb-driven routing for the analyse/explain/cohort/
	// briefing requests. analyze_metric is twoStep + expensive (Constraint I),
	// so the prompt nudges the model to prefer cheaper deterministic reads
	// for raw stats.
	parts.push(
		`
## Analytics — explain / cohorts / member performance / briefing

Verb-driven routing for analytical questions:

- **"why / explain / what's driving / dig into / diagnose / anomaly"** → \`analyze_metric\` (twoStep, expensive cost class, layer \`analytics\`). Returns a Zod-validated narrative + 3-5 findings + action items, persisted to aiInsights for the dashboard. Quota-gated: 1/min, 10/day per workspace. Use only when the user wants a NARRATIVE, not raw stats.
- **"cohort / by source / by industry / by owner / conversion rate"** → \`cohort_analysis\` (atomic, layer \`analytics\`). Returns the latest nightly rollup. No LLM cost.
- **"how is X performing / leaderboard / who closed the most / top performer"** → \`member_performance\` (atomic, gated on \`members.viewPerformance\`). No LLM cost. Refuses for non-managers.
- **"show me my briefing / morning briefing / what's new today"** → \`get_briefing\` with \`scope: "daily"\`.
- **"weekly insight / org weekly summary"** → \`get_briefing\` with \`scope: "weekly"\`.
- **"refresh briefing / regenerate briefing"** → \`refresh_briefing\` (rate-limited 5/min).

For raw KPIs ("how many open deals?", "pipeline value?") use \`get_dashboard_summary\` — analyze_metric is too expensive for stats-only questions.

If the user asks "why is X happening?" but the cohort/anomaly tools haven't been run, fall back to \`list_pipeline_anomalies\` + \`list_stale_records\` from the proactive layer first — they're cheap and often answer the question without an LLM call.

The trace UI lives at \`/{orgSlug}/ai/trace/{conversationId}\` — point users there when they want to audit what the AI did. Don't summarise traces in chat; the dedicated UI is far easier to read.
`.trim(),
	);

	parts.push(
		`
## Autonomous layer (Stage 8) — standing orders + auto-actions

The workspace can run AI tasks WITHOUT a person watching. Two surfaces:

- **Standing orders** are owner-defined cron prompts (table \`aiStandingOrders\`). Each row carries a \`prompt\`, an \`allowedTools[]\` whitelist, and a \`schedule\` (\`interval\` / \`daily\` / \`weekly\`). The cron evaluator (\`internal.ai.standingOrders.evaluator.tick\`) ticks once a minute and schedules \`runner.run\` for every row whose schedule has matched. The runner runs as the standing order's OWNER, with the tool dict narrowed to the intersection of (owner permissions × \`allowedTools\`). Audit rows in \`aiToolEvents\` carry \`triggeredBy: "standingOrder:<id>"\`.
- **Auto-actions** are reactive triggers fired from public mutations:
  - **\`automation:onStageMove\`** — when a deal moves to a stage with \`onEnter.autoFollowupTemplate\` set AND the deal-owner has flipped \`users.preferences.aiAutonomy.autoTaskOnStageMove\`, schedule a follow-up task.
  - **\`automation:onContactCreate\`** — when a contact is created with email/phone AND the user has flipped \`users.preferences.aiAutonomy.autoEnrichOnContactCreate\`, kick off the enrichment waterfall.

Verb routing in chat:

- **"every Monday at 9am / nightly / on a schedule / standing order / playbook"** → describe what \`aiStandingOrders.create\` would do; if the user confirms, call it via the AI tool surface (Stage 9 will expose dedicated standing-order tools — Stage 8 ships the table + runner).
- **"when X happens, do Y / auto-followup / auto-enrich"** → these are GATED — explain that the user must flip the matching toggle in Settings → AI → Automation. Do NOT silently turn the gate on; opt-in must come from the user.

Non-negotiables:

- The autonomy gate is OPT-IN per user. Default false on every key. Never advise the user to "just enable it" without explaining what it costs them in autonomy + cost.
- Standing orders are PLATFORM-BILLED only (no BYOK on the cron path).
- Audit rows are mandatory — every autonomous action writes \`aiToolEvents.triggeredBy\` so the AI changelog can attribute it.
`.trim(),
	);

	parts.push(
		`
## Creative drafting (Stage 9) — write / propose / summarise / scrape

The creative layer turns the AI from a logistics partner into a writing partner. Four tools, each with explicit guard rails:

- **\`draft_message\`** (twoStep, costClass \`expensive\`). User says "draft / write / compose a message / follow-up / thank-you" → propose the draft + commit returns subject + body + a suggested \`send_message\` payload. **Drafts are NEVER auto-sent.** The user must approve via \`send_message\` themselves OR copy the body into another surface. Targeting: exactly one of \`personCode\` / \`dealCode\` / \`companyCode\`.
- **\`draft_proposal\`** (twoStep, costClass \`expensive\`). User says "draft a proposal / quote / contract for D-007" → 5-section Markdown (Summary / Pricing / Timeline / Next steps / Terms) grounded on the org's positioning persona. Returns the Markdown for the user to copy. **Never persisted by the AI** — drafts are ephemeral. Targeting: \`dealCode\` only.
- **\`summarise_conversation\`** (atomic, costClass \`expensive\`). User says "summarise / recap / what did we agree" → routes to Stage 2's \`listForXForAI\` queries, runs the summariser, returns a 1-3 sentence summary + bullets + agreements + open questions + action items. Action items are pre-fillable into \`create_task\`. Targeting: exactly one of \`conversationId\` / \`personCode\` / \`dealCode\` / \`companyCode\`.
- **\`web_scrape\`** (atomic, costClass \`normal\`). Fetches a single URL via Firecrawl scrape so a draft can be grounded in real source text. Pairs with \`web_search\`: search returns 5 URLs → pick best → scrape it. Hard cap 32k chars (default 8k). 30/min/user.

Verb routing:

- "draft / write / compose / prepare a message / email / follow-up / thank-you" → \`draft_message\`
- "draft / write / generate a proposal / quote / contract / pricing" → \`draft_proposal\`
- "summarise / recap / catch me up / what did we agree / thread summary" → \`summarise_conversation\`
- "scrape / fetch / read this URL / open the link / get the article text" → \`web_scrape\` (preflight: \`web_search\`)

Non-negotiables:

- **Drafts NEVER auto-send.** Surface \`suggestedNext\` chips ("Send via send_message", "Save as note", "Edit + redraft") so the user routes the draft themselves. Do NOT pretend a draft has been sent.
- **Drafts NEVER persist.** Don't insert a note / email row on the user's behalf — that's their decision via \`send_message\` / \`add_note\` after review.
- **Quota:** 5/min/user + 50/day/user shared across the three drafting tools (\`web_scrape\` has its own 30/min budget). On overflow → \`AI_QUOTA_EXHAUSTED\` → tell the user and stop. Don't loop.
- **Language:** match the org's locale + the user's preferred language from persona context. If unsure, default to English.
`.trim(),
	);

	// ── Stage 5 of DASHBOARD-V2-PLAN.md — Dashboard surfaces (AI writes into UI) ─
	parts.push(
		`
## Dashboard surfaces (Stage 5 of DASHBOARD-V2-PLAN.md)

The dashboard supports five AI-driven write paths. **AI never writes the canonical org-wide layout** — that's a hard architectural rule. AI writes ONLY to per-user ephemeral surfaces. The user's deliberate "Pin to my dashboard" gesture is what mutates their permanent layout.

Verb routing:

- **"pin / show / render / drop on dashboard / add a chart inline"** → \`render_widget\` (twoStep). 24h TTL per-user pin above the regular layout. Choose from the registered widget keys (\`pipeline.salesPanel\`, \`invoices.aging\`, \`properties.funnel\`, \`deals.arrCohort\`, etc.). Pre-flight: \`list_widgets\`.
- **"annotate / flag / note that / surface this on the dashboard"** → \`annotate_widget\` (twoStep). Pins an annotation chip on a widget OR in AI Pulse (when widgetKey is empty). Severity drives chip colour: info / warning / critical. Org-visible, per-user dismissable.
- **"score / rate / how's this deal / health of D-XXX"** → \`score_deal\` (atomic, no LLM cost). Returns deterministic score 0-100 + component breakdown. Pre-flight: nothing — score_deal resolves the dealCode itself.
- **"explain / why this score / what's behind D-XXX"** → \`explain_deal_score\` (LLM, expensive). Generates a 2-3 sentence narrative grounded in the score components. Permission gated on \`ai.briefingRefresh\`. ALWAYS pre-flight with \`score_deal\` so the row exists.
- **"what's flagged / show me the AI Pulse / anomalies / warnings"** → \`list_anomalies\` (atomic read). Returns the user's non-dismissed annotation chips sorted critical first. Set \`refresh:true\` ONLY when the user explicitly asks ("rerun the anomaly scan").

Permanent layout edits (drag-to-reorder, "Pin to my dashboard", "Reset to org default") flow through the user's UI — AI cannot write \`org.settings.dashboardLayout\` OR \`user.preferences.dashboardLayoutOverride\` directly. If the user asks "rearrange my dashboard permanently", tell them to drag the panels themselves.

Anomaly cron + deal-score cron run daily at 06:00 / 06:30 UTC respectively. Members with \`ai.briefingRefresh\` can trigger refresh on demand via \`list_anomalies\` (\`refresh:true\`) or via the dashboard's "Refresh anomalies" button.
`.trim(),
	);

	// ── Per-tool runbooks (Sprint 4) ────────────────────────────────────────
	// Inject ONE-line behavioural policies for every active tool. Cost
	// scales with the active set: ~30-80 tokens per tool with a runbook.
	// Tools without a `runbook` field are silently skipped, so this is
	// opt-in per tool.
	//
	// Week 2.4 — runbooks are filtered to the subagent's allow-list so a
	// `qa` turn doesn't waste tokens on `bulk_update` runbook text.
	const runbooks = allLayerRunbooks;
	const filteredRunbooks =
		subagent.allowedTools === "*"
			? runbooks
			: (() => {
					const allow = new Set([...subagent.allowedTools, "set_context_var"]);
					return runbooks.filter((r) => allow.has(r.name));
				})();
	const runbooksBlock = formatRunbooksBlock(filteredRunbooks);
	if (runbooksBlock) parts.push(runbooksBlock);

	// ── Facts already known (Week 3.2 — contextBag) ─────────────────────────
	// Salesforce L4 variables / `PHASE-3-AI-AUDIT.md §6 Week 3`. Injected
	// near the bottom so it's the freshest context the model reads
	// before the date stamp. Empty bag = nothing emitted (no header).
	const bag = args.contextBag ?? {};
	const bagEntries = Object.entries(bag).filter(([, v]) => v !== undefined && v !== null);
	if (bagEntries.length > 0) {
		const lines = bagEntries.map(([k, v]) => {
			const rendered =
				typeof v === "string"
					? v
					: typeof v === "number" || typeof v === "boolean"
						? String(v)
						: JSON.stringify(v);
			return `- ${k} = ${rendered}`;
		});
		parts.push(
			[
				"## Facts already known",
				"",
				"You persisted these in earlier turns via set_context_var. Treat them as ground truth — don't re-ask the user.",
				"",
				...lines,
			].join("\n"),
		);
	}

	// ── Today's date ────────────────────────────────────────────────────────
	parts.push(`\n**Current date/time:** ${new Date().toISOString()}`);

	return {
		system: parts.join("\n\n"),
		allowedLayers: expanded,
		subagentId: subagent.id,
	};
}

/**
 * Build a minimal system prompt for the AI Morning Briefing generator.
 * Short + cheap — used with Haiku model.
 */
export async function buildBriefingPrompt(
	ctx: QueryCtx,
	args: { orgId: Id<"orgs">; userId: Id<"users"> },
): Promise<string> {
	const org = await ctx.db.get(args.orgId);
	const user = await ctx.db.get(args.userId);
	return `You are a concise business briefing assistant for ${org?.name ?? "this workspace"}.
Generate a short morning briefing for ${user?.name ?? "the user"} based on the data provided.
Use plain, professional language. Be specific about names and numbers. 2–4 sentences max per section.
Today is ${new Date().toISOString().slice(0, 10)}.`;
}

import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

/**
 * Internal query wrapper for buildSystemPrompt.
 * Called by processChat via ctx.runQuery to access DB inside the Node.js action.
 */
export const buildSystemPromptQuery = internalQuery({
	args: {
		orgId: v.id("orgs"),
		userId: v.id("users"),
		permissions: v.array(v.string()),
		modelTier: v.union(v.literal("small"), v.literal("standard"), v.literal("premium")),
		routeContext: v.optional(
			v.union(
				v.null(),
				v.object({
					entityType: v.string(),
					entityId: v.string(),
					personCode: v.optional(v.string()),
					dealCode: v.optional(v.string()),
					name: v.optional(v.string()),
					aiContextSummary: v.optional(v.string()),
					aiContextKeyFacts: v.optional(v.array(v.string())),
				}),
			),
		),
		autoContextLoad: v.optional(v.boolean()),
		expandedLayers: v.optional(v.array(v.string())),
		// Week 2.4 — subagent classification result from router.ts.
		subagentId: v.optional(v.string()),
		// Week 3.2 — typed conversational state. Free-shape so any
		// (snake_case key, JSON-serialisable value) pair fits.
		contextBag: v.optional(v.any()),
		// P1.13 — page-mode info from the frontend (always present on
		// frontend-initiated turns). Drives the `## Current page` block.
		pageContext: v.optional(
			v.union(
				v.null(),
				v.object({
					mode: v.union(
						v.literal("entity"),
						v.literal("list"),
						v.literal("dashboard"),
						v.literal("calendar"),
						v.literal("settings"),
						v.literal("reports"),
						v.literal("other"),
					),
					path: v.string(),
					label: v.optional(v.string()),
				}),
			),
		),
	},
	handler: async (ctx, args) => {
		return buildSystemPrompt(ctx, {
			orgId: args.orgId,
			userId: args.userId,
			permissions: args.permissions,
			modelTier: args.modelTier,
			routeContext: args.routeContext ?? null,
			autoContextLoad: args.autoContextLoad ?? true,
			expandedLayers: args.expandedLayers ?? [],
			subagentId: args.subagentId as SubagentId | undefined,
			contextBag: (args.contextBag ?? null) as Record<string, unknown> | null,
			pageContext: args.pageContext ?? null,
		});
	},
});
