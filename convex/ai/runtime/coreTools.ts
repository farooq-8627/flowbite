/**
 * Always-on core capabilities present in every step regardless of router /
 * discovery decisions: `search_crm`, `describe_entity`, `describe_workspace`,
 * `read_conversation` (the lead's message-box read path, §1.10),
 * `discover_capabilities`, `ask_user`.
 */
import { z } from "zod";
import type { Id } from "../../_generated/dataModel";
import { groupCapabilities, listGroupKeys } from "../registry/catalog";
import { field } from "../registry/coerce";
import { defineCapability, listCapabilities } from "../registry/define";
import { ask, failed, ok } from "../registry/result";
import type { Capability, CapabilityCtx } from "../registry/types";

// biome-ignore lint/suspicious/noExplicitAny: pre-codegen string-path refs need a cast.
const _ref = (path: string) => path as any;
// biome-ignore lint/suspicious/noExplicitAny: pre-codegen string-path refs need a cast.
const _anyArgs = (a: Record<string, unknown>) => a as any;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Run an AI-side internal query with the principal's `userId` injected. */
function aiQuery<T = unknown>(
	cap: CapabilityCtx,
	publicPath: string,
	args: Record<string, unknown>,
): Promise<T> {
	const { ctx, principal } = cap;
	const colon = publicPath.lastIndexOf(":");
	if (colon === -1) {
		throw new Error(`[coreTools] aiQuery: malformed path "${publicPath}".`);
	}
	const isInternalAi = publicPath.startsWith("ai/");
	const exported = publicPath.slice(colon + 1);
	const finalPath =
		isInternalAi || exported.endsWith("ForAI")
			? publicPath
			: `${publicPath.slice(0, colon)}:${exported}ForAI`;
	const finalArgs: Record<string, unknown> = isInternalAi
		? args
		: { ...args, userId: principal.userId };
	return ctx.runQuery(_ref(finalPath), _anyArgs(finalArgs)) as Promise<T>;
}

// ─── search_crm ─────────────────────────────────────────────────────────────

