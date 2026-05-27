"use client";

/**
 * JsonSlotEditor — generic JSON-blob slot editor inside the
 * TemplateEditorView's tabs.
 *
 * Why one component for many tabs:
 *   The 14 array/object slots inside `definition` (pipelines, fields,
 *   modules, noteCategories, tags, customRoles, savedViews, defaults,
 *   entityLabels, entityVisibility, codePrefixes, taskDefaults,
 *   briefingDefaults, fileUpload) all share the same edit-as-JSON UX
 *   for Stage 2: monospace textarea, parse-on-save, surface validator
 *   errors inline, per-section save button. Shipping bespoke UI for
 *   each of 14 slots is a multi-week project; the JSON editor lets us
 *   ship the "every slot is editable" requirement now and revisit
 *   higher-fidelity UI per slot in a follow-up.
 *
 * Save semantics (per AGENTS.md decision #5):
 *   Each save constructs a FULL `definition` blob — copies the existing
 *   definition, replaces the edited slot, and submits the whole thing
 *   to `updateTemplate.patch.definition`. That keeps the server-side
 *   `validateDefinition` cross-reference checks intact (e.g. mockData
 *   stageCode references stay validated against the new pipelines).
 *
 * Spec: INDUSTRY-TEMPLATES-DB-MIGRATION.md §5.3 + §7.
 */

import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { normalizeError } from "@/lib/normalizeError";
import { OwnerSettingsCard } from "../../../components/OwnerSettingsCard";

type SlotKey =
	| "defaults"
	| "entityLabels"
	| "entityVisibility"
	| "codePrefixes"
	| "pipelines"
	| "fieldDefinitions"
	| "modules"
	| "noteCategories"
	| "tags"
	| "taskDefaults"
	| "briefingDefaults"
	| "fileUpload"
	| "customRoles"
	| "savedViews";

export function JsonSlotEditor({
	template,
	slot,
	title,
	hint,
	allowEmptyArray = false,
}: {
	template: Doc<"platformTemplates">;
	slot: SlotKey;
	title: string;
	hint: string;
	/** When true, an empty `[]` saves as `undefined` (slot removed). */
	allowEmptyArray?: boolean;
}) {
	const updateTemplate = useMutation(api._platform.industries.mutations.updateTemplate);
	const textId = useId();

	const initialValue = useMemo(() => template.definition?.[slot], [template.definition, slot]);
	const initialText = useMemo(
		() => (initialValue === undefined ? "" : JSON.stringify(initialValue, null, 2)),
		[initialValue],
	);

	const [text, setText] = useState(initialText);
	const [busy, setBusy] = useState(false);
	const [parseError, setParseError] = useState<string | null>(null);

	// Re-hydrate when the underlying template row updates (e.g. after a
	// save). Don't clobber an in-progress edit: re-sync only when the
	// local text matches what the previous server value was.
	useEffect(() => {
		setText(initialText);
		setParseError(null);
	}, [initialText]);

	const dirty = text !== initialText;

	return (
		<OwnerSettingsCard title={title} description={hint}>
			<form
				onSubmit={async (e) => {
					e.preventDefault();
					setParseError(null);
					setBusy(true);
					try {
						const trimmed = text.trim();
						let nextSlot: unknown;
						if (trimmed === "") {
							nextSlot = undefined;
						} else {
							try {
								nextSlot = JSON.parse(trimmed);
							} catch (err) {
								setParseError(`JSON parse error: ${(err as Error).message}`);
								setBusy(false);
								return;
							}
						}

						if (allowEmptyArray && Array.isArray(nextSlot) && nextSlot.length === 0) {
							nextSlot = undefined;
						}

						const nextDefinition: Record<string, unknown> = {
							...(template.definition as Record<string, unknown>),
						};
						if (nextSlot === undefined) {
							delete nextDefinition[slot];
						} else {
							nextDefinition[slot] = nextSlot;
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
						JSON value
					</Label>
					<Textarea
						id={textId}
						rows={20}
						value={text}
						onChange={(e) => setText(e.target.value)}
						spellCheck={false}
						className="font-mono text-xs"
						placeholder={
							initialValue === undefined ? "(unset — leave blank to skip)" : ""
						}
					/>
				</div>

				{parseError ? (
					<Alert variant="destructive">
						<AlertDescription className="text-xs">{parseError}</AlertDescription>
					</Alert>
				) : null}

				<div className="flex justify-end gap-2 pt-1">
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={busy || !dirty}
						onClick={() => {
							setText(initialText);
							setParseError(null);
						}}
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
