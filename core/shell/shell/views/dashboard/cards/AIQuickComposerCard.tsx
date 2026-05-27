"use client";

/**
 * AIQuickComposerCard — Stage 3-A 3A.2 (SPRINT-PLAN.md).
 *
 * Replaces the Stage 5 prefill-only composer. Now Enter SENDS through
 * the same `useAIChat` pipeline ChatSheet uses, reusing the persisted
 * thread when one exists for continuity. The user no longer needs to
 * press Enter twice (once to open, once to send).
 *
 * Why this overrides the historic "user-in-control" rule
 * ──────────────────────────────────────────────────────
 * The pulse ribbon + landing-pane Top-3 are AI-initiated suggestions —
 * they SHOULD stay a click-to-act surface so users see a confirmation
 * pause before the AI runs. The QuickComposer is user-typed text the
 * human deliberately authored. Forcing a second Enter for that case
 * was the regression every audit user reported. Locked decision row
 * #27 in `AGENTS.md` codifies the carve-out: the user-in-control rule
 * still applies to AI suggestions, never to user-typed prompts.
 *
 * Behaviour
 * ─────────
 *   - Enter / chip click → handleSend(text)
 *       1. `openChatPanel()` so the side sheet slides in (idempotent).
 *       2. Reuse persisted thread (`usePersistedConversationId(orgId)`)
 *          if present, otherwise lazy-create via `useAIChat.createConversation`.
 *       3. `useAIChat.send(body, model, provider)`.
 *       4. Reset textarea + drop the in-card draft.
 *   - Shift+Enter inserts a newline (consistent with ChatComposer).
 *   - The "Enter to send · Shift+Enter for newline" hint is GONE per
 *     the user's explicit ask. The affordance still works; we trust
 *     people know it.
 *   - `<ChatModelPicker />` mounts inline so the user can pick a model
 *     from the dashboard without opening Settings.
 *   - File attach is deferred to session 2 (see Future-Enhancements.md
 *     §B.<N> "AIQuickComposerCard file attach").
 *
 * Surfaces (Convex):
 *   - Mutations through useAIChat (no new mutations introduced here).
 *   - One useQuery indirectly via useAIChat — the conversations.list
 *     query is shared with ChatSheet's history dropdown so the
 *     subscription count stays flat (AGENTS.md performance rule).
 *
 * Loading + disabled states
 * ─────────────────────────
 *   - When no AI key is configured anywhere, `useModelPreference.hasNoKeys`
 *     is true. We hide the send button + show a hint linking to
 *     Settings → AI. Mirrors ChatComposer's `hasNoKeys` branch — same
 *     UX in both surfaces.
 *   - When a send is mid-flight we DO NOT block the textarea (the user
 *     might want to queue another draft after the current one) — but
 *     the send button stays disabled until the existing send promise
 *     resolves.
 *
 * RTL-safe Tailwind only (`ms-/me-/ps-/pe-`). Border radius via
 * `var(--radius)`. App strings via `APP_CONFIG`.
 */

import { ArrowUp, KeyRound, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { APP_CONFIG } from "@/config/app-config";
import type { Id } from "@/convex/_generated/dataModel";
import { ChatModelPicker } from "@/core/ai/components/ChatModelPicker";
import { useAIChat } from "@/core/ai/hooks/useAIChat";
import { useChatRouteContext } from "@/core/ai/hooks/useChatRouteContext";
import { useModelPreference } from "@/core/ai/hooks/useModelPreference";
import { usePersistedConversationId } from "@/core/ai/hooks/usePersistedConversationId";
import { openChatPanel } from "@/core/ai/lib/chatPrefill";
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

export function AIQuickComposerCard({ className }: AIQuickComposerCardProps) {
	const { fullOrgEntry } = useCurrentOrg();
	const orgId = fullOrgEntry?.org._id;
	const orgSlug = fullOrgEntry?.org.slug;

	const [draft, setDraft] = useState("");
	const [busy, setBusy] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const { defaultModel, defaultProvider, hasNoKeys, isReady } = useModelPreference();

	// Stage 3-A H3 hook — reuse the persisted thread for continuity.
	// Decision row #27 in AGENTS.md: the QuickComposer reuses the
	// persisted thread when one exists; otherwise lazy-creates one.
	const [conversationId, setConversationId] = usePersistedConversationId(orgId);

	const { page: pageContext, entity: routeContext } = useChatRouteContext();

	// useAIChat returns `send` + `createConversation`. We only use the
	// mutation surface — the message list / conversations array are
	// already used by ChatSheet (one subscription shared).
	const { send, createConversation } = useAIChat({
		conversationId,
		routeContext,
		pageContext,
		autoContextLoad: true,
	});

	const submit = useCallback(
		async (intent: string) => {
			const trimmed = intent.trim();
			if (!orgId || trimmed.length === 0 || hasNoKeys) return;
			setBusy(true);
			try {
				// 1. Open the side sheet so the streaming response is
				//    visible. Idempotent if already open.
				openChatPanel();

				// 2. Resolve the target thread. Reuse persisted; else create.
				let targetId = conversationId;
				if (!targetId) {
					const created = (await createConversation({ orgId })) as Id<"aiConversations">;
					setConversationId(created);
					targetId = created;
				}

				// 3. Send. `useAIChat.send` already routes via the
				//    `aiConversations` mutation chain; no separate
				//    plumbing needed.
				await send(trimmed, defaultModel, defaultProvider ?? undefined);

				// 4. Reset draft + textarea.
				setDraft("");
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
			conversationId,
			createConversation,
			setConversationId,
			send,
			defaultModel,
			defaultProvider,
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

	const canSend = draft.trim().length > 0 && !busy && !hasNoKeys && isReady;

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
				"flex flex-col gap-3 rounded-[var(--radius)] border bg-card p-4 shadow-xs",
				className,
			)}
		>
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
