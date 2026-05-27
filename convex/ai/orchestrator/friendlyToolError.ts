/**
 * convex/ai/orchestrator/friendlyToolError.ts
 *
 * Tool failures used to render in chat as a flat:
 *
 *   ❌ An unexpected error occurred. Please try again.
 *
 * That string is useless to the user — they don't know whether the
 * problem was their input, a permission, a duplicate record, or a
 * bug.
 *
 * Phase 4 Part 1 P1.11 turns the helper's output into a multi-tier
 * envelope: a one-line `summary` (always shown), an optional
 * collapsible `details` body, an optional numbered `manualSteps`
 * fallback the user can follow in the regular UI, and optional
 * clickable `recoveryActions` that pre-fill the chat composer with
 * a recovery intent. The legacy `markdown` and `short` fields are
 * preserved (derived) so existing renderers keep working.
 *
 * Inputs we can see:
 *   - ConvexError data (`{ code, message, ...rest }`) — most of our
 *     own throws.
 *   - ArgumentValidationError-style raw `Error` from the Convex
 *     argument validator (thrown when the tool forwards an extra
 *     field — see the 2026-05-24 incident).
 *   - Plain `runTool` failure shape: `{ ok: false, error, code? }`.
 *   - Anything else — fall back to the raw message capped at 200
 *     chars + a generic recovery line.
 *
 * Pure / no-IO — keep it cheap to call from anywhere in the stack.
 */

export interface FriendlyToolErrorRecoveryAction {
	/** Short label rendered as a clickable chip ("Update L-007 instead"). */
	label: string;
	/** Plain English the chat composer pre-fills when the chip is clicked. */
	intent: string;
}

export interface FriendlyToolError {
	/** Stable code so the UI can pick a tone (rose / amber). */
	code: string;
	/** ≤ 60 chars — fits in status badges, log lines. */
	short: string;
	/** Always shown. The headline. ≤ 120 chars. */
	summary: string;
	/** Optional `<details>` body — what went wrong, why, technical context. */
	details?: string;
	/** Optional numbered fallback path the user can follow in the regular UI. */
	manualSteps?: string[];
	/** Optional clickable chips that prefill the chat with a recovery intent. */
	recoveryActions?: FriendlyToolErrorRecoveryAction[];
	/**
	 * Backwards-compatible markdown body that legacy renderers (the
	 * resume-time assistant body, the streamLoop tool-error patch)
	 * still consume. Derived from `summary` + `details` + `manualSteps`.
	 */
	markdown: string;
}

interface NormalisedError {
	message: string;
	code: string | null;
	/** Pre-baked Convex error data — preserved verbatim for downstream code. */
	data?: Record<string, unknown>;
}

/**
 * Convert any error / failure object into a friendly chat-ready
 * envelope.
 */
export function friendlyToolError(input: unknown, toolName: string): FriendlyToolError {
	const norm = normalise(input);
	const mapped = mapKnownCode(norm, toolName);
	if (mapped) return finalise(mapped);
	return finalise(mapByMessage(norm, toolName));
}

// ─── Builders that produce a partial envelope (sans markdown) ─────────

type FriendlyToolErrorPartial = Omit<FriendlyToolError, "markdown">;

function finalise(p: FriendlyToolErrorPartial): FriendlyToolError {
	return { ...p, markdown: composeLegacyMarkdown(p) };
}

function composeLegacyMarkdown(p: FriendlyToolErrorPartial): string {
	const parts: string[] = [`**${p.summary}**`];
	if (p.details) parts.push(p.details);
	if (p.manualSteps && p.manualSteps.length > 0) {
		parts.push(["**You can do this manually:**", ...p.manualSteps].join("\n"));
	}
	if (p.recoveryActions && p.recoveryActions.length > 0) {
		parts.push(["**Or ask me:**", ...p.recoveryActions.map((a) => `• ${a.label}`)].join("\n"));
	}
	return parts.join("\n\n");
}

// ─── Normalisation ────────────────────────────────────────────────────

