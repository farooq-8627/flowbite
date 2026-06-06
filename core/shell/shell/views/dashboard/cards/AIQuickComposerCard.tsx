"use client";

/**
 * AIQuickComposerCard — Stage 3-A 3A.2 (SPRINT-PLAN.md), revised
 * 2026-05-27 to fix the dashboard subscription-storm + add the
 * file-attach affordance the user explicitly requested.
 *
 * Replaces the Stage 5 prefill-only composer. Enter SENDS through the
 * same `aiConversations` mutation chain ChatSheet uses, reusing the
 * persisted thread when one exists for continuity. The user no longer
 * needs to press Enter twice (once to open, once to send).
 *
 * Why this overrides the historic "user-in-control" rule
 * ──────────────────────────────────────────────────────
 * The pulse ribbon + landing-pane Top-3 are AI-initiated suggestions —
 * they SHOULD stay a click-to-act surface so users see a confirmation
 * pause before the AI runs. The QuickComposer is user-typed text the
 * human deliberately authored. Forcing a second Enter for that case
 * was the regression every audit user reported. Locked decision row
 * #27 in `AGENTS.md` codifies the carve-out.
 *
 * Why we DO NOT call `useAIChat` here (perf fix 2026-05-27)
 * ─────────────────────────────────────────────────────────
 * `useAIChat` mounts `useQuery(ai.messages.listForConversation, …)` AND
 * `useQuery(ai.conversations.list, …)` unconditionally. On the dashboard
 * the QuickComposer doesn't render any messages — it only sends them.
 * Subscribing to the message list from the dashboard meant every token
 * the orchestrator streamed into the persisted thread refired this
 * subscription, contributing the 23 `listForConversation` calls/minute
 * the Convex dashboard flagged on 2026-05-27. We now call the two
 * mutations directly via `useMutation(anyApi…)` and rely on the chat
 * panel (when the user opens it) to subscribe to the messages.
 *
 * Behaviour
 * ─────────
 *   - Enter / chip click → handleSend(text)
 *       1. Reuse persisted thread (`usePersistedConversationId(orgId)`)
 *          if present, otherwise lazy-create via `aiConversations.create`.
 *       2. Open the AI chat sheet so the streaming response is visible.
 *          (`sendChatPrefill` calls `openChatPanel` internally now.)
 *       3. Call `aiConversations.sendMessage` directly.
 *       4. Reset textarea + drop the in-card draft + attachments.
 *   - Shift+Enter inserts a newline (consistent with ChatComposer).
 *   - File attach: click 📎 → ChatAttachButton uploads via
 *     `files.generateUploadUrl` + `ai.chatAttachments.attach`, returns
 *     a `fileId` we render as a chip. On send the attachments are
 *     prepended to the body as the standard manifest line so the AI
 *     can call `analyze_file` against the storage IDs.
 *   - `<ChatModelPicker />` mounts inline so the user can pick a model
 *     without opening Settings.
 *
 * Loading + disabled states
 * ─────────────────────────
 *   - When no AI key is configured anywhere, `useModelPreference.hasNoKeys`
 *     is true. We hide the send button + show a hint linking to
 *     Settings → AI. Mirrors ChatComposer's `hasNoKeys` branch.
 *   - When a send is mid-flight we DO NOT block the textarea (the user
 *     might want to queue another draft) — but the send button stays
 *     disabled until the existing send promise resolves.
 *
 * RTL-safe Tailwind only (`ms-/me-/ps-/pe-`). Border radius via
 * `var(--radius)`. App strings via `APP_CONFIG`.
 */