const searchCrm = defineCapability<{ query?: string; entityType?: string; limit?: number }>({
	name: "search_crm",
	module: "core",
	group: "core",
	permission: null,
	risk: "safe",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"PRE-FLIGHT for every create_* or update_* action involving a REAL person/company/deal: search by name/email before you write so you never duplicate. Also use whenever the user mentions a person/company by NAME — resolve to a code first.",
		whenNotToCall:
			"the user already gave a code (P-001 / D-001 / C-001 / T-001) — use describe_entity / get_entity_detail instead. ALSO: skip search_crm entirely when the user explicitly asked for synthetic / fake / sample / test / demo data with no real subject — there is nothing to pre-search; jump directly to the relevant create_* tool.",
		requiredClarifications: ["query"],
		synonyms: ["find", "look up", "search", "is X in the CRM"],
		goodExample: { query: "Sarah Khan", entityType: "all", limit: 10 },
		badExample: {
			args: { query: "P-001", entityType: "all" },
			why: "P-001 is a code — call describe_entity or get_entity_detail instead.",
		},
	},
	drive: {
		onSuccess:
			"Render the result count + names. If exactly one match, confirm in one short line and offer the next step. If 2-8 matches, ask the user which one via ask_user.",
		onEmpty:
			"Tell the user nothing matched. Offer to broaden the query (partial name; drop the entityType filter). Do NOT retry by stripping characters off the query.",
	},
	// Schema: `query` is OPTIONAL (locked 2026-06-06). The model is *expected*
	// to provide it (`requiredClarifications: ["query"]` documents that),
	// but a weak model that omits it now hits the graceful no-arg branch in
	// `run()` instead of burning the host's retry budget on a `needs_repair`
	// envelope it can't fix. Mirrors the same pattern shipped for
	// `discover_capabilities` (SHIPPED.md L133, 2026-06-04).
	//
	// `field.str()` coerces `""` / whitespace → `undefined` BEFORE z.string,
	// so all three of `{}` / `{ query: "" }` / `{ query: "   " }` route
	// through the same hint branch.
	input: z.object({
		query: field
			.str()
			.optional()
			.describe(
				"Name, email, company, deal title, etc. to search. OMIT entirely when the user asked for synthetic / fake / sample / test data with no real subject — skip search_crm and call create_* directly.",
			),
		entityType: z
			.enum(["lead", "contact", "deal", "company", "all"])
			.optional()
			.default("all")
			.describe("Restrict the search to one entity type, or 'all' for cross-entity search."),
		limit: z
			.number()
			.int()
			.min(1)
			.max(20)
			.optional()
			.default(10)
			.describe("Maximum results per entity type."),
	}),
	run: async (ctx, args) => {
		// Empty/missing query → graceful hint envelope. Reaches here only
		// when `field.str()` already normalised "" / whitespace → undefined,
		// or the model genuinely omitted the field. The `ok()` envelope is
		// deliberate: this is not a bug from the model's POV, it's a "tell
		// me what to look for" prompt that costs zero retry budget.
		const rawQuery = typeof args.query === "string" ? args.query.trim() : "";
		if (rawQuery.length === 0) {
			return ok({
				headline: "Tell me what to search for — a name, email, company, or deal title.",
				facts: [
					"If the user explicitly asked for synthetic / fake / sample / test / demo data with no real subject, SKIP search_crm entirely and call the relevant create_* tool directly. There is nothing to pre-search.",
					"Otherwise, re-call search_crm with a non-empty `query` string. Optionally pass `entityType` to scope the search.",
				],
				data: { availableEntityTypes: ["lead", "contact", "deal", "company", "all"] },
			});
		}

		const orgId = ctx.principal.orgId;
		const permissions = ctx.principal.permissions;
		const limit = args.limit ?? 10;
		const entityType = args.entityType ?? "all";
		const q = rawQuery.toLowerCase();

		const buckets: Record<string, unknown[]> = {};
		const wants = (kind: "lead" | "contact" | "deal" | "company") =>
			entityType === "all" || entityType === kind;

		if (wants("lead") && permissions.includes("leads.view")) {
			buckets.leads = (await aiQuery<unknown[]>(
				ctx,
				"crm/entities/leads/queries:searchLeads",
				{ orgId, query: q, limit, excludeFromAI: false },
			).catch(() => [])) as unknown[];
		}
		if (wants("contact") && permissions.includes("contacts.view")) {
			buckets.contacts = (await aiQuery<unknown[]>(
				ctx,
				"crm/entities/contacts/queries:searchContacts",
				{ orgId, query: q, limit, excludeFromAI: false },
			).catch(() => [])) as unknown[];
		}
		if (wants("deal") && permissions.includes("deals.view")) {
			buckets.deals = (await aiQuery<unknown[]>(
				ctx,
				"crm/entities/deals/queries:searchDeals",
				{ orgId, query: q, limit, excludeFromAI: false },
			).catch(() => [])) as unknown[];
		}
		if (wants("company") && permissions.includes("companies.view")) {
			buckets.companies = (await aiQuery<unknown[]>(
				ctx,
				"crm/entities/companies/queries:searchCompanies",
				{ orgId, query: q, limit, excludeFromAI: false },
			).catch(() => [])) as unknown[];
		}

		const total = Object.values(buckets).reduce((s, arr) => s + arr.length, 0);
		if (total === 0) {
			return ok({
				headline: `No results for "${rawQuery}".`,
				facts: [
					"Try a partial name, or drop the entityType filter to search across all types.",
				],
				data: { ...buckets, total, query: rawQuery },
			});
		}
		return ok({
			headline: `${total} match${total === 1 ? "" : "es"} for "${rawQuery}".`,
			data: { ...buckets, total, query: rawQuery },
		});
	},
});

// ─── describe_entity ────────────────────────────────────────────────────────