function normalise(input: unknown): NormalisedError {
	if (input === null || input === undefined) {
		return { message: "Unknown error.", code: null };
	}
	if (typeof input === "string") {
		return { message: input, code: null };
	}
	if (typeof input !== "object") {
		return { message: String(input), code: null };
	}

	const obj = input as Record<string, unknown>;

	// runTool / Convex's `{ ok: false, error, code? }` shape.
	if (obj.ok === false && typeof obj.error === "string") {
		return {
			message: obj.error,
			code: typeof obj.code === "string" ? obj.code : null,
			data:
				typeof obj.data === "object" && obj.data !== null
					? (obj.data as Record<string, unknown>)
					: undefined,
		};
	}

	// Bare `Error` from `try { … }`.
	if (input instanceof Error) {
		return {
			message: input.message,
			code: (input as Error & { code?: string }).code ?? null,
		};
	}

	// Convex `{ data: { code, message, ...rest } }` shape (when surfaced).
	const data = obj.data as Record<string, unknown> | undefined;
	if (data) {
		return {
			message: typeof data.message === "string" ? data.message : "Action failed.",
			code: typeof data.code === "string" ? data.code : null,
			data,
		};
	}

	// Last-ditch: stringified payload.
	if (typeof obj.message === "string") {
		return { message: obj.message, code: null };
	}
	return { message: "Action failed.", code: null };
}

// ─── Code-keyed mappers ──────────────────────────────────────────────

