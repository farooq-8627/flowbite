/**
 * The CorrectnessWrapper — the ONE execution path for every capability on
 * every channel. `runCapability` NEVER throws: every failure becomes a typed
 * Outcome (§1.5).
 *
 * Pipeline: coerce+strict-parse → resolve refs → RBAC → channel → risk/2FA
 * → run (catch ConvexError → business_error, arg-validator → repair,
 * transient → infra_retry).
 *
 * Coercion is in the schema (`field.*` + `z.preprocess`), so the first two
 * steps are a single `safeParse`.
 */
import { ConvexError } from "convex/values";
import type { ZodError, ZodIssue } from "zod";
import { writeAudit } from "./audit";
import { canRun, channelAllows, needsStepUp } from "./gate";
import { ask, denied, failed, repair } from "./result";
import type { Capability, CapabilityCtx, CapabilityResult } from "./types";

// ─── Reference resolver (injectable) ────────────────────────────────────────

/** How ref-resolution can end. `ok` carries the args augmented with resolved ids. */
export type RefResolution =
	| { status: "ok"; args: Record<string, unknown> }
	| { status: "not_found"; headline: string }
	| { status: "ambiguous"; question: string; options?: string[] };

/**
 * Resolves human refs (codes like `P-007`, names) inside parsed args to
 * concrete records. Injected so the wrapper is testable in isolation; the
 * real resolver lives in `convex/ai/registry/resolveRef.ts`.
 */
export type RefResolver = (
	cap: Capability,
	args: Record<string, unknown>,
	ctx: CapabilityCtx,
) => Promise<RefResolution>;

/** Default no-op resolver — capabilities that don't take refs use this. */
export const resolveRef: RefResolver = async (_cap, args) => ({ status: "ok", args });

// ─── The wrapper ─────────────────────────────────────────────────────────────

/**
 * Run a capability end-to-end. Always returns a {@link CapabilityResult};
 * never throws. `resolve` defaults to the {@link resolveRef} stub.
 */
export async function runCapability(
	cap: Capability,
	rawArgs: unknown,
	ctx: CapabilityCtx,
	resolve: RefResolver = resolveRef,
): Promise<CapabilityResult> {
	// 1+2. Coerce (baked into the schema) + strict parse.
	const parsed = cap.input.safeParse(rawArgs);
	if (!parsed.success) return zodErrorToRepair(cap, parsed.error, rawArgs);
	let args = parsed.data as Record<string, unknown>;

	try {
		// 3. Resolve refs.
		const resolution = await resolve(cap, args, ctx);
		if (resolution.status === "not_found") return failed("not_found", resolution.headline);
		if (resolution.status === "ambiguous") return ask(resolution.question, resolution.options);
		args = resolution.args;

		// 4. RBAC.
		if (!canRun(ctx.principal, cap)) return denied(cap.permission ?? "this action");

		// 5. Channel allow-list.
		if (!channelAllows(ctx.principal.channel, cap)) {
			return failed(
				"channel_blocked",
				`That action isn't available over ${ctx.principal.channel} — please do it in the web app.`,
			);
		}

		// 6. Risk / 2FA step-up.
		if (needsStepUp(cap, ctx)) {
			return failed(
				"needs_step_up",
				`"${cap.name}" is irreversible — confirm the step-up to run it.`,
			);
		}

		// 6b. Verify + consume the step-up token (when supplied + irreversible).
		//     The host injects the verifier; tests typically omit it. A token
		//     that doesn't match (capability, argsHash, not-expired, not-consumed)
		//     fails closed — the wrapper returns `needs_step_up` rather than
		//     letting a forged or replayed token through.
		if (cap.risk === "irreversible" && ctx.stepUpToken && ctx.stepUpVerifier) {
			const tokenOk = await ctx.stepUpVerifier(cap, args);
			if (!tokenOk) {
				return failed(
					"needs_step_up",
					`Step-up token for "${cap.name}" is invalid or expired — confirm again to run it.`,
				);
			}
		}

		// 7. Execute.
		const startedAt = Date.now();
		let result: CapabilityResult;
		try {
			result = await cap.run(ctx, args);
		} catch (err) {
			result = classifyRunError(cap, err);
		}
		const durationMs = Math.max(0, Date.now() - startedAt);
		// 8. Audit feed (S12) — writes ONE row per execution outcome that
		//    represents real behaviour (ok / partial / business_error /
		//    infra_retry). Never throws; redacts args before storage.
		//
		//    B.38 — When `ctx.trigger` is set to `"autonomous"` /
		//    `"autonomous_reply"`, override the audit `source` so the feed
		//    distinguishes engine-driven turns from agent-typed ones over
		//    the same channel. `trigger:"request"` (and undefined) falls
		//    through to `principal.channel` — pre-S12 behaviour preserved.
		const auditSource =
			ctx.trigger === "autonomous"
				? "autonomous"
				: ctx.trigger === "autonomous_reply"
					? "autonomous_reply"
					: undefined;
		await writeAudit({
			capability: cap,
			args,
			result,
			ctx,
			...(auditSource ? { source: auditSource } : {}),
		});
		// 8b. Per-capability `aiToolEvents` row — what the AI tool trace UI
		//     reads (`convex/ai/queries/toolTrace.ts`). The host writes
		//     one `(turn)` summary row per stream; without this per-call
		//     row the trace surface only ever shows turn-level markers
		//     instead of "create_lead 412ms / convert_lead 318ms / …".
		//     Fire-and-forget — telemetry must never break a turn.
		await recordCapabilityToolEvent({
			cap,
			ctx,
			result,
			startedAt,
			durationMs,
			source: auditSource,
		});
		return result;
	} catch (err) {
		return classifyRunError(cap, err);
	}
}

