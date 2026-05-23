"use client";
/**
 * core/ai/components/preview/ChatMultipleChoice.tsx
 *
 * Per-option clickable picker. Renders inside `ChatConfirmation` when the
 * AI calls `ask_user_choice`. Clicking an option fires `confirmConfirmation`
 * with `editedPayload: { value: <option.value> }` — `processChat.resume`
 * picks that up via the `ask_user_choice` special branch, synthesises a
 * user message, and re-runs the agent loop.
 *
 * The Cancel button stays in `ChatConfirmation` (the standard rejected
 * path). The standard Approve button is suppressed for `ask_user_choice`
 * because each option IS its own approve.
 */
import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import { ChevronRight, HelpCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface ChoiceOption {
	value: string;
	label: string;
	hint?: string;
}

interface Props {
	args: {
		prompt?: string;
		options?: ChoiceOption[];
	};
	/** Org id needed to fire confirmConfirmation. */
	orgId: string;
	/** Message id of the pending tool record. */
	messageId: string;
	/** When true, the parent has already settled; the buttons go disabled. */
	disabled?: boolean;
}

export function ChatMultipleChoice({ args, orgId, messageId, disabled }: Props) {
	const [busyValue, setBusyValue] = useState<string | null>(null);
	const confirm = useMutation(anyApi.ai.messages.confirmConfirmation);

	const prompt = args?.prompt ?? "Pick one to continue:";
	const options = Array.isArray(args?.options) ? args.options : [];

	async function pick(option: ChoiceOption) {
		if (disabled || busyValue) return;
		setBusyValue(option.value);
		try {
			await confirm({
				orgId: orgId as Id<"orgs">,
				messageId: messageId as Id<"aiMessages">,
				decision: "approved",
				editedPayload: { value: option.value, label: option.label },
			});
		} catch (err) {
			toast.mutationError(err, "Could not record your choice.");
			setBusyValue(null);
		}
	}

	return (
		<div className="space-y-2.5">
			<div className="flex items-start gap-2">
				<HelpCircle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
				<p className="text-sm font-medium leading-snug">{prompt}</p>
			</div>

			{options.length === 0 ? (
				<p className="text-[11px] italic text-muted-foreground">
					(no options provided — ask the user directly)
				</p>
			) : (
				<div className="space-y-1.5">
					{options.map((opt, i) => (
						<Button
							key={opt.value}
							variant="outline"
							size="sm"
							disabled={disabled || busyValue !== null}
							onClick={() => pick(opt)}
							className={cn(
								"h-auto w-full justify-start gap-2 whitespace-normal py-2 text-start",
								busyValue === opt.value && "bg-emerald-50 dark:bg-emerald-950/30",
							)}
						>
							<span className="grid size-5 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold">
								{i + 1}
							</span>
							<span className="flex min-w-0 flex-1 flex-col">
								<span className="truncate text-xs font-medium">{opt.label}</span>
								{opt.hint && (
									<span className="truncate text-[10px] text-muted-foreground">
										{opt.hint}
									</span>
								)}
							</span>
							<ChevronRight className="ms-auto size-3.5 shrink-0 opacity-60" />
						</Button>
					))}
				</div>
			)}
		</div>
	);
}