function mapKnownCode(err: NormalisedError, toolName: string): FriendlyToolErrorPartial | null {
	if (!err.code) return null;
	switch (err.code) {
		case "DUPLICATE": {
			const personCode =
				typeof err.data?.personCode === "string" ? (err.data.personCode as string) : null;
			return {
				code: err.code,
				short: `Duplicate${personCode ? ` (${personCode})` : ""}.`,
				summary: personCode
					? `That record already exists — I found it under ${personCode}.`
					: "That record already exists.",
				details: personCode
					? `Convex's by_org index matched the email/phone you supplied to the existing record ${personCode}. Creating a duplicate would split the activity timeline.`
					: "An existing record matched the email or phone you supplied. Creating a duplicate would split its activity timeline.",
				manualSteps: personCode
					? [
							`1. Open the record at ${pathHint(personCode)}.`,
							"2. Click Edit and update the fields you wanted to change.",
							"3. Click Save.",
						]
					: [
							"1. Find the existing record via the search bar.",
							"2. Click Edit and apply the fields you wanted to change.",
							"3. Click Save.",
						],
				recoveryActions: personCode
					? [
							{
								label: `Update ${personCode} instead`,
								intent: `Update ${personCode} with the new info`,
							},
							{
								label: "Use a different email",
								intent: "Create a new record with a different email",
							},
						]
					: [
							{
								label: "Update the existing record",
								intent: "Find and update the existing record instead",
							},
							{
								label: "Use a different email",
								intent: "Create a new record with a different email",
							},
						],
			};
		}
		case "AI_TOOL_UNAUTHORIZED":
		case "FORBIDDEN": {
			// Stage 3-A H2 — distinguish "tool not in subagent scope" from
			// the real permission gate. The router can pick a subagent whose
			// `allowedTools` allow-list doesn't include the tool the model
			// tried to call (e.g. router routes "create a followup ... next
			// stage" to `settings`, then the model calls `create_followup`
			// which is not in `settings.allowedTools`). The AI SDK rejects
			// the call as FORBIDDEN with rawError "Model tried to call
			// unavailable tool '<name>'. Available tools: ...". That is a
			// ROUTING bug, not a permissions bug — translating it to "you
			// don't have permission" is misleading and sends the user on a
			// wild-goose chase asking an admin to grant a role they already
			// have. Detect via the well-known phrase.
			const msg = err.message ?? "";
			const isSubagentScope =
				/unavailable tool|not in available tools|not a valid function/i.test(msg);
			if (isSubagentScope) {
				const triedToolMatch = msg.match(/['"]([a-z0-9_]+)['"]/i);
				const triedTool = triedToolMatch?.[1] ?? toolName;
				return {
					code: "SUBAGENT_SCOPE",
					short: "Wrong specialist mode.",
					summary: `I tried \`${triedTool}\` but I'm in the wrong specialist mode for that.`,
					details:
						"This usually means I picked the wrong subagent (settings vs Q&A vs CRM-action) for your request. Re-ask with a clearer verb (e.g. *follow up with*, *remind me to*, *send a message to*, *summarise*) and I'll route to the right specialist on the next turn.",
					recoveryActions: [
						{
							label: "Try again with a clearer verb",
							intent: "Retry the previous action and pick the right specialist this time",
						},
					],
				};
			}
			return {
				code: err.code,
				short: "Permission denied.",
				summary: "You don't have permission for this action.",
				details: err.message,
				manualSteps: [
					"1. Open Settings → Members & Roles.",
					"2. Ask a workspace admin to grant the relevant role for this action.",
					"3. Return to this chat and ask me to try again.",
				],
			};
		}
		case "RATE_LIMITED":
			return {
				code: err.code,
				short: "Rate limited.",
				summary: "You've hit a rate limit on this action.",
				details:
					"This protects the workspace from runaway loops. Wait a minute and try again. If this happens repeatedly, check whether something is making rapid bulk changes on your behalf.",
				recoveryActions: [
					{ label: "Try again in a minute", intent: "Retry the previous action" },
				],
			};
		case "FEATURE_DISABLED":
		case "PLAN_LIMIT_REACHED":
			return {
				code: err.code,
				short: "Plan limit reached.",
				summary: "This action isn't included in your current plan.",
				details: err.message,
				manualSteps: [
					"1. Open Settings → Billing.",
					"2. Upgrade to the plan that includes this feature.",
					"3. Return to this chat and ask me to try again.",
				],
			};
		case "AI_DISAMBIGUATION_REQUIRED":
			return {
				code: err.code,
				short: "Multiple matches.",
				summary: "I found more than one matching record.",
				details:
					"Tell me which one to act on — the personCode (P-001), dealCode (D-007) or companyCode (CO-002) is the safest way.",
				recoveryActions: [
					{
						label: "Show me the matches",
						intent: "Show me the matching records so I can pick",
					},
				],
			};
		case "AI_CONTEXT_REQUIRED":
			return {
				code: err.code,
				short: "Missing context.",
				summary: "I need a bit more context to do that.",
				details: err.message,
			};
		case "TOOL_INPUT_VALIDATION":
			return {
				code: err.code,
				short: "Bad arguments.",
				summary: `The arguments \`${toolName}\` got didn't match its schema.`,
				details: `${err.message}\n\nThis is usually a model glitch — try again, or rephrase your request more concretely.`,
				recoveryActions: [{ label: "Try again", intent: "Retry the previous request" }],
			};
		case "NOT_FOUND":
			return {
				code: err.code,
				short: "Not found.",
				summary: "I couldn't find that record.",
				details:
					"It may have been deleted, or you may not have access. Try giving me the personCode / dealCode / companyCode if you know it.",
				recoveryActions: [
					{ label: "Search again", intent: "Search for the record by name" },
				],
			};
		default:
			return null;
	}
}

// ─── Message-pattern mappers (when there's no code) ───────────────────

function mapByMessage(err: NormalisedError, toolName: string): FriendlyToolErrorPartial {
	const m = err.message;
	const lower = m.toLowerCase();

	// Convex argument-validation errors — most common cause of the
	// dreaded generic on twoStep flows. Detect via the well-known
	// `ArgumentValidationError` substring or "Validator error" prefix
	// Convex emits.
	if (
		lower.includes("argumentvalidationerror") ||
		lower.includes("validator error") ||
		lower.includes("does not match validator") ||
		(lower.includes("expected") && lower.includes("got"))
	) {
		return {
			code: "ARG_MISMATCH",
			short: "Argument mismatch.",
			summary: "The tool tried to save with an unexpected field.",
			details: `${m}\n\nThis is a bug on our side — it has been logged. The second attempt usually goes through.`,
			manualSteps: [
				"1. Open the matching screen in the regular UI.",
				"2. Fill the form with the values you wanted.",
				"3. Click Save.",
			],
			recoveryActions: [{ label: "Try again", intent: "Retry the previous request" }],
		};
	}

	if (lower.includes("rate") && lower.includes("limit")) {
		return {
			code: "RATE_LIMITED",
			short: "Rate limited.",
			summary: "You've hit a rate limit.",
			details: "Wait a minute and try again.",
			recoveryActions: [
				{ label: "Try again in a minute", intent: "Retry the previous action" },
			],
		};
	}

	if (lower.includes("permission") || lower.includes("forbidden")) {
		// Stage 3-A H2 — same SUBAGENT_SCOPE detection as the code-keyed
		// mapper above, applied here when the error arrives without a
		// stable code (e.g. raw text from the AI SDK `tool-error` chunk).
		if (
			lower.includes("unavailable tool") ||
			lower.includes("not in available tools") ||
			lower.includes("not a valid function")
		) {
			const triedToolMatch = m.match(/['"]([a-z0-9_]+)['"]/i);
			const triedTool = triedToolMatch?.[1] ?? toolName;
			return {
				code: "SUBAGENT_SCOPE",
				short: "Wrong specialist mode.",
				summary: `I tried \`${triedTool}\` but I'm in the wrong specialist mode for that.`,
				details:
					"This usually means I picked the wrong subagent (settings vs Q&A vs CRM-action) for your request. Re-ask with a clearer verb (e.g. *follow up with*, *remind me to*, *send a message to*, *summarise*) and I'll route to the right specialist on the next turn.",
				recoveryActions: [
					{
						label: "Try again with a clearer verb",
						intent: "Retry the previous action and pick the right specialist this time",
					},
				],
			};
		}
		return {
			code: "FORBIDDEN",
			short: "Permission denied.",
			summary: "You don't have permission for this action.",
			details: m,
			manualSteps: [
				"1. Open Settings → Members & Roles.",
				"2. Ask a workspace admin to grant the relevant role.",
				"3. Return to this chat and ask me to try again.",
			],
		};
	}

	// Stage 3-A H2 — even when the error never says "permission" or
	// "forbidden" (e.g. AI SDK directly throws "Tool 'create_followup' is
	// not registered in tools"), recognise the unavailable-tool pattern
	// and surface SUBAGENT_SCOPE — it's the most common failure path with
	// small models that call layer tools without expanding the layer.
	if (
		lower.includes("unavailable tool") ||
		lower.includes("not in available tools") ||
		lower.includes("not a valid function") ||
		(lower.includes("tool") && lower.includes("not registered"))
	) {
		const triedToolMatch = m.match(/['"]([a-z0-9_]+)['"]/i);
		const triedTool = triedToolMatch?.[1] ?? toolName;
		return {
			code: "SUBAGENT_SCOPE",
			short: "Wrong specialist mode.",
			summary: `I tried \`${triedTool}\` but I'm in the wrong specialist mode for that.`,
			details:
				"This usually means I picked the wrong subagent for your request. Re-ask with a clearer verb (e.g. *follow up with*, *remind me to*, *send a message to*, *summarise*) and I'll route correctly.",
			recoveryActions: [
				{
					label: "Try again with a clearer verb",
					intent: "Retry the previous action and pick the right specialist this time",
				},
			],
		};
	}

	if (lower.includes("not found")) {
		return {
			code: "NOT_FOUND",
			short: "Not found.",
			summary: "I couldn't find that record.",
			details: m,
			recoveryActions: [{ label: "Search again", intent: "Search for the record by name" }],
		};
	}

	// Fallback — never echo an unbounded error string back to the user.
	const safe = m.length > 240 ? `${m.slice(0, 240)}…` : m;
	return {
		code: "UNKNOWN",
		short: safe.length > 60 ? `${safe.slice(0, 57)}…` : safe,
		summary: `\`${toolName}\` failed.`,
		details: safe,
		recoveryActions: [{ label: "Try again", intent: "Retry the previous action" }],
	};
}

/** Best-effort path hint for the manual-steps fallback. */
function pathHint(personOrDealOrCompanyCode: string): string {
	const upper = personOrDealOrCompanyCode.toUpperCase();
	if (upper.startsWith("P-")) return `/profile/${upper}`;
	if (upper.startsWith("D-")) return `/deals/${upper}`;
	if (upper.startsWith("CO-")) return `/companies/${upper}`;
	if (upper.startsWith("FU-")) return `/calendar?reminder=${upper}`;
	return upper;
}