// ─── Error classification (step 7) ───────────────────────────────────────────

/** Turn a throw from `resolve`/`run` into a typed envelope (never re-throws). */
function classifyRunError(cap: Capability, err: unknown): CapabilityResult {
	// App-thrown domain error → surface the real reason.
	if (err instanceof ConvexError) {
		return failed("business_error", convexErrorMessage(err.data));
	}

	const message = err instanceof Error ? err.message : String(err);
	const lower = message.toLowerCase();

	// Convex argument-validator mismatch (extra/missing field) → self-correct.
	if (isArgValidatorError(lower)) {
		return repair(
			"arguments",
			"only the documented fields",
			truncate(message),
			"Re-call using just the fields shown in the example.",
			cap.spec.goodExample,
		);
	}

	// Provider 5xx / 429 / timeout / network blip → transparent retry.
	if (isTransient(lower)) {
		return failed("infra_retry", "A temporary problem occurred — retrying.");
	}

	// Anything else is a business failure; never echo an unbounded string.
	return failed("business_error", truncate(message));
}

/** Pull a human message out of `ConvexError.data` (string or `{ message }`). */
function convexErrorMessage(data: unknown): string {
	if (typeof data === "string") return data;
	if (
		data &&
		typeof data === "object" &&
		typeof (data as { message?: unknown }).message === "string"
	) {
		return (data as { message: string }).message;
	}
	return "The action could not be completed.";
}

function isArgValidatorError(lower: string): boolean {
	return (
		lower.includes("argumentvalidationerror") ||
		lower.includes("validator error") ||
		lower.includes("does not match validator") ||
		(lower.includes("expected") && lower.includes("got"))
	);
}

function isTransient(lower: string): boolean {
	return (
		/\b(429|5\d\d)\b/.test(lower) ||
		lower.includes("timeout") ||
		lower.includes("timed out") ||
		lower.includes("etimedout") ||
		lower.includes("econnreset") ||
		lower.includes("overloaded") ||
		lower.includes("temporarily unavailable") ||
		lower.includes("service unavailable")
	);
}

// ─── ZodError → repair ───────────────────────────────────────────────────────

