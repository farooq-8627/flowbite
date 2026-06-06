"use client";

/**
 * WhatsApp template editor drawer (B.40).
 *
 * Used in two modes:
 *   - `mode="create"` — new built-in row (orgId stays undefined). Org
 *     overrides are seeded by an in-app per-org surface (future) but
 *     the owner-panel form supports built-ins only by design — owner
 *     creates the cross-org default; orgs override per-row.
 *   - `mode="edit"`   — patches an existing row by `_id`. Built-in vs
 *     override is not changeable post-creation; templateId is locked
 *     once the row exists.
 *
 * The form ALWAYS validates the body / variables consistency client-
 * side (matching `assertBodyMatchesVariables` in the mutation) so the
 * operator gets a fast error before the round-trip — but the mutation
 * is the actual gate. Never trust the client for authority.
 *
 * Spec: `Future-Enhancements.md §B.40`.
 */

import { useMutation, useQuery } from "convex/react";
import { Loader2, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { normalizeError } from "@/lib/normalizeError";

type ApprovalStatus = "draft" | "submitted" | "approved" | "rejected";
type Category = "utility" | "marketing" | "authentication";

type Variable = {
	uid: string;
	name: string;
	description: string;
	defaultValue: string;
};

type DraftState = {
	templateId: string;
	label: string;
	description: string;
	category: Category;
	body: string;
	variables: Variable[];
	contentSid: string;
	approvalStatus: ApprovalStatus;
	approvalNote: string;
	active: boolean;
};

const TEMPLATE_ID_REGEX = /^[a-z][a-z0-9_]*[a-z0-9]$/;
const VAR_NAME_REGEX = /^[a-z][a-z0-9_]*$/;

function genUid(): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}
	return `v-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}

function emptyDraft(): DraftState {
	return {
		templateId: "",
		label: "",
		description: "",
		category: "utility",
		body: "",
		variables: [],
		contentSid: "",
		approvalStatus: "draft",
		approvalNote: "",
		active: true,
	};
}

export function TemplateEditorDrawer({
	mode,
	rowId,
	onClose,
}: {
	mode: "create" | "edit";
	rowId?: Id<"whatsappTemplates">;
	onClose: () => void;
}) {
	const existing = useQuery(
		api._platform.whatsappTemplates.queries.getForOwner,
		mode === "edit" && rowId ? { templateRowId: rowId } : "skip",
	);

	const create = useMutation(api._platform.whatsappTemplates.mutations.createTemplate);
	const update = useMutation(api._platform.whatsappTemplates.mutations.updateTemplate);

	const [draft, setDraft] = useState<DraftState>(emptyDraft);
	const [submitting, setSubmitting] = useState(false);
	const [hydrated, setHydrated] = useState(mode === "create");

	useEffect(() => {
		if (mode === "create") {
			setDraft(emptyDraft());
			setHydrated(true);
			return;
		}
		if (existing) {
			setDraft({
				templateId: existing.templateId,
				label: existing.label,
				description: existing.description,
				category: existing.category,
				body: existing.body,
				variables: existing.variables.map((v) => ({
					uid: genUid(),
					name: v.name,
					description: v.description,
					defaultValue: v.defaultValue ?? "",
				})),
				contentSid: existing.contentSid ?? "",
				approvalStatus: existing.approvalStatus,
				approvalNote: existing.approvalNote ?? "",
				active: existing.active,
			});
			setHydrated(true);
		}
	}, [mode, existing]);

	const isBuiltIn = mode === "edit" && existing?.isBuiltIn === true;

	const validation = useMemo(() => {
		const errs: string[] = [];
		if (mode === "create") {
			if (draft.templateId.length < 3 || draft.templateId.length > 64) {
				errs.push("Template id must be 3–64 characters.");
			} else if (!TEMPLATE_ID_REGEX.test(draft.templateId)) {
				errs.push(
					"Template id may only contain lowercase letters, digits, and underscores; must start with a letter.",
				);
			}
		}
		if (draft.label.length === 0 || draft.label.length > 80) {
			errs.push("Label is required (1–80 characters).");
		}
		if (draft.description.length === 0 || draft.description.length > 240) {
			errs.push("Description is required (1–240 characters).");
		}
		if (draft.body.length === 0 || draft.body.length > 1024) {
			errs.push("Body is required (1–1024 characters).");
		}
		const seenVars = new Set<string>();
		for (const v of draft.variables) {
			if (!v.name || !VAR_NAME_REGEX.test(v.name)) {
				errs.push(`Variable "${v.name || "(blank)"}" has an invalid name.`);
				continue;
			}
			if (seenVars.has(v.name)) {
				errs.push(`Duplicate variable name: "${v.name}".`);
			}
			seenVars.add(v.name);
			if (!v.description) errs.push(`Variable "${v.name}" needs a description.`);
		}
		const referenced = new Set<string>();
		for (const m of draft.body.matchAll(/\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/g)) {
			referenced.add(m[1] as string);
		}
		const declared = new Set(draft.variables.map((v) => v.name));
		for (const n of referenced) {
			if (!declared.has(n)) errs.push(`Body uses {{${n}}} but it isn't declared.`);
		}
		for (const n of declared) {
			if (!referenced.has(n)) errs.push(`Variable "${n}" is declared but not used in body.`);
		}
		return errs;
	}, [mode, draft]);

	async function handleSubmit() {
		if (validation.length > 0) {
			toast.error(validation[0] as string);
			return;
		}
		setSubmitting(true);
		try {
			if (mode === "create") {
				await create({
					templateId: draft.templateId.trim(),
					label: draft.label.trim(),
					description: draft.description.trim(),
					category: draft.category,
					body: draft.body,
					variables: draft.variables.map((v) => ({
						name: v.name,
						description: v.description,
						defaultValue: v.defaultValue.trim() || undefined,
					})),
					contentSid: draft.contentSid.trim() || undefined,
					approvalStatus: draft.approvalStatus,
					approvalNote: draft.approvalNote.trim() || undefined,
				});
				toast.success(`Created "${draft.templateId}"`);
			} else if (rowId) {
				await update({
					templateRowId: rowId,
					patch: {
						label: draft.label.trim(),
						description: draft.description.trim(),
						category: draft.category,
						body: draft.body,
						variables: draft.variables.map((v) => ({
							name: v.name,
							description: v.description,
							defaultValue: v.defaultValue.trim() || undefined,
						})),
						contentSid: draft.contentSid.trim() || null,
						approvalStatus: draft.approvalStatus,
						approvalNote: draft.approvalNote.trim() || null,
						active: draft.active,
					},
				});
				toast.success(`Updated "${draft.templateId}"`);
			}
			onClose();
		} catch (err) {
			toast.error(normalizeError(err, "Could not save template"));
		} finally {
			setSubmitting(false);
		}
	}

	function patchVariable(idx: number, patch: Partial<Variable>) {
		setDraft((d) => ({
			...d,
			variables: d.variables.map((v, i) => (i === idx ? { ...v, ...patch } : v)),
		}));
	}
	function addVariable() {
		setDraft((d) => ({
			...d,
			variables: [
				...d.variables,
				{ uid: genUid(), name: "", description: "", defaultValue: "" },
			],
		}));
	}
	function removeVariable(idx: number) {
		setDraft((d) => ({ ...d, variables: d.variables.filter((_, i) => i !== idx) }));
	}

	return (
		<Sheet
			open
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<SheetContent
				side="end"
				className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl"
				dir="ltr"
			>
				<SheetHeader className="border-b border-border px-6 py-4">
					<SheetTitle>
						{mode === "create" ? "New WhatsApp template" : `Edit "${draft.templateId}"`}
					</SheetTitle>
					<SheetDescription>
						{mode === "create"
							? "Built-in templates apply to every org that hasn't set its own override."
							: isBuiltIn
								? "Built-in template — edits propagate to every org without an override."
								: "Org override — edits only affect this single workspace."}
					</SheetDescription>
				</SheetHeader>

				<div className="flex-1 overflow-y-auto px-6 py-5">
					{!hydrated && mode === "edit" ? (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" /> Loading template…
						</div>
					) : (
						<div className="grid gap-4">
							<div className="grid gap-1 text-xs">
								<span className="font-medium text-foreground">
									Template id{" "}
									<span className="text-muted-foreground">
										(immutable once created)
									</span>
								</span>
								<Input
									value={draft.templateId}
									onChange={(e) =>
										setDraft((d) => ({ ...d, templateId: e.target.value }))
									}
									placeholder="e.g. greeting_v1"
									autoComplete="off"
									className="font-mono"
									disabled={mode === "edit"}
								/>
							</div>

							<div className="grid gap-1 text-xs">
								<span className="font-medium text-foreground">Label</span>
								<Input
									value={draft.label}
									onChange={(e) =>
										setDraft((d) => ({ ...d, label: e.target.value }))
									}
									placeholder="Greeting"
									maxLength={80}
								/>
							</div>

							<div className="grid gap-1 text-xs">
								<span className="font-medium text-foreground">Description</span>
								<Textarea
									value={draft.description}
									onChange={(e) =>
										setDraft((d) => ({ ...d, description: e.target.value }))
									}
									placeholder="Hint shown to the AI when picking this template."
									maxLength={240}
									rows={2}
								/>
							</div>

							<div className="grid gap-1 text-xs">
								<span className="font-medium text-foreground">Category</span>
								<select
									value={draft.category}
									onChange={(e) =>
										setDraft((d) => ({
											...d,
											category: e.target.value as Category,
										}))
									}
									className="h-9 rounded-[var(--radius)] border border-input bg-background px-3 text-sm outline-none focus:border-ring"
								>
									<option value="utility">Utility (transactional)</option>
									<option value="marketing">Marketing</option>
									<option value="authentication">Authentication</option>
								</select>
							</div>

							<div className="grid gap-1 text-xs">
								<span className="font-medium text-foreground">Body</span>
								<Textarea
									value={draft.body}
									onChange={(e) =>
										setDraft((d) => ({ ...d, body: e.target.value }))
									}
									placeholder="Hi {{name}}, …"
									rows={5}
									maxLength={1024}
									className="font-mono text-sm"
								/>
								<span className="text-[11px] text-muted-foreground">
									Use <code>{"{{var}}"}</code> for placeholders. Every variable
									must be declared below.
								</span>
							</div>

							<div className="grid gap-2">
								<div className="flex items-center justify-between">
									<span className="text-xs font-medium text-foreground">
										Variables ({draft.variables.length})
									</span>
									<Button
										type="button"
										size="sm"
										variant="outline"
										onClick={addVariable}
									>
										<Plus className="me-1.5 h-3.5 w-3.5" /> Add variable
									</Button>
								</div>
								{draft.variables.length === 0 ? (
									<p className="text-xs text-muted-foreground">
										No variables yet. Add one for every <code>{"{{var}}"}</code>{" "}
										in the body.
									</p>
								) : (
									<div className="space-y-2">
										{draft.variables.map((v, i) => (
											<div
												key={v.uid}
												className="grid gap-2 rounded-[var(--radius)] border border-border bg-muted/40 p-3 sm:grid-cols-[1fr_2fr_1fr_auto]"
											>
												<Input
													value={v.name}
													onChange={(e) =>
														patchVariable(i, {
															name: e.target.value,
														})
													}
													placeholder="name"
													className="font-mono text-xs"
												/>
												<Input
													value={v.description}
													onChange={(e) =>
														patchVariable(i, {
															description: e.target.value,
														})
													}
													placeholder="The lead's first name."
													className="text-xs"
												/>
												<Input
													value={v.defaultValue}
													onChange={(e) =>
														patchVariable(i, {
															defaultValue: e.target.value,
														})
													}
													placeholder="default (optional)"
													className="text-xs"
												/>
												<Button
													type="button"
													size="sm"
													variant="ghost"
													onClick={() => removeVariable(i)}
													aria-label="Remove variable"
												>
													<X className="h-3.5 w-3.5" />
												</Button>
											</div>
										))}
									</div>
								)}
							</div>

							<div className="grid gap-1 text-xs">
								<span className="font-medium text-foreground">
									Twilio Content SID (optional)
								</span>
								<Input
									value={draft.contentSid}
									onChange={(e) =>
										setDraft((d) => ({ ...d, contentSid: e.target.value }))
									}
									placeholder="HX…"
									className="font-mono"
								/>
								<span className="text-[11px] text-muted-foreground">
									Set after Twilio approves the template — required for
									out-of-window sends via the Content API.
								</span>
							</div>

							<div className="grid gap-3 sm:grid-cols-2">
								<div className="grid gap-1 text-xs">
									<span className="font-medium text-foreground">
										Approval status
									</span>
									<select
										value={draft.approvalStatus}
										onChange={(e) =>
											setDraft((d) => ({
												...d,
												approvalStatus: e.target.value as ApprovalStatus,
											}))
										}
										className="h-9 rounded-[var(--radius)] border border-input bg-background px-3 text-sm outline-none focus:border-ring"
									>
										<option value="draft">Draft</option>
										<option value="submitted">Submitted</option>
										<option value="approved">Approved</option>
										<option value="rejected">Rejected</option>
									</select>
								</div>

								<label className="flex items-end gap-2 pb-1 text-xs">
									<input
										type="checkbox"
										checked={draft.active}
										onChange={(e) =>
											setDraft((d) => ({ ...d, active: e.target.checked }))
										}
										className="size-4"
									/>
									<span className="font-medium text-foreground">
										Active{" "}
										<span className="text-muted-foreground">
											(uncheck to archive — built-ins can't be deleted)
										</span>
									</span>
								</label>
							</div>

							<div className="grid gap-1 text-xs">
								<span className="font-medium text-foreground">
									Approval note (optional)
								</span>
								<Textarea
									value={draft.approvalNote}
									onChange={(e) =>
										setDraft((d) => ({ ...d, approvalNote: e.target.value }))
									}
									placeholder="Why was this rejected? Submission ticket reference?"
									rows={2}
								/>
							</div>

							{validation.length > 0 ? (
								<ul className="rounded-[var(--radius)] border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300">
									{validation.map((e) => (
										<li key={e}>• {e}</li>
									))}
								</ul>
							) : null}
						</div>
					)}
				</div>

				<SheetFooter className="border-t border-border px-6 py-3 sm:flex-row sm:justify-end sm:gap-2 sm:space-x-0">
					<Button type="button" variant="outline" onClick={onClose}>
						Cancel
					</Button>
					<Button
						type="button"
						onClick={handleSubmit}
						disabled={submitting || validation.length > 0}
					>
						{submitting ? <Loader2 className="me-1.5 h-4 w-4 animate-spin" /> : null}
						{mode === "create" ? "Create template" : "Save changes"}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
