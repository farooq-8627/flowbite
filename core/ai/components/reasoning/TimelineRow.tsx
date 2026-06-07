"use client";
/**
 * core/ai/components/reasoning/TimelineRow.tsx
 *
 * One row inside <ThinkingTimeline>. Renders:
 *
 *   ┌─ rail dot
 *   │   title…                                    (optional meta on end)
 *   │       (optional inline rich block — entity list, diff, note, etc.)
 *   └──── connecting rail to the next row
 *
 * The row knows nothing about ordering. The parent timeline lays rows
 * out vertically and draws the continuous rail via a CSS pseudo-element
 * on the row container.
 *
 * The inline rich block is the same `ToolResultRenderer` used elsewhere,
 * so a search-tool row pulls a real EntityList card under it the moment
 * the tool returns. While the tool is still in flight the row reads
 * just "Title…" with a spinner.
 *
 * Pending two-step confirmations DO NOT render here — they're handled
 * in <ThinkingTimeline> and rendered as a full <ChatConfirmation> outside
 * the timeline (so the approve/reject buttons stay reachable).
 */
import { CheckCircle2, ChevronRight, Globe, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { AIMessage } from "../../types";
import { CodeBlock } from "../code/CodeBlock";
import type { ChatToolErrorEnvelope } from "../results/ChatToolError";
import { ChatToolError } from "../results/ChatToolError";
import type { ToolDisplay } from "../results/ToolResultRenderer";
import { ToolResultRenderer } from "../results/ToolResultRenderer";
import type { ToolSummary } from "../results/ToolSummaryCard";
import { ToolSummaryCard } from "../results/ToolSummaryCard";
import { getRowTitle } from "./timelineTitles";

interface Props {
	toolMessage: AIMessage;
	orgId: string;
	/** When true, the rail line below this row is hidden (last row). */
	isLast: boolean;
}

/**
 * Pull the structured `display` payload out of the tool's output object,
 * mirroring the logic that lived inline in ChatMessage. Tools either set
 * `output.display` directly OR put it on `output.data.display` depending
 * on how the helper they used wraps the return.
 */
function extractToolDisplay(output: unknown): ToolDisplay | string | undefined {
	if (output === null || output === undefined) return undefined;
	if (typeof output === "string") return output;
	if (typeof output !== "object") return undefined;
	const o = output as Record<string, unknown>;
	const top = o.display;
	if (top !== undefined) return top as ToolDisplay | string;
	const d = o.data as Record<string, unknown> | undefined;
	if (d?.display !== undefined) return d.display as ToolDisplay | string;
	return undefined;
}

/**
 * P1.9 — pull the rich `summary` envelope out of the tool's output. Tools
 * that return `summary: ToolSummary` get a structured headline + table +
 * suggested-next chip rendering above the live entity card.
 *
 * Lookup mirrors {@link extractToolDisplay} — supports both top-level and
 * nested-under-`data` shapes.
 */
function extractToolSummary(output: unknown): ToolSummary | undefined {
	if (output === null || output === undefined) return undefined;
	if (typeof output !== "object") return undefined;
	const o = output as Record<string, unknown>;
	const top = o.summary;
	if (top && typeof top === "object" && typeof (top as ToolSummary).headline === "string") {
		return top as ToolSummary;
	}
	const d = o.data as Record<string, unknown> | undefined;
	if (
		d?.summary &&
		typeof d.summary === "object" &&
		typeof (d.summary as ToolSummary).headline === "string"
	) {
		return d.summary as ToolSummary;
	}
	return undefined;
}

/**
 * Pull a one-line error message out of the tool's output. Tool-error
 * paths typically write `{ error: <string> }` or `{ ok: false, error }`.
 *
 * If the orchestrator (streamLoop / resume) attached a `friendlyMarkdown`
 * block, we surface THAT instead of the raw `error` string — same UX as
 * the assistant-body friendly error rendering. Falls through to raw
 * error or zod-formatter hint.
 *
 * Reads BOTH envelope shapes:
 *
 * 1. V2 capability envelope (`convex/ai/registry/result.ts:failed()`):
 *    `{ status, headline, errors?: [{ item, reason }], repair?: ... }`.
 *    Every non-`ok` / non-`partial` outcome (failed, needs_repair,
 *    needs_step_up, denied, channel_blocked, business_error,
 *    not_found, ambiguous, infra_retry) lands here. Without this
 *    branch the row is unclickable — the user can't see *why* it
 *    failed (the bug `docs/ai-implementation-audit.md §1` calls out).
 *
 * 2. V1 legacy shape (`{ friendlyMarkdown }` / `{ error }` /
 *    `{ hint, code:"TOOL_INPUT_VALIDATION" }`) — kept for any
 *    persisted tool messages from before the V2 cutover.
 */
function extractError(output: unknown): string | null {
	if (!output || typeof output !== "object") return null;
	const o = output as Record<string, unknown>;

	// V2 envelope — the common path. `failed()` always sets `status`
	// + `headline`; `errors[]` is per-row reasons (e.g. bulk caps).
	const status = typeof o.status === "string" ? o.status : null;
	const headline = typeof o.headline === "string" ? o.headline : null;
	if (status && status !== "ok" && status !== "partial" && headline) {
		const reasons = Array.isArray(o.errors)
			? (o.errors as Array<{ item?: unknown; reason?: unknown }>)
					.map((e) => {
						const item = typeof e?.item === "string" ? e.item : "";
						const reason = typeof e?.reason === "string" ? e.reason : "";
						if (!item && !reason) return "";
						if (!item) return `• ${reason}`;
						if (!reason) return `• ${item}`;
						return `• ${item}: ${reason}`;
					})
					.filter((line) => line.length > 0)
					.join("\n")
			: "";
		// `repair` envelopes carry a self-correction hint; surface it
		// so the user can see what the model would retry with.
		const repair = o.repair as Record<string, unknown> | undefined;
		const repairLine = repair && typeof repair.fix === "string" ? `\n\nFix: ${repair.fix}` : "";
		return reasons ? `${headline}\n\n${reasons}${repairLine}` : `${headline}${repairLine}`;
	}

	// V1 legacy shapes.
	if (typeof o.friendlyMarkdown === "string") return o.friendlyMarkdown;
	if (typeof o.error === "string") return o.error;
	// Zod-formatter shape.
	if (typeof o.hint === "string" && o.code === "TOOL_INPUT_VALIDATION") return o.hint;
	return null;
}

/**
 * P1.11 — pull the multi-tier `friendlyError` envelope out of the tool's
 * output. When present, the timeline row renders <ChatToolError> with
 * the headline always-visible plus collapsibles for details / manual
 * steps and clickable recovery chips.
 */
function extractFriendlyError(output: unknown): ChatToolErrorEnvelope | undefined {
	if (!output || typeof output !== "object") return undefined;
	const o = output as Record<string, unknown>;
	const env =
		(o.friendlyError as ChatToolErrorEnvelope | undefined) ??
		((o.data as Record<string, unknown> | undefined)?.friendlyError as
			| ChatToolErrorEnvelope
			| undefined);
	if (!env || typeof env !== "object") return undefined;
	if (typeof env.summary !== "string" || env.summary.length === 0) return undefined;
	return env;
}

/** P1.11 — pull the engineer-facing raw error string for the View raw expander. */
function extractRawError(output: unknown): string | undefined {
	if (!output || typeof output !== "object") return undefined;
	const o = output as Record<string, unknown>;
	const v =
		(o.rawError as string | undefined) ??
		((o.data as Record<string, unknown> | undefined)?.rawError as string | undefined);
	return typeof v === "string" && v.length > 0 ? v : undefined;
}

export function TimelineRow({ toolMessage, orgId, isLast }: Props) {
	// Default OPEN for rows that carry a real card (entity / entityList /
	// note / task / diff / etc.); collapsed for text-only or JSON-fallback
	// rows so the rail doesn't drown in noise. Locked 2026-06-06 (per the
	// user) — earlier versions defaulted to collapsed across the board,
	// which forced an extra click to see the entity card and made the
	// "JSON instead of cards" screenshot a recurring confusion.
	//
	// NOTE: Hook MUST be called before any conditional return below to
	// honour the Rules of Hooks (`useHookAtTopLevel`). Lazy initialiser
	// reads `toolMessage.toolCalls[0].output` to decide.
	const [expanded, setExpanded] = useState<boolean>(() => {
		const tc0 = (
			toolMessage.toolCalls as Array<{
				output?: unknown;
				status?: string;
			}> | null
		)?.[0];
		if (!tc0 || tc0.status !== "completed") return false;
		const display = extractToolDisplay(tc0.output);
		if (!display || typeof display !== "object") return false;
		return (display as ToolDisplay).kind !== "text";
	});

	const toolCalls = toolMessage.toolCalls as Array<{
		name: string;
		status: "started" | "completed" | "failed";
		input?: unknown;
		output?: unknown;
	}> | null;
	const tc = toolCalls?.[0];
	if (!tc) return null;

	const status = tc.status;
	const isInProgress = status === "started";
	const isError = status === "failed";
	// A — V1-style inline approval (locked 2026-06-06). The orchestrator
	// persists `needs_step_up` envelopes as `status: "completed"` rows
	// (so the rail doesn't render red ❌), but the underlying envelope
	// status carries the awaiting signal. Detect it here so the row
	// renders amber shield + "Awaiting confirmation" instead of green
	// check, and so the step-up rendering can mount its inline card
	// directly under this row.
	const isAwaitingApproval =
		!isInProgress &&
		!isError &&
		(() => {
			const out = tc.output;
			if (!out || typeof out !== "object") return false;
			return (out as { status?: unknown }).status === "needs_step_up";
		})();

	const { title, meta } = getRowTitle(tc.name, tc.input, tc.output);
	const display = extractToolDisplay(tc.output);
	const summary = !isInProgress && !isError ? extractToolSummary(tc.output) : undefined;
	const errorText = isError ? extractError(tc.output) : null;
	const friendlyError = isError ? extractFriendlyError(tc.output) : undefined;
	const rawErrorString = isError ? extractRawError(tc.output) : undefined;
	const hasRichBlock =
		!isInProgress &&
		!isError &&
		display !== undefined &&
		(typeof display !== "string" || display.length > 0);
	const hasStructuredKind =
		hasRichBlock &&
		typeof display === "object" &&
		display !== null &&
		(display as ToolDisplay).kind !== "text";

	// P1.9 — When summary.cardFields is provided AND the structured
	// display is an entity card, splice the override in so the live
	// EntityCard surfaces every field that was just set, not the
	// hardcoded default 5. We mutate a shallow copy here, never the
	// stored payload.
	const displayWithCardFields: ToolDisplay | string | undefined = (() => {
		if (!summary?.cardFields || summary.cardFields.length === 0) return display;
		if (typeof display !== "object" || display === null) return display;
		if ((display as ToolDisplay).kind !== "entity") return display;
		return { ...(display as ToolDisplay), cardFields: summary.cardFields } as never;
	})();

	// Raw-data fallback. When the tool returned data but didn't supply a
	// structured display kind (so `hasStructuredKind === false`), we still
	// want to let the user expand the row and see what came back. Pretty-
	// print the `data` payload (or the whole output if there's no `data`
	// field) into a CodeBlock. This is the path that surfaces the actual
	// fields list under `list_entity_fields`, the actual permissions list
	// under `list_my_permissions`, etc.
	const rawData = (() => {
		if (isInProgress || isError) return null;
		const out = tc.output;
		if (out === null || out === undefined) return null;
		if (typeof out !== "object") return null;
		const o = out as Record<string, unknown>;
		// Strip the display field — we render that separately via
		// hasStructuredKind. Anything else is "the actual data".
		const { display: _d, ...rest } = o;
		// If the tool wrapped its data under `data`, prefer that.
		const data = (rest as { data?: unknown }).data ?? rest;
		// Empty objects / "ok: true" only stubs aren't worth showing.
		if (data === null || data === undefined) return null;
		if (typeof data !== "object") return null;
		const keys = Object.keys(data as object).filter((k) => k !== "ok");
		if (keys.length === 0) return null;
		try {
			return JSON.stringify(data, null, 2);
		} catch {
			return null;
		}
	})();

	const hasExpandableContent = hasStructuredKind || !!rawData || (!!errorText && !friendlyError);

	const Icon = isInProgress
		? Loader2
		: isError
			? XCircle
			: isAwaitingApproval
				? ShieldAlert
				: CheckCircle2;

	return (
		<div className={cn("relative ps-6", !isLast && "pb-2")}>
			{/* Rail — vertical line behind the row. ::before is the
			    line itself; we draw it from the dot center down to the
			    next row's dot. The dot itself sits above the line. */}
			<span
				aria-hidden
				className={cn(
					"absolute start-[10px] top-5 w-px bg-border",
					isLast ? "bottom-2" : "bottom-0",
				)}
			/>

			{/* Status dot — sits ON the rail, slightly above the title baseline */}
			<span
				aria-hidden
				className={cn(
					"absolute start-[6px] top-1 size-[10px] rounded-full ring-2 ring-background",
					isInProgress && "bg-primary/60 animate-pulse",
					!isInProgress && !isError && !isAwaitingApproval && "bg-emerald-500",
					isAwaitingApproval && "bg-amber-500",
					isError && "bg-destructive",
				)}
			/>

			{/* Title row */}
			<button
				type="button"
				onClick={() => hasExpandableContent && setExpanded((v) => !v)}
				disabled={!hasExpandableContent}
				className={cn(
					"group flex w-full items-center gap-2 text-start min-w-0",
					"text-[12px] leading-relaxed",
					hasExpandableContent && "cursor-pointer",
				)}
				aria-expanded={hasExpandableContent ? expanded : undefined}
			>
				<Icon
					className={cn(
						"size-3.5 flex-none",
						isInProgress && "animate-spin text-muted-foreground",
						!isInProgress &&
							!isError &&
							!isAwaitingApproval &&
							"text-muted-foreground/70",
						isAwaitingApproval && "text-amber-600 dark:text-amber-400",
						isError && "text-destructive",
					)}
				/>
				<span
					className={cn(
						"truncate",
						isError && "text-destructive",
						isAwaitingApproval && "text-amber-700 dark:text-amber-300 font-medium",
						!isError && !isAwaitingApproval && "text-foreground/80",
					)}
				>
					{title}
				</span>
				{!meta && isAwaitingApproval && (
					<span className="ms-auto shrink-0 text-[11px] font-medium text-amber-700 dark:text-amber-300">
						Awaiting confirmation
					</span>
				)}
				{meta && (
					<span className="ms-auto shrink-0 text-[11px] text-muted-foreground/70">
						{meta}
					</span>
				)}
				{hasExpandableContent && (
					<ChevronRight
						aria-hidden
						className={cn(
							"size-3 flex-none text-muted-foreground/50 transition-transform",
							!meta && "ms-auto",
							expanded && "rotate-90",
						)}
					/>
				)}
			</button>

			{/* P1.9 — rich tool-result summary (always visible when the
			    tool returned a `summary` envelope). Sits ABOVE the
			    collapsible structured display so the user sees the
			    headline + table + suggested-next chips immediately
			    without expanding. */}
			{summary && (
				<div className="mt-1.5 mb-1.5 w-full max-w-full min-w-0">
					<ToolSummaryCard summary={summary} />
				</div>
			)}

			{/* P1.11 — multi-tier friendly tool error. Always visible
			    when the tool failed and the orchestrator attached a
			    structured envelope. Renders the headline + collapsibles
			    for details / manualSteps and recovery chips. The legacy
			    flat errorText fallback below stays for tool errors that
			    didn't go through `friendlyToolError` (e.g. very old
			    persisted errors). */}
			{isError && friendlyError && (
				<div className="mt-1.5 mb-1.5 w-full max-w-full min-w-0">
					<ChatToolError envelope={friendlyError} rawError={rawErrorString} />
				</div>
			)}

			{/* Inline rich block — embedded under the title row. The
			    `ms-0` keeps the rich block aligned to the title text,
			    not indented further; the rail is on the OUTSIDE of the
			    container so the block doesn't push the rail. */}
			{expanded && hasRichBlock && hasStructuredKind && (
				<div className="mt-1.5 mb-0.5 w-full max-w-full min-w-0 rounded-[var(--radius)] border border-border/60 bg-background overflow-hidden">
					<ToolResultRenderer
						display={displayWithCardFields as ToolDisplay}
						orgId={orgId}
					/>
				</div>
			)}

			{/* Raw-data fallback for tools without a structured display. */}
			{expanded && !hasStructuredKind && rawData && (
				<div className="mt-1.5 mb-0.5 w-full max-w-full min-w-0">
					<CodeBlock code={rawData} label="result" maxHeight={240} />
				</div>
			)}

			{expanded && errorText && !friendlyError && (
				<div className="mt-1.5 mb-0.5 w-full max-w-full min-w-0">
					<CodeBlock code={errorText} label="error" maxHeight={140} />
				</div>
			)}
		</div>
	);
}

/**
 * Compact in-flight row used while the orchestrator has emitted
 * `→ Calling …` but no tool message has materialised yet (rare race —
 * the placeholder lasts ~50-200ms before the real tool message inserts).
 *
 * Re-uses the same visual structure as TimelineRow but takes only a
 * tool name — there's no message id yet.
 */
export function PendingTimelineRow({ toolName }: { toolName: string }) {
	const { title } = getRowTitle(toolName, {}, {});
	return (
		<div className="relative ps-6 pb-2">
			<span aria-hidden className="absolute start-[10px] top-5 bottom-0 w-px bg-border" />
			<span
				aria-hidden
				className="absolute start-[6px] top-1 size-[10px] rounded-full ring-2 ring-background bg-primary/60 animate-pulse"
			/>
			<div className="flex items-center gap-2 text-[12px] leading-relaxed text-muted-foreground/80">
				<Loader2 className="size-3.5 flex-none animate-spin text-muted-foreground" />
				<span className="truncate">{title}…</span>
			</div>
		</div>
	);
}

/**
 * A "thinking paragraph" row — the parser ran into a chunk of free-form
 * chain-of-thought between tool calls. Looks like the screenshot's
 * "Working" paragraph but inline within the rail.
 */
export function ThinkingTimelineRow({ text }: { text: string }) {
	return (
		<div className="relative ps-6 pb-2">
			<span aria-hidden className="absolute start-[10px] top-5 bottom-0 w-px bg-border" />
			<span
				aria-hidden
				className="absolute start-[6px] top-1.5 size-[8px] rounded-full ring-2 ring-background bg-muted-foreground/40"
			/>
			<div className="flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">
				<Globe className="size-3.5 mt-0.5 flex-none text-muted-foreground/50" />
				<span className="min-w-0">{text}</span>
			</div>
		</div>
	);
}
