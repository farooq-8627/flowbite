"use client";
/**
 * core/ai/components/ChatConfirmation.tsx
 *
 * Two-step confirmation card. Rendered when an AI tool proposed an action
 * and is waiting for user approval (confirmationState === "pending").
 *
 * The card is split in three pieces:
 *   1. Header (always rendered) — small "Awaiting approval" pill.
 *   2. Body — looked up from the per-tool preview registry by
 *      `payload.tool`. Falls back to GenericPreviewCard for tools that
 *      don't have a dedicated layout yet.
 *   3. Footer — Approve / Cancel buttons with a busy state.
 *
 * Special case: `ask_user_choice` renders `ChatMultipleChoice` as its
 * body — each option IS its own approve, so the standard Approve button
 * is suppressed; only Cancel stays.
 *
 * Settled states (approved / rejected) keep the same body so the user
 * sees what was approved or rejected, but with a tinted treatment.
 */
import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import { CheckCircle2, Sparkles, XCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { AIMessage } from "../types";
import { getPreviewCard } from "./preview";
import { ChatAskInput } from "./preview/ChatAskInput";
import { ChatMultipleChoice } from "./preview/ChatMultipleChoice";

interface Props {
	message: AIMessage;
	orgId: string;
}

interface ConfirmationPayload {
	tool?: string;
	args?: Record<string, unknown>;
	preview?: { title: string; fields: Array<{ label: string; value: unknown }> };
}

export function ChatConfirmation({ message, orgId }: Props) {
	const [busy, setBusy] = useState(false);
	const confirm = useMutation(anyApi.ai.messages.confirmConfirmation);

	const payload = (message.confirmationPayload ?? null) as ConfirmationPayload | null;
	if (!payload) return null;

	const toolName = payload.tool ?? "";
	const args = payload.args ?? {};
	const preview = payload.preview;
	const title = preview?.title ?? (toolName ? toolName.replace(/_/g, " ") : "Awaiting approval");

	const isAskChoice = toolName === "ask_user_choice";
	const isAskInput = toolName === "ask_user_input";
	const PreviewCard = getPreviewCard(toolName);

	async function handle(decision: "approved" | "rejected") {
		setBusy(true);
		try {
			await confirm({
				orgId: orgId as Id<"orgs">,
				messageId: message._id,
				decision,
			});
		} catch (err) {
			toast.mutationError(err, "Could not process confirmation.");
		} finally {
			setBusy(false);
		}
	}

	const settled =
		message.confirmationState === "approved" || message.confirmationState === "rejected";
	const isPending = message.confirmationState === "pending";

	const tone = settled
		? message.confirmationState === "approved"
			? "border-emerald-300/60 bg-emerald-50/40 dark:border-emerald-700/40 dark:bg-emerald-950/10"
			: "border-rose-300/60 bg-rose-50/40 dark:border-rose-700/40 dark:bg-rose-950/10"
		: "border-amber-300/60 bg-amber-50/60 dark:border-amber-700/40 dark:bg-amber-950/20";

	return (
		<div className={cn("mx-4 my-2 rounded-[var(--radius)] border p-3", tone)}>
			<div className="mb-2 flex items-center gap-2">
				<Sparkles
					className={cn(
						"size-3.5",
						settled
							? message.confirmationState === "approved"
								? "text-emerald-600 dark:text-emerald-400"
								: "text-rose-600 dark:text-rose-400"
							: "text-amber-600 dark:text-amber-400",
					)}
				/>
				<p className="text-[11px] font-semibold uppercase tracking-wide">
					{settled
						? message.confirmationState === "approved"
							? "Approved"
							: "Cancelled"
						: isAskChoice
							? "Pick one"
							: isAskInput
								? "Need more info"
								: "Awaiting approval"}
				</p>
				<span className="ms-auto truncate text-[10px] text-muted-foreground">{title}</span>
			</div>

			{/* Body — per-tool preview card. ask_user_choice uses its own
			    component because each option button IS the approval. */}
			{isAskChoice ? (
				<ChatMultipleChoice
					args={
						args as {
							prompt?: string;
							options?: { value: string; label: string; hint?: string }[];
						}
					}
					orgId={orgId}
					messageId={message._id as string}
					disabled={settled}
				/>
			) : isAskInput ? (
				<ChatAskInput
					args={
						args as {
							prompt?: string;
							fields?: Array<{
								key: string;
								label: string;
								type?: "text" | "email" | "tel" | "url" | "number" | "textarea";
								required?: boolean;
								placeholder?: string;
								hint?: string;
							}>;
						}
					}
					orgId={orgId}
					messageId={message._id as string}
					disabled={settled}
				/>
			) : (
				<PreviewCard args={args} fields={preview?.fields} title={preview?.title} />
			)}

			{/* Footer — only when still pending. ask_user_choice surfaces only
			    a Cancel; the per-option buttons handle approve. ask_user_input
			    surfaces only Cancel; its Submit button lives inside the form. */}
			{isPending && (
				<div className="mt-3 flex gap-2">
					{!isAskChoice && !isAskInput && (
						<Button
							size="sm"
							onClick={() => handle("approved")}
							disabled={busy}
							className="gap-1"
						>
							<CheckCircle2 className="size-3.5" />
							Approve
						</Button>
					)}
					<Button
						size="sm"
						variant="ghost"
						onClick={() => handle("rejected")}
						disabled={busy}
						className="gap-1"
					>
						<XCircle className="size-3.5" />
						Cancel
					</Button>
				</div>
			)}
		</div>
	);
}