const describeEntity = defineCapability<{ entityType: string }>({
	name: "describe_entity",
	module: "core",
	group: "core",
	permission: null,
	risk: "safe",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"BEFORE writing any field on an entity, call this with the entity type to read the workspace's LIVE field set (key, type, options, required, sensitive). The owner can rename / retype / remove fields any time, so don't trust your memory of a previous turn.",
		whenNotToCall:
			"you only need a single record's CURRENT values — call get_entity_detail instead.",
		requiredClarifications: ["entityType"],
		synonyms: ["fields for", "schema for", "what fields does X have"],
		goodExample: { entityType: "lead" },
	},
	drive: {
		onSuccess:
			"Use the returned field set to validate the user's request before writing — coerce values to the declared type, drop fields that don't exist, and ask the user about missing required fields.",
		onEmpty: "The entity has no custom fields yet — only its built-in attributes.",
	},
	input: z.object({
		entityType: z
			.enum(["lead", "contact", "deal", "company", "task"])
			.describe("Which entity's field schema to read."),
	}),
	run: async (ctx, args) => {
		const isAdmin =
			ctx.principal.permissions.includes("settings.manage") ||
			ctx.principal.permissions.includes("fields.manage");
		const rows = (await aiQuery<
			Array<{
				_id: Id<"fieldDefinitions">;
				name: string;
				label: string;
				type: string;
				required: boolean;
				options?: string[];
				sensitive?: boolean;
				hidden?: boolean;
				system?: boolean;
				order: number;
			}>
		>(ctx, "crm/fields/fieldDefinitions/queries:listByEntity", {
			orgId: ctx.principal.orgId,
			entityType: args.entityType,
		}).catch(() => [])) as Array<{
			_id: Id<"fieldDefinitions">;
			name: string;
			label: string;
			type: string;
			required: boolean;
			options?: string[];
			sensitive?: boolean;
			hidden?: boolean;
			system?: boolean;
			order: number;
		}>;

		// RBAC filter: hide sensitive fields from non-admins so the model
		// never echoes them back through prompt logs.
		const visible = rows
			.filter((r) => r.hidden !== true)
			.filter((r) => isAdmin || r.sensitive !== true)
			.sort((a, b) => a.order - b.order)
			.map((r) => ({
				key: r.name,
				label: r.label,
				type: r.type,
				required: r.required,
				options: r.options,
				sensitive: r.sensitive ?? false,
			}));

		if (visible.length === 0) {
			return ok({
				headline: `No custom fields defined for ${args.entityType}.`,
				facts: [
					"Only the built-in columns are available (displayName/email/phone/etc.). Create custom fields in the workspace fields UI to capture domain-specific data.",
				],
				data: { entityType: args.entityType, fields: [] as Array<unknown> },
			});
		}
		return ok({
			headline: `${visible.length} field${visible.length === 1 ? "" : "s"} on ${args.entityType}.`,
			data: { entityType: args.entityType, fields: visible },
		});
	},
});

// ─── describe_workspace ─────────────────────────────────────────────────────

