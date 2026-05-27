"use client";

/**
 * StringArrayEditor — one-string-per-line editor for slots whose value
 * is a `string[]` (e.g. `dashboardMetrics`, `navHiddenSlots`).
 *
 * Cleaner than asking the operator to handwrite a JSON array — but
 * still backed by a textarea so paste-from-spreadsheet works.
 *
 * Save semantics mirror `JsonSlotEditor`: copy the existing
 * `definition`, replace the slot with the parsed array (or remove when
 * empty), and submit the whole thing to `updateTemplate.patch.definition`.
 */

import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { normalizeError } from "@/lib/normalizeError";
import { OwnerSettingsCard } from "../../../components/OwnerSettingsCard";

type SlotKey = "dashboardMetrics" | "navHiddenSlots";

export function StringArrayEditor({
	template,
	slot,
	title,
	hint,
}: {
	template: Doc<"platformTemplates">;
	slot: SlotKey;
	title: string;
	hint: string;
}) {
	const updateTemplate = useMutation(api._platform.industries.mutations.updateTemplate);
	const textId = useId();

	const initialArray = useMemo<string[]>(() => {
		const raw = template.definition?.[slot];
		return Array.isArray(raw) ? (raw as string[]) : [];
	}, [template.definition, slot]);
	const initialText = initialArray.join("\n");

	const [text, setText] = useState(initialText);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		setText(initialText);
	}, [initialText]);

	const dirty = text !== initialText;

	return (
		<OwnerSettingsCard title={title} description={hint}>
			<form
				onSubmit={async (e) => {
					e.preventDefault();
					setBusy(true);
					try {
						const lines = text
							.split("\n")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						const nextDefinition: Record<string, unknown> = {
							...(template.definition as Record<string, unknown>),
						};
						if (lines.length === 0) {
							delete nextDefinition[slot];
						} else {
							nextDefinition[slot] = lines;
						}
						await updateTemplate({
							templateKey: template.templateKey,
							patch: { definition: nextDefinition },
						});
						toast.success(`${title} saved`);
					} catch (err) {
						toast.error(normalizeError(err, "Failed to save"));
					} finally {
						setBusy(false);
					}
				}}
				className="space-y-3"
			>
				<div className="flex flex-col gap-1">
					<Label htmlFor={textId} className="text-xs font-medium">
						One entry per line
					</Label>
					<Textarea
						id={textId}
						rows={10}
						value={text}
						onChange={(e) => setText(e.target.value)}
						spellCheck={false}
						className="font-mono text-xs"
					/>
				</div>

				<div className="flex justify-end gap-2 pt-1">
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={busy || !dirty}
						onClick={() => setText(initialText)}
					>
						Reset
					</Button>
					<Button type="submit" size="sm" disabled={busy || !dirty}>
						{busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
						Save section
					</Button>
				</div>
			</form>
		</OwnerSettingsCard>
	);
}
