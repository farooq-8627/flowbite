"use client";
/**
 * core/ai/components/preview/ChatAskInput.tsx
 *
 * Form-style preview for the `ask_user_input` two-step tool. The agent fires
 * this when it needs missing required data BEFORE calling a write tool — most
 * commonly when the user said "create a lead for Sarah" without giving an
 * email, phone, etc.
 *
 * UX choices:
 *   - Each field is a labelled input. Type defaults to "text"; "tel" is for
 *     phones, "textarea" for notes, "email" surfaces the browser email keyboard
 *     on mobile.
 *   - Required fields show a red asterisk and block submit until filled.
 *   - The Submit button replaces the standard ChatConfirmation Approve button
 *     (suppressed for this tool, like ask_user_choice). Cancel is unchanged.
 *   - On submit, fires `confirmConfirmation({ decision: "approved",
 *     editedPayload: { values: {...} } })`. processChat.resume reads
 *     `editedPayload.values` and synthesises a structured user reply.
 */
import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import { ClipboardList } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Id } from "@/convex/_generated/dataModel";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type FieldType = "text" | "email" | "tel" | "url" | "number" | "textarea";

interface AskInputField {
	key: string;
	label: string;
	type?: FieldType;
	required?: boolean;
	placeholder?: string;
	hint?: string;
}

interface Props {
	args: {
		prompt?: string;
		fields?: AskInputField[];
	};
	/** Org id needed to fire confirmConfirmation. */
	orgId: string;
	/** Message id of the pending tool record. */
	messageId: string;
	/** When true, the parent has already settled; the form goes read-only. */
	disabled?: boolean;
}

export function ChatAskInput({ args, orgId, messageId, disabled }: Props) {
	const fields = Array.isArray(args?.fields) ? args.fields : [];
	const prompt = args?.prompt ?? "I need a few more details to continue:";

	const [values, setValues] = useState<Record<string, string>>(() =>
		Object.fromEntries(fields.map((f) => [f.key, ""])),
	);
	const [busy, setBusy] = useState(false);
	const confirm = useMutation(anyApi.ai.messages.confirmConfirmation);

	// Required fields must be non-empty after trim.
	const missingRequired = fields.filter((f) => {
		const v = (values[f.key] ?? "").trim();
		return f.required !== false && v.length === 0;
	});
	const submitDisabled = disabled || busy || missingRequired.length > 0;

	async function handleSubmit() {
		if (submitDisabled) return;
		setBusy(true);
		try {
			// Strip empty optional fields so the model receives ONLY the
			// values the user actually provided. Numbers are coerced from
			// the input string at the edge — the agent prompt tells the
			// model to expect "key=value" plain-text in the resume reply,
			// so we keep everything as strings here for predictability.
			const cleaned: Record<string, string> = {};
			for (const [k, v] of Object.entries(values)) {
				const trimmed = v.trim();
				if (trimmed.length > 0) cleaned[k] = trimmed;
			}
			await confirm({
				orgId: orgId as Id<"orgs">,
				messageId: messageId as Id<"aiMessages">,
				decision: "approved",
				editedPayload: { values: cleaned },
			});
		} catch (err) {
			toast.mutationError(err, "Could not submit your answer.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="space-y-3">
			<div className="flex items-start gap-2">
				<ClipboardList className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
				<p className="text-sm font-medium leading-snug">{prompt}</p>
			</div>

			{fields.length === 0 ? (
				<p className="text-[11px] italic text-muted-foreground">(no fields provided)</p>
			) : (
				<div className="space-y-2.5">
					{fields.map((f) => {
						const required = f.required !== false;
						const type = f.type ?? "text";
						const id = `ask-input-${messageId}-${f.key}`;
						return (
							<div key={f.key} className="space-y-1">
								<label
									htmlFor={id}
									className="flex items-center gap-1 text-[11px] font-medium"
								>
									{f.label}
									{required && (
										<span aria-label="required" className="text-rose-500">
											*
										</span>
									)}
								</label>
								{type === "textarea" ? (
									<Textarea
										id={id}
										disabled={disabled || busy}
										placeholder={f.placeholder}
										value={values[f.key] ?? ""}
										onChange={(e) =>
											setValues((prev) => ({
												...prev,
												[f.key]: e.target.value,
											}))
										}
										rows={3}
										className="text-sm"
									/>
								) : (
									<Input
										id={id}
										type={type}
										disabled={disabled || busy}
										placeholder={f.placeholder}
										value={values[f.key] ?? ""}
										onChange={(e) =>
											setValues((prev) => ({
												...prev,
												[f.key]: e.target.value,
											}))
										}
										className="text-sm"
									/>
								)}
								{f.hint && (
									<p className="text-[10px] leading-snug text-muted-foreground">
										{f.hint}
									</p>
								)}
							</div>
						);
					})}
				</div>
			)}

			{/* Submit lives inside the body because ChatConfirmation suppresses
			    its standard Approve button for ask_user_input (same pattern as
			    ask_user_choice). The Cancel button stays in ChatConfirmation. */}
			{!disabled && fields.length > 0 && (
				<div className="flex items-center justify-between gap-2 pt-1">
					<span
						className={cn(
							"text-[10px]",
							missingRequired.length > 0
								? "text-amber-600 dark:text-amber-400"
								: "text-muted-foreground",
						)}
					>
						{missingRequired.length > 0
							? `Fill ${missingRequired.length} required field${
									missingRequired.length === 1 ? "" : "s"
								} to continue.`
							: "Ready to submit."}
					</span>
					<Button
						type="button"
						size="sm"
						onClick={handleSubmit}
						disabled={submitDisabled}
						className="h-7 gap-1 text-[11px]"
					>
						{busy ? "Submitting…" : "Submit"}
					</Button>
				</div>
			)}
		</div>
	);
}