const describeWorkspace = defineCapability<Record<string, never>>({
	name: "describe_workspace",
	module: "core",
	group: "core",
	permission: null,
	risk: "safe",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"To learn the workspace's enabled modules, entity labels (lead may be relabelled to Buyer / Tenant / Candidate per vertical), and pipelines + stages. Read-only; no args.",
		whenNotToCall:
			"you only need fields for one entity — describe_entity is cheaper and more precise.",
		synonyms: ["what does this workspace look like", "labels", "pipelines", "modules"],
		goodExample: {},
	},
	drive: {
		onSuccess:
			"Use the labels (lead.singular / contact.plural / etc.) when speaking to the user — they may say 'Buyer' instead of 'Lead'. Use the pipelines + stages list before any move_stage call.",
	},
	input: z.object({}),
	run: async (ctx, _args) => {
		const shape = (await aiQuery<{
			labels: Record<string, { singular: string; plural: string; slug: string }>;
			modules: Array<{ slot: string; label?: string }>;
		} | null>(ctx, "orgs/queries:getWorkspaceShape", {
			orgId: ctx.principal.orgId,
		}).catch(() => null)) as {
			labels: Record<string, { singular: string; plural: string; slug: string }>;
			modules: Array<{ slot: string; label?: string }>;
		} | null;

		// IMPORTANT: pipeline stages on the schema use { id, code, name, order, isFinal, finalType, ... }.
		// Earlier this projection read `s.key` / `s.label` (legacy/imagined names),
		// so every stage serialised to `{}`. The model could see "7 stages" but
		// had no way to pick one — move_stage / set_stage calls were impossible.
		// We project the AI-relevant fields verbatim (`id` for the move_stage
		// argument, `code` for the human-typeable shortcode the model surfaces
		// in chat, `name` for the user-facing label, plus `isFinal` / `finalType`
		// so the model knows which stages close a deal).
		const pipelines = (await aiQuery<
			Array<{
				_id: Id<"pipelines">;
				name: string;
				entityType: string;
				isDefault?: boolean;
				stages?: Array<{
					id: string;
					code: string;
					name: string;
					order: number;
					isFinal?: boolean;
					finalType?: "positive" | "negative" | "neutral";
				}>;
			}>
		>(ctx, "crm/fields/pipelines/queries:listByOrg", {
			orgId: ctx.principal.orgId,
		}).catch(() => [])) as Array<{
			_id: Id<"pipelines">;
			name: string;
			entityType: string;
			isDefault?: boolean;
			stages?: Array<{
				id: string;
				code: string;
				name: string;
				order: number;
				isFinal?: boolean;
				finalType?: "positive" | "negative" | "neutral";
			}>;
		}>;

		return ok({
			headline: "Workspace shape.",
			data: {
				labels: shape?.labels ?? null,
				modules: shape?.modules ?? [],
				pipelines: pipelines.map((p) => ({
					id: p._id,
					name: p.name,
					entityType: p.entityType,
					isDefault: p.isDefault ?? false,
					stages: [...(p.stages ?? [])]
						.sort((a, b) => a.order - b.order)
						.map((s) => ({
							id: s.id,
							code: s.code,
							name: s.name,
							order: s.order,
							isFinal: s.isFinal ?? false,
							...(s.finalType ? { finalType: s.finalType } : {}),
						})),
				})),
			},
		});
	},
});

// ─── read_conversation ──────────────────────────────────────────────────────

const readConversation = defineCapability<{
	personCode?: string;
	conversationId?: string;
	limit?: number;
}>({
	name: "read_conversation",
	module: "core",
	group: "core",
	permission: null,
	risk: "safe",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"To see the recent message transcript with a lead/contact (the lead's message box per PART 1 §1.10) before you decide what to do. Pass `personCode` for cross-channel (WhatsApp + internal) history, or `conversationId` for a specific thread.",
		whenNotToCall:
			"the user is asking about a record's static fields (name, email, budget…) — call describe_entity / get_entity_detail instead.",
		requiredClarifications: ["personCode or conversationId"],
		synonyms: ["read the chat", "what did they say", "show me the transcript"],
		goodExample: { personCode: "P-007", limit: 30 },
	},
	drive: {
		onSuccess:
			"Summarise the transcript briefly when narrating; do NOT echo every message — the human already saw them. Use the transcript to ground your next action.",
		onEmpty: "There's no message history with that record yet.",
	},
	input: z
		.object({
			personCode: z
				.string()
				.optional()
				.describe("Person code (P-001) — fetches every message linked to this person."),
			conversationId: z
				.string()
				.optional()
				.describe("A specific conversation _id to scope the transcript to."),
			limit: z
				.number()
				.int()
				.min(1)
				.max(200)
				.optional()
				.default(40)
				.describe("Max messages to return (newest first)."),
		})
		.refine((v) => Boolean(v.personCode) || Boolean(v.conversationId), {
			message: "Provide either personCode or conversationId.",
			path: ["personCode"],
		}),
	run: async (ctx, args) => {
		const orgId = ctx.principal.orgId;
		const limit = args.limit ?? 40;

		if (args.personCode) {
			const rows = (await aiQuery<Array<{ _id: string; createdAt: number; content: string }>>(
				ctx,
				"crm/shared/messages/queries:listForPerson",
				{ orgId, personCode: args.personCode, limit },
			).catch(() => [])) as Array<{
				_id: string;
				createdAt: number;
				authorType: string;
				content: string;
				channel?: string;
			}>;
			if (rows.length === 0) {
				return ok({
					headline: `No messages on record for ${args.personCode}.`,
					data: { personCode: args.personCode, messages: [] },
				});
			}
			return ok({
				headline: `${rows.length} recent message${rows.length === 1 ? "" : "s"} for ${args.personCode}.`,
				data: { personCode: args.personCode, messages: rows },
			});
		}

		// conversationId path. The chat side uses `conversations` (NOT
		// `aiConversations`). Cast through `Id<"conversations">` at the
		// runQuery call site — Convex validates at runtime.
		const conversationId = args.conversationId as unknown as Id<"conversations">;
		const rows = (await aiQuery<unknown[]>(
			ctx,
			"crm/shared/messages/queries:listForConversation",
			{ orgId, conversationId, limit },
		).catch(() => [])) as Array<{
			_id: string;
			createdAt: number;
			authorType: string;
			content: string;
		}>;
		if (rows.length === 0) {
			return ok({
				headline: `No messages on this conversation yet.`,
				data: { conversationId: args.conversationId, messages: [] },
			});
		}
		return ok({
			headline: `${rows.length} recent message${rows.length === 1 ? "" : "s"} in this conversation.`,
			data: { conversationId: args.conversationId, messages: rows },
		});
	},
});

