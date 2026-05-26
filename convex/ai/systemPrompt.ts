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

	// ── Code prefixes (P-/D-/C-/FU- by default; configurable per org) ──
	const codePrefixes = org.settings?.codePrefixes as
		| { person?: string; deal?: string; company?: string; followup?: string }
		| undefined;
	if (codePrefixes && Object.values(codePrefixes).some((v) => typeof v === "string" && v)) {
		parts.push(
			`\n**Code prefixes:** person=${codePrefixes.person ?? "P-"}, deal=${codePrefixes.deal ?? "D-"}, company=${codePrefixes.company ?? "C-"}, followup=${codePrefixes.followup ?? "FU-"}`,
		);
	}

	// ── Reminder + follow-up defaults (so AI doesn't guess cadence) ────
	const reminderDefaults = org.settings?.reminderDefaults as
		| {
				followUpWindowHours?: number;
				staleAlertDays?: number;
				morningBriefingTime?: string;
				morningBriefingEnabled?: boolean;
		  }
		| undefined;
	const followupDefaults = org.settings?.followupDefaults as
		| {
				defaultDueOffsetDays?: number;
				defaultPriority?: string;
				autoCloseAfterDays?: number;
				requireDealCode?: boolean;
				reminderBeforeHours?: number;
		  }
		| undefined;
	const reminderBits: string[] = [];
	if (reminderDefaults) {
		if (reminderDefaults.followUpWindowHours)
			reminderBits.push(`follow-up window ${reminderDefaults.followUpWindowHours}h`);
		if (reminderDefaults.staleAlertDays)
			reminderBits.push(`stale after ${reminderDefaults.staleAlertDays}d`);
		if (
			reminderDefaults.morningBriefingEnabled !== false &&
			reminderDefaults.morningBriefingTime
		)
			reminderBits.push(`morning briefing at ${reminderDefaults.morningBriefingTime}`);
	}
	if (followupDefaults) {
		if (followupDefaults.defaultDueOffsetDays !== undefined)
			reminderBits.push(
				`new follow-ups default to +${followupDefaults.defaultDueOffsetDays}d`,
			);
		if (followupDefaults.defaultPriority)
			reminderBits.push(`default priority ${followupDefaults.defaultPriority}`);
		if (followupDefaults.autoCloseAfterDays)
			reminderBits.push(`auto-close after ${followupDefaults.autoCloseAfterDays}d overdue`);
		if (followupDefaults.requireDealCode === true)
			reminderBits.push("follow-ups MUST link to a deal");
		if (followupDefaults.reminderBeforeHours)
			reminderBits.push(`pre-notify ${followupDefaults.reminderBeforeHours}h before due`);
	}
	if (reminderBits.length > 0) {
		parts.push(`\n**Reminder/follow-up defaults:** ${reminderBits.join("; ")}.`);
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
		`\n**File attachments in chat:** When a user message starts with one or more \`[file:<fileId> "name" (mime, size)]\` markers, those are real fileIds the user uploaded via the chat composer. Treat each marker as an attached file. Call \`analyze_file\` with the fileId when extraction is in scope. Do NOT echo the marker syntax back to the user — refer to the file by name.`,
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

	// ── Per-user follow-up snapshot ─────────────────────────────────────────
	// One-line awareness of this user's pending workload so the model can
	// open with relevant prompts ("you have 3 overdue follow-ups…"). Heavy
	// detail stays in `list_followups` tool calls.
	const now = Date.now();
	const userReminders = await ctx.db
		.query("reminders")
		.withIndex("by_user_and_due", (q) => q.eq("assignedTo", args.userId))
		.take(200);
	const myOpen = userReminders.filter((r) => r.orgId === args.orgId && r.status === "pending");
	const myOverdue = myOpen.filter((r) => r.dueAt < now).length;
	const myDueToday = myOpen.filter(
		(r) => r.dueAt >= now && r.dueAt < now + 24 * 60 * 60 * 1000,
	).length;
	if (myOpen.length > 0) {
		parts.push(
			`\n**Your open follow-ups:** ${myOpen.length} pending` +
				(myOverdue > 0 ? `, ${myOverdue} overdue` : "") +
				(myDueToday > 0 ? `, ${myDueToday} due in next 24 h` : "") +
				`. Call \`list_followups\` for the full list.`,
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
	// DEFERRED: see Future-Enhancements.md §A.4 — while the per-tool premium
	//          gate (§A.2) is OFF for testing, the previous "you cannot use
	//          premium tools" notice would lie to the model. We keep the
	//          tier-aware advice block so the model still gets a hint that a
	//          smaller model should be extra careful with destructive tools,
	//          but we don't claim those tools are unavailable.
	if (args.modelTier === "small") {
		parts.push(
			`
## Model Capability Notice

You're running on a lightweight model. You DO have access to every tool the user's role allows, but please:
- Always show a preview before any write (every destructive tool is two-step).
- Prefer narrow filters on bulk operations — never close all deals or update all leads without an explicit user-supplied filter.
- For settings or label changes, double-confirm intent before calling \`update_org_settings\` or \`rename_entity_labels\`.
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
			name === "commit_remove_participant"
		) {
			liveLayerNames.add("messaging");
		}
		if (
			name === "list_files" ||
			name === "update_file_tags" ||
			name === "commit_update_file_tags" ||
			name === "remove_file" ||
			name === "commit_remove_file"
		) {
			liveLayerNames.add("files");
		}
		if (name === "list_org_timeline") {
			liveLayerNames.add("timeline");
		}
		if (name === "list_notifications" || name === "mark_notification_read") {
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

	// ── Messaging (Stage 2 of SPRINT-PLAN.md) ───────────────────────────────
	// Steady-state policy block telling the model when to call send_message
	// vs add_note vs create_followup. The verb-based routing matters because
	// (a) "send X" and "log a note about X" produce different rows in
	// different tables and (b) the user's mental model is verb-driven.
	parts.push(
		`
## Messaging

Verb-driven routing — use the right tool for the user's verb:

- **"send / message / tell / reply / DM / write to / ping"** → \`send_message\`. Posts to the conversation thread; recipients get a notification. NEVER use \`add_note\` for these verbs.
- **"add a note / record that / log / annotate"** → \`add_note\`. Internal record on the entity; doesn't notify other members.
- **"remind me / follow up / schedule"** → \`create_followup\` (or \`update_reminder\`).

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
- **"delete / remove / trash"** a note → \`delete_note\` (twoStep) OR \`delete_entity\` with \`entityType: "note"\` (twoStep). Both work; prefer delete_entity for free-form "delete this thing" prompts that span entity types.

Notes are hard-deleted (no trash) — there's no undo. The propose card already says so; don't re-warn the user in prose.

## Reminders — edit / push / cancel

- **"push / postpone / reschedule / change / reassign / re-prioritise"** a reminder → \`update_reminder\` (twoStep). Pass \`followUpCode\` (FU-XXX, preferred) or \`reminderId\`. NEVER use update_entity for reminders — \`update_entity\` is for lead/contact/deal/company only.
- **"mark done / completed"** → \`complete_reminder\` (raw id) OR \`complete_followup_by_code\` (FU-XXX).
- **"cancel / drop"** → \`cancel_followup_by_code\` (FU-XXX) — permanent, no undo. The propose card warns; don't re-warn.
- **"delete the reminder"** → \`delete_entity\` with \`entityType: "reminder"\` and \`followUpCode\`. Same destructive behaviour as cancel; the propose card surfaces it consistently with other deletes.

When the user says "remind me to do X next Tuesday", that's a CREATE intent — call \`create_followup\` (preferred for person-tied) or \`create_reminder\` (org-internal), not \`update_reminder\`.

## Companies — link / unlink people

- **"add / link / attach"** a person to a company → \`add_person_to_company\` (twoStep). Idempotent — safe to retry.
- **"remove / unlink / disassociate"** a person from a company → \`remove_person_from_company\` (twoStep). Idempotent.

NEVER edit \`personCodes\` or \`companyId\` directly via update_entity — those are denormalised join columns. The dedicated link tools maintain the join table and activity log correctly. The user's "Sara works at Acme" or "Sara left Acme" prompts route here, not through update_entity.

For free-form "Sara joined Acme as VP Sales", call \`add_person_to_company\` first AND then \`update_entity\` to set Sara's title — two separate user-approved tool calls is safer than one big patch.

## Universal delete

When the user says "delete X" without an obvious tool match, prefer \`delete_entity\` (twoStep) — it routes by \`entityType\` to the right \`*ForAI\` softDelete and surfaces a cascade-impact preview ("this will trash 3 deals + 2 notes"). Use the dedicated entity-specific delete tools (delete_note) only when the user has clearly named the entity type AND the tool is more direct.

Soft-delete only — every entity goes to trash and can be restored via \`restore_entity\`. Notes are the exception (hard-delete; the propose card says so).
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

## Files — list / tag / remove (layer: \`files\`)

The AI cannot upload files (UI-only). It can only manage already-uploaded files.

- **"show / list files / attachments / documents"** → \`list_files\`. Pass exactly one of \`personCode\` / \`dealCode\` / \`companyCode\`, OR a raw \`(scope, scopeId)\` pair.
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
  - **\`automation:onStageMove\`** — when a deal moves to a stage with \`onEnter.autoFollowupTemplate\` set AND the deal-owner has flipped \`users.preferences.aiAutonomy.autoFollowupOnStageMove\`, schedule a follow-up reminder.
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
- **\`summarise_conversation\`** (atomic, costClass \`expensive\`). User says "summarise / recap / what did we agree" → routes to Stage 2's \`listForXForAI\` queries, runs the summariser, returns a 1-3 sentence summary + bullets + agreements + open questions + action items. Action items are pre-fillable into \`create_followup\`. Targeting: exactly one of \`conversationId\` / \`personCode\` / \`dealCode\` / \`companyCode\`.
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
