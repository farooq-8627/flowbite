"use client";

/**
 * AIPersonaEditor — markdown textarea for `definition.aiPersona`.
 *
 * The persona string is appended to Layer 3 of the AI system prompt
 * (`aiPersonaContext` injection at seed time). Editing here updates the
 * platform-level persona for FUTURE orgs that pick this template — orgs
 * already on it keep their seeded persona.
 *
 * Spec: INDUSTRY-TEMPLATES-DB-MIGRATION.md §5.3.
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

export function AIPersonaEditor({ template }: { template: Doc<"platformTemplates"> }) {
	const updateTemplate = useMutation(api._platform.industries.mutations.updateTemplate);
	const textId = useId();

	const initialValue = useMemo<string>(() => {
		const raw = template.definition?.aiPersona;
		return typeof raw === "string" ? raw : "";
	}, [template.definition]);

	const [text, setText] = useState(initialValue);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		setText(initialValue);
	}, [initialValue]);

	const dirty = text !== initialValue;

	return (
		<OwnerSettingsCard
			title="AI persona"
			description="Markdown overlay added to the AI assistant's system prompt (Layer 3 — industry context). Future orgs onboarding onto this template inherit it as their default persona; existing customers are untouched."
		>
			<form
				onSubmit={async (e) => {
					e.preventDefault();
					setBusy(true);
					try {
						const trimmed = text.trim();
						const nextDefinition: Record<string, unknown> = {
							...(template.definition as Record<string, unknown>),
						};
						if (trimmed.length === 0) {
							delete nextDefinition.aiPersona;
						} else {
							nextDefinition.aiPersona = trimmed;
						}
						await updateTemplate({
							templateKey: template.templateKey,
							patch: { definition: nextDefinition },
						});
						toast.success("AI persona saved");
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
						Persona text (markdown)
					</Label>
					<Textarea
						id={textId}
						rows={20}
						value={text}
						onChange={(e) => setText(e.target.value)}
						spellCheck
						className="font-mono text-xs"
						placeholder={`# Persona overlay\n\nYou are an industry-specialised assistant for…`}
					/>
					<span className="text-[11px] text-muted-foreground">
						Markdown supported. Keep it concise — every token here costs latency on
						every chat call.
					</span>
				</div>

				<div className="flex justify-end gap-2 pt-1">
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={busy || !dirty}
						onClick={() => setText(initialValue)}
					>
						Reset
					</Button>
					<Button type="submit" size="sm" disabled={busy || !dirty}>
						{busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
						Save persona
					</Button>
				</div>
			</form>
		</OwnerSettingsCard>
	);
}