// ─── discover_capabilities ──────────────────────────────────────────────────

const discoverCapabilities = defineCapability<{ group?: string; query?: string }>({
	name: "discover_capabilities",
	module: "core",
	group: "core",
	permission: null,
	risk: "safe",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"When the user's intent doesn't match any tool currently in your active set. Pass a `group` key (e.g. 'leads', 'tasks') OR a free-form `query` string. Calling with NO args returns the catalog of every available group so you can pick one — use this when you don't know which group to ask for.",
		whenNotToCall:
			"a tool that already does what the user asked for is already in your active set — just call it.",
		synonyms: ["what tools do you have", "find a tool", "expand"],
		goodExample: { group: "tasks" },
	},
	drive: {
		onSuccess:
			"Read the returned list and call the most appropriate tool on the NEXT step — the host will have loaded it by then. Do not call discover_capabilities twice in a row.",
		onEmpty:
			"No matching capabilities. If the user asked for something the workspace can't do, say so — don't fabricate a tool.",
	},
	// No `.refine()` requiring one-of: a no-arg call is a legitimate "what
	// groups exist?" query and used to fall through to a `needs_repair`
	// envelope, which the model has to spend an extra step recovering from.
	// Now: no args ⇒ return the group catalog directly.
	input: z.object({
		group: z
			.string()
			.optional()
			.describe(
				"Group key (e.g. 'leads', 'tasks', 'deals'). Omit to receive the list of every available group.",
			),
		query: z
			.string()
			.optional()
			.describe(
				"Free-form intent string — used when no group key fits. Substring matched against the catalog.",
			),
	}),
	run: async (_ctx, args) => {
		const all = listCapabilities();
		const groups = groupCapabilities(all);
		const allGroupKeys = listGroupKeys(all);

		// No args / both empty → return the catalog so the model can pick a group.
		const hasGroup = typeof args.group === "string" && args.group.trim().length > 0;
		const hasQuery = typeof args.query === "string" && args.query.trim().length > 0;
		if (!hasGroup && !hasQuery) {
			return ok({
				headline: `Catalog of capability groups (${groups.length}). Pick one and re-call with { group: "<key>" }.`,
				facts: [`Available groups: ${allGroupKeys.join(", ") || "(none)"}.`],
				data: {
					availableGroups: allGroupKeys,
					groups: groups.map((g) => ({
						group: g.group,
						count: g.capabilities.length,
						capabilities: g.capabilities.map((c) => c.name),
					})),
				},
			});
		}

		// Prefer an exact group-key match.
		if (hasGroup) {
			const wanted = args.group!.toLowerCase();
			const match = groups.find((g) => g.group.toLowerCase() === wanted);
			if (match) {
				return ok({
					headline: `Loaded ${match.capabilities.length} ${match.group} capabilit${match.capabilities.length === 1 ? "y" : "ies"}.`,
					data: {
						// `expand` is the host-side side-channel: prepareStep reads it
						// in the next step's tool-result and adds these names to
						// `activeTools`.
						expand: match.capabilities.map((c) => c.name),
						group: match.group,
						capabilities: match.capabilities,
					},
				});
			}
			return ok({
				headline: `No group named "${args.group}".`,
				facts: [`Available groups: ${allGroupKeys.join(", ") || "(none)"}.`],
				data: { availableGroups: allGroupKeys },
			});
		}

		// Free-form query: substring match on capability names + whenToCall.
		const q = (args.query ?? "").toLowerCase();
		const matches = all.filter(
			(c) => c.name.toLowerCase().includes(q) || c.spec.whenToCall.toLowerCase().includes(q),
		);
		if (matches.length === 0) {
			return ok({
				headline: `No capabilities match "${args.query}".`,
				facts: [`Available groups: ${allGroupKeys.join(", ") || "(none)"}.`],
				data: { availableGroups: allGroupKeys },
			});
		}
		return ok({
			headline: `Loaded ${matches.length} matching capabilit${matches.length === 1 ? "y" : "ies"}.`,
			data: {
				expand: matches.map((c) => c.name),
				capabilities: matches.map((c) => ({
					name: c.name,
					group: c.group,
					whenToCall: c.spec.whenToCall,
				})),
			},
		});
	},
});