import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import { ArrowUp, KeyRound, Sparkles, XIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { APP_CONFIG } from "@/config/app-config";
import type { Id } from "@/convex/_generated/dataModel";
import { ChatModelPicker } from "@/core/ai/components/ChatModelPicker";
import { ChatAttachButton } from "@/core/ai/components/composer/ChatAttachButton";
import { useChatRouteContext } from "@/core/ai/hooks/useChatRouteContext";
import { useModelPreference } from "@/core/ai/hooks/useModelPreference";
import { usePersistedConversationId } from "@/core/ai/hooks/usePersistedConversationId";
import { openChatPanel } from "@/core/ai/lib/chatPrefill";
import { useUploadAttachments } from "@/core/ai/lib/uploadAttachments";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import { cn } from "@/lib/utils";

const MAX_HEIGHT_PX = 120;

interface AIQuickComposerCardProps {
	/** Optional className for the root card; useful when the parent
	 * needs to constrain the width inside a grid cell. */
	className?: string;
}

const SUGGESTED_INTENTS = [
	"Summarise what changed in my workspace today",
	"Which leads should I follow up with first?",
	"Draft a follow-up note for my hottest deal",
];

type PendingAttachment = {
	fileId: Id<"files">;
	name: string;
	mimeType: string;
	size: number;
};

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function AIQuickComposerCard({ className }: AIQuickComposerCardProps) {
	const { fullOrgEntry } = useCurrentOrg();
	const orgId = fullOrgEntry?.org._id;
	const orgSlug = fullOrgEntry?.org.slug;

	const [draft, setDraft] = useState("");
	const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
	const [busy, setBusy] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const dragDepthRef = useRef(0);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const { defaultModel, defaultProvider, hasNoKeys, isReady } = useModelPreference();
	const { uploadFiles } = useUploadAttachments();

	// Reuse the persisted thread for continuity. Decision row #27 in
	// AGENTS.md: the QuickComposer reuses the persisted thread when one
	// exists; otherwise lazy-creates one.
	const [conversationId, setConversationId] = usePersistedConversationId(orgId);

	const { page: pageContext, entity: routeContext } = useChatRouteContext();

	// Direct mutations — perf-critical that we DO NOT mount
	// `useAIChat`'s message subscription on the dashboard. See the file
	// header for context.
	const createConversation = useMutation(anyApi.ai.conversations.create);
	const sendMessage = useMutation(anyApi.ai.messages.sendMessage);

	const ensureConversation = useCallback(async (): Promise<Id<"aiConversations">> => {
		if (!orgId) throw new Error("Org not loaded");
		if (conversationId) return conversationId;
		const created = (await createConversation({ orgId })) as Id<"aiConversations">;
		setConversationId(created);
		return created;
	}, [orgId, conversationId, createConversation, setConversationId]);

	const submit = useCallback(
		async (intent: string) => {
			const trimmed = intent.trim();
			if (!orgId || hasNoKeys) return;
			if (trimmed.length === 0 && attachments.length === 0) return;
			setBusy(true);
			try {
				// Resolve target thread (reuse persisted; else create).
				const targetId = await ensureConversation();

				// Open the side sheet so the streaming response is
				// visible. Idempotent if already open.
				openChatPanel();

				// Build body — prepend attachment manifest so the AI sees
				// fileIds and can call analyze_file.
				let body = trimmed;
				if (attachments.length > 0) {
					const manifest = attachments
						.map(
							(a) =>
								`[file:${a.fileId} "${a.name.replace(/"/g, "'")}" (${a.mimeType}, ${formatSize(a.size)})]`,
						)
						.join("\n");
					body = body ? `${manifest}\n\n${body}` : manifest;
				}

				// Send (auto-routes via aiConversations mutation chain).
				await sendMessage({
					orgId,
					conversationId: targetId,
					body,
					model: defaultModel,
					provider: defaultProvider ?? undefined,
					routeContext: routeContext
						? {
								entityType: routeContext.entityType,
								entityId: routeContext.entityId,
								personCode: routeContext.personCode,
								dealCode: routeContext.dealCode,
								name: routeContext.name,
								aiContextSummary: routeContext.aiContextSummary,
								aiContextKeyFacts: routeContext.aiContextKeyFacts,
							}
						: undefined,
					pageContext: pageContext ?? undefined,
				});

				// Reset draft + attachments + textarea.
				setDraft("");
				setAttachments([]);
				const el = textareaRef.current;
				if (el) {
					el.style.height = "auto";
				}
			} finally {
				setBusy(false);
			}
		},
		[
			orgId,
			hasNoKeys,
			attachments,
			ensureConversation,
			sendMessage,
			defaultModel,
			defaultProvider,
			routeContext,
			pageContext,
		],
	);

	const handleSubmit = useCallback(() => {
		void submit(draft);
	}, [draft, submit]);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	};

	const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		setDraft(e.target.value);
		const el = e.target;
		el.style.height = "auto";
		el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
	};

	// ─── Drag-and-drop file attach ────────────────────────────────────────
	//
	// Drop a file (CSV / image / PDF / etc) anywhere on the card root and
	// it goes through the same upload + attach pipeline as the click-📎
	// affordance via `useUploadAttachments()`. We use a ref-counted
	// drag-depth so child elements don't flicker the dashed-border overlay
	// when the cursor crosses internal boundaries.
	const handleDragEnter = useCallback(
		(e: React.DragEvent<HTMLElement>) => {
			if (busy || hasNoKeys || !orgId) return;
			if (!e.dataTransfer.types.includes("Files")) return;
			e.preventDefault();
			dragDepthRef.current += 1;
			if (dragDepthRef.current === 1) setIsDragging(true);
		},
		[busy, hasNoKeys, orgId],
	);

	const handleDragOver = useCallback(
		(e: React.DragEvent<HTMLElement>) => {
			if (busy || hasNoKeys || !orgId) return;
			if (!e.dataTransfer.types.includes("Files")) return;
			e.preventDefault();
			e.dataTransfer.dropEffect = "copy";
		},
		[busy, hasNoKeys, orgId],
	);

	const handleDragLeave = useCallback((e: React.DragEvent<HTMLElement>) => {
		e.preventDefault();
		dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
		if (dragDepthRef.current === 0) setIsDragging(false);
	}, []);

	const handleDrop = useCallback(
		async (e: React.DragEvent<HTMLElement>) => {
			e.preventDefault();
			dragDepthRef.current = 0;
			setIsDragging(false);
			if (busy || hasNoKeys || !orgId) return;
			const files = e.dataTransfer.files;
			if (!files || files.length === 0) return;
			setBusy(true);
			try {
				const uploaded = await uploadFiles(files, {
					orgId,
					conversationId,
					onEnsureConversation: ensureConversation,
				});
				if (uploaded.length > 0) {
					setAttachments((prev) => [...prev, ...uploaded]);
				}
			} finally {
				setBusy(false);
			}
		},
		[busy, hasNoKeys, orgId, conversationId, ensureConversation, uploadFiles],
	);

	const canSend =
		(draft.trim().length > 0 || attachments.length > 0) && !busy && !hasNoKeys && isReady;

	// No-key fallback — mirrors ChatComposer so the user gets a
	// consistent affordance no matter which surface they hit first.
	if (isReady && hasNoKeys) {
		return (
			<section
				aria-label={`Ask ${APP_CONFIG.name} AI`}
				className={cn(
					"flex flex-col gap-2 rounded-[var(--radius)] border border-amber-300/60 bg-amber-50/60 p-4 text-sm dark:border-amber-700/40 dark:bg-amber-950/20",
					className,
				)}
			>
				<div className="flex items-start gap-2">
					<KeyRound className="size-4 mt-0.5 shrink-0 text-amber-700 dark:text-amber-300" />
					<div className="min-w-0">
						<p className="font-medium text-amber-900 dark:text-amber-100">
							No AI key configured
						</p>
						<p className="mt-0.5 text-xs text-amber-800/80 dark:text-amber-200/80 leading-relaxed">
							Add an API key in <strong>Settings → AI</strong> (or ask an admin to set
							a platform env var). Once added, the chat works immediately — no reload
							needed.
						</p>
					</div>
				</div>
				{orgSlug && (
					<Button asChild size="sm" variant="outline" className="self-start">
						<Link href={`/${orgSlug}/settings?group=ai`}>Open AI settings</Link>
					</Button>
				)}
			</section>
		);
	}

	return (
		<section
			aria-label={`Ask ${APP_CONFIG.name} AI`}
			className={cn(
				"relative flex flex-col gap-3 rounded-[var(--radius)] border bg-card p-4 shadow-xs transition-colors",
				isDragging && "border-primary/60 bg-primary/5",
				className,
			)}
			onDragEnter={handleDragEnter}
			onDragOver={handleDragOver}
			onDragLeave={handleDragLeave}
			onDrop={(e) => void handleDrop(e)}
		>
			{isDragging && (
				<div
					aria-hidden
					className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-[var(--radius)] border-2 border-dashed border-primary bg-primary/10 text-sm font-medium text-primary"
				>
					Drop to attach
				</div>
			)}
			<header className="flex items-center gap-2">
				<span
					aria-hidden
					className="flex size-7 items-center justify-center rounded-[var(--radius)] bg-primary/10 text-primary"
				>
					<Sparkles className="size-4" />
				</span>
				<div className="min-w-0 flex-1">
					<h3 className="text-sm font-semibold leading-tight">
						Ask {APP_CONFIG.name} AI
					</h3>
					<p className="text-xs text-muted-foreground">
						Type anything — we&apos;ll send it through immediately.
					</p>
				</div>
			</header>

			<div className="flex flex-col gap-2 rounded-[var(--radius)] border border-input bg-background px-3 py-2.5 transition-colors focus-within:border-ring">
				{/* Attachment chips — only render when we have any. */}
				{attachments.length > 0 && (
					<div className="flex flex-wrap gap-1.5">
						{attachments.map((a) => (
							<span
								key={a.fileId}
								className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs"
							>
								<span className="max-w-[220px] truncate" title={a.name}>
									{a.name}
								</span>
								<span className="text-muted-foreground">
									· {formatSize(a.size)}
								</span>
								<button
									type="button"
									className="text-muted-foreground hover:text-foreground"
									onClick={() =>
										setAttachments((prev) =>
											prev.filter((p) => p.fileId !== a.fileId),
										)
									}
									aria-label={`Remove ${a.name}`}
								>
									<XIcon className="size-3" />
								</button>
							</span>
						))}
					</div>
				)}

				<textarea
					ref={textareaRef}
					value={draft}
					onChange={handleInput}
					onKeyDown={handleKeyDown}
					rows={1}
					placeholder="e.g. Schedule a follow-up with the Acme deal next Tuesday"
					className="w-full resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
					style={{ minHeight: 24, maxHeight: MAX_HEIGHT_PX }}
				/>
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-1">
						<ChatAttachButton
							orgId={orgId}
							conversationId={conversationId}
							disabled={busy || hasNoKeys}
							onAttached={(att) => setAttachments((prev) => [...prev, att])}
							onEnsureConversation={ensureConversation}
						/>
						<ChatModelPicker />
					</div>
					<Button
						size="icon"
						className="size-8 shrink-0 rounded-full"
						onClick={handleSubmit}
						disabled={!canSend}
						aria-label={`Send to ${APP_CONFIG.name} AI`}
					>
						<ArrowUp className="size-4" />
					</Button>
				</div>
			</div>

			<div className="flex flex-wrap gap-1.5">
				{SUGGESTED_INTENTS.map((intent) => (
					<button
						key={intent}
						type="button"
						className="rounded-[var(--radius)] border border-dashed bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground transition-colors hover:border-solid hover:bg-muted hover:text-foreground disabled:opacity-50"
						disabled={busy || hasNoKeys}
						onClick={() => void submit(intent)}
					>
						{intent}
					</button>
				))}
			</div>
		</section>
	);
}
