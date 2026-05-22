"use client";
/**
 * core/ai/components/ChatConfirmation.tsx
 *
 * Two-step confirmation card. Rendered when an AI tool proposed an action
 * and is waiting for user approval (confirmationState === "pending").
 */
import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import { CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "@/lib/toast";
import type { AIMessage } from "../types";

interface Props {
	message: AIMessage;
	orgId: string;
}

export function ChatConfirmation({ message, orgId }: Props) {
	const [busy, setBusy] = useState(false);
	const confirm = useMutation(anyApi.ai.messages.confirmConfirmation);

	const payload = message.confirmationPayload as {
		tool?: string;
		preview?: { title: string; fields: Array<{ label: string; value: unknown }> };
	} | null;

	if (!payload?.preview) return null;

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

	if (message.confirmationState !== "pending") {
		// Settled — show read-only state
		return (
			<div className="mx-4 my-2 rounded-[var(--radius)] border border-border bg-muted/40 p-3 text-sm">
				<p className="font-medium text-xs text-muted-foreground">
					{message.confirmationState === "approved" ? "✅ Approved" : "✕ Cancelled"}
					{" — "}
					{payload.preview.title}
				</p>
			</div>
		);
	}

	return (
		<div className="mx-4 my-2 rounded-[var(--radius)] border border-amber-300/60 bg-amber-50/60 p-3 dark:border-amber-700/40 dark:bg-amber-950/20">
			<p className="mb-2 font-medium text-sm">{payload.preview.title}</p>
			<dl className="mb-3 space-y-1 text-xs">
				{payload.preview.fields.map((f) => (
					<div key={f.label} className="flex gap-2">
						<dt className="text-muted-foreground min-w-24 shrink-0">{f.label}</dt>
						<dd className="font-medium truncate">{String(f.value ?? "—")}</dd>
					</div>
				))}
			</dl>
			<div className="flex gap-2">
				<Button
					size="sm"
					onClick={() => handle("approved")}
					disabled={busy}
					className="gap-1"
				>
					<CheckCircle2 className="size-3.5" />
					Approve
				</Button>
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
		</div>
	);
}