// ─── ask_user ───────────────────────────────────────────────────────────────

const askUser = defineCapability<{ question: string; choices?: string[] }>({
	name: "ask_user",
	module: "core",
	group: "core",
	permission: null,
	risk: "safe",
	channels: ["chat", "whatsapp", "mcp", "rest"],
	spec: {
		whenToCall:
			"When the user's request is ambiguous (multiple matching records, missing required field, intent unclear) and you cannot disambiguate from context. Always prefer to act if one obvious answer exists.",
		whenNotToCall:
			"information you can fetch with describe_entity / search_crm / read_conversation is missing — fetch it first instead of asking.",
		requiredClarifications: ["question"],
		synonyms: ["clarify", "confirm with the user"],
		goodExample: {
			question: "Two leads match 'Sarah Khan' — which one?",
			choices: ["P-007 (Sarah Khan, sara@x.com)", "P-014 (Sarah Khan, kh@y.com)"],
		},
	},
	drive: {
		onSuccess:
			"After the user picks one of the `choices`, the host will resume the turn with their answer. Do not call ask_user twice in a row.",
	},
	input: z.object({
		question: z.string().min(1).describe("The clarifying question to surface to the user."),
		choices: z
			.array(z.string().min(1))
			.optional()
			.describe("Optional clickable choices the user can pick from."),
	}),
	run: async (_ctx, args) => {
		// `ask` returns an `ambiguous`-status envelope — the chat surface
		// renders the question + optional choices. The model is expected to
		// stop calling tools after this; the host's `stopWhen` honours
		// `ambiguous` outcomes and returns control to the user.
		return ask(args.question, args.choices);
	},
});

// Dummy use of `failed` so the import isn't dead in this S2 file — kept
// available because S3+ envelopes will branch into failure paths from the
// shared core tools.
void failed;

// ─── Public surface ─────────────────────────────────────────────────────────

/** The core capabilities, in canonical order. */
export const CORE_CAPABILITIES: ReadonlyArray<Capability> = [
	searchCrm,
	describeEntity,
	describeWorkspace,
	readConversation,
	discoverCapabilities,
	askUser,
];

/** Names of the core capabilities. The host preloads these every step. */
export const CORE_CAPABILITY_NAMES: ReadonlyArray<string> = CORE_CAPABILITIES.map((c) => c.name);