/** Build a `repair` envelope from the first parse issue so the model self-corrects. */
function zodErrorToRepair(cap: Capability, error: ZodError, rawArgs: unknown): CapabilityResult {
	const issue = error.issues[0];
	const field = issue && issue.path.length > 0 ? issue.path.join(".") : "arguments";
	return repair(
		field,
		describeExpected(issue),
		describeReceived(rawArgs, issue),
		issue?.message ?? "Provide a valid value.",
		cap.spec.goodExample,
	);
}

/** Human-readable "expected" for the common Zod v4 issue codes. */
function describeExpected(issue?: ZodIssue): string {
	if (!issue) return "a valid value";
	const i = issue as ZodIssue & { expected?: string; values?: unknown[]; format?: string };
	if (i.code === "invalid_type" && i.expected) return i.expected;
	if (i.code === "invalid_value" && Array.isArray(i.values)) {
		return `one of [${i.values.map((v) => JSON.stringify(v)).join(", ")}]`;
	}
	if (i.code === "invalid_format" && i.format) return `a valid ${i.format}`;
	return i.message ?? "a valid value";
}

/** The offending value at the issue's path, JSON-stringified and capped. */
function describeReceived(rawArgs: unknown, issue?: ZodIssue): string {
	let cur: unknown = rawArgs;
	for (const seg of issue?.path ?? []) {
		if (cur && typeof cur === "object") {
			cur = (cur as Record<PropertyKey, unknown>)[seg as PropertyKey];
		} else {
			cur = undefined;
			break;
		}
	}
	if (cur === undefined) return "undefined";
	return truncate(JSON.stringify(cur));
}

function truncate(s: string, max = 200): string {
	return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

// ─── Per-capability `aiToolEvents` row (trace UI surface) ────────────────────

/**
 * Outcomes that should produce a trace-UI row. `denied` / `channel_blocked`
 * / `needs_step_up` / `needs_repair` short-circuit before `cap.run()` runs
 * so they have no meaningful duration to record (and would clutter the
 * trace surface). The audit feed still captures them via `writeAudit`.
 */
const TOOL_EVENT_OUTCOMES: ReadonlySet<string> = new Set([
	"ok",
	"partial",
	"business_error",
	"infra_retry",
]);

/**
 * Persist one `aiToolEvents` row per capability execution. Read by the
 * AI tool trace UI (`convex/ai/queries/toolTrace.ts`) to render
 * "create_lead 412ms / convert_lead 318ms / …" instead of opaque
 * `(turn)` markers from the host. Never throws — telemetry must never
 * break a turn.
 */
async function recordCapabilityToolEvent(args: {
	cap: Capability;
	ctx: CapabilityCtx;
	result: CapabilityResult;
	startedAt: number;
	durationMs: number;
	source?: string;
}): Promise<void> {
	if (!TOOL_EVENT_OUTCOMES.has(args.result.status)) return;
	// biome-ignore lint/suspicious/noExplicitAny: ActionCtx-shaped lookup, runMutation typed in the host
	const ctx = args.ctx.ctx as any;
	if (!ctx || typeof ctx.runMutation !== "function") return;
	try {
		const { internal } = await import("../../_generated/api");
		const triggeredBy = args.source
			? `${args.source}:${args.ctx.principal.userId}`
			: `${args.ctx.principal.channel}:${args.ctx.principal.userId}`;
		const errorMessage =
			args.result.status === "ok" || args.result.status === "partial"
				? undefined
				: truncate(args.result.headline ?? "", 200);
		await ctx.runMutation(internal.ai.telemetry.recordToolEvent, {
			orgId: args.ctx.principal.orgId,
			userId: args.ctx.principal.userId,
			...(args.ctx.conversationId ? { conversationId: args.ctx.conversationId } : {}),
			toolName: args.cap.name,
			layer: args.cap.module ?? args.cap.group ?? "capability",
			startedAt: args.startedAt,
			durationMs: args.durationMs,
			ok: args.result.status === "ok" || args.result.status === "partial",
			...(errorMessage ? { errorCode: args.result.status, errorMessage } : {}),
			triggeredBy,
		});
	} catch (err) {
		console.warn("[ai/wrapper] recordCapabilityToolEvent failed:", err);
	}
}
