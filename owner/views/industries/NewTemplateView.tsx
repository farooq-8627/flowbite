"use client";

/**
 * Owner-panel "create new industry template" wizard (Stage 3 of
 * INDUSTRY-TEMPLATES-DB-MIGRATION.md).
 *
 * Two modes:
 *   1. **Clone from existing** — copies the source row's `definition`
 *      blob via `JSON.parse(JSON.stringify(...))` into a new
 *      `platformTemplates` row. Backed by
 *      `_platform.industries.mutations.cloneTemplate`.
 *   2. **Start from scratch** — creates a minimal-but-valid row with
 *      `definition: {}`. Backed by
 *      `_platform.industries.mutations.createTemplate`.
 *
 * Identity fields (templateKey, label, description, group, icon) are
 * collected up front. After save, the wizard routes the operator to the
 * full `TemplateEditorView` to flesh out the rest of the slots.
 *
 * UX rules:
 *   - The `templateKey` is slug-validated client-side (lowercase, hyphens)
 *     so the operator sees errors before submitting. The server re-checks
 *     uniqueness, format, and cross-category collisions — defence in
 *     depth.
 *   - When clone-mode is chosen with no source picked, the submit button
 *     stays disabled.
 *   - On save success the page redirects to `/<slug>/industries/<key>`
 *     (the editor view) where the operator can adjust pipelines, fields,
 *     etc. This makes "click + fill form to add a new built-in" the
 *     full workflow per the spec §1.1 row 6.
 *
 * Spec: §5.3 NewTemplateView, §8.4 acceptance, §8.5 deliverable.
 */

import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, Building2, Copy, FilePlus, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { normalizeError } from "@/lib/normalizeError";
import { OwnerSettingsCard } from "../../components/OwnerSettingsCard";
import { useOwnerPublicPrefix } from "../../hooks/useOwnerPublicPrefix";

type WizardMode = "clone" | "empty";

const SLUG_REGEX = /^[a-z][a-z0-9-]*$/;

function normaliseKey(input: string): string {
	return input
		.toLowerCase()
		.replace(/[^a-z0-9-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.replace(/-{2,}/g, "-")
		.slice(0, 48);
}

export function NewTemplateView({ initialSourceKey }: { initialSourceKey?: string }) {
	const router = useRouter();
	const prefix = useOwnerPublicPrefix() ?? "";
	const labelId = useId();
	const keyId = useId();
	const descId = useId();
	const iconId = useId();
	const groupId = useId();

	const groups = useQuery(api._platform.industries.queries.listGroupsForAdmin, {});
	const templates = useQuery(api._platform.industries.queries.listAllForAdmin, {});

	const cloneTemplate = useMutation(api._platform.industries.mutations.cloneTemplate);
	const createTemplate = useMutation(api._platform.industries.mutations.createTemplate);

	const [mode, setMode] = useState<WizardMode>(initialSourceKey ? "clone" : "clone");
	const [sourceKey, setSourceKey] = useState<string>(initialSourceKey ?? "");
	const [templateKey, setTemplateKey] = useState<string>("");
	const [label, setLabel] = useState<string>("");
	const [description, setDescription] = useState<string>("");
	const [icon, setIcon] = useState<string>("");
	const [groupKey, setGroupKey] = useState<string>("");
	const [busy, setBusy] = useState(false);
	const [keyEdited, setKeyEdited] = useState(false);

	// When the operator picks a clone source, prefill identity fields.
	const sourceTemplate = useMemo(
		() => (templates ?? []).find((t) => t.templateKey === sourceKey),
		[templates, sourceKey],
	);

	const handlePickSource = (key: string) => {
		setSourceKey(key);
		const src = (templates ?? []).find((t) => t.templateKey === key);
		if (!src) return;
		// Prefill suggested values, only if the operator hasn't already
		// typed something — avoids stomping in-progress edits.
		if (!label) setLabel(`${src.label} (copy)`);
		if (!description) setDescription(src.description);
		if (!icon && src.icon) setIcon(src.icon);
		if (!groupKey) setGroupKey(src.groupKey);
		if (!keyEdited && !templateKey) {
			setTemplateKey(`${src.templateKey}-copy`);
		}
	};

	if (groups === undefined || templates === undefined) {
		return (
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Loader2 className="h-4 w-4 animate-spin" /> Loading…
			</div>
		);
	}

	const keyTrimmed = templateKey.trim();
	const keyValid = keyTrimmed.length >= 2 && SLUG_REGEX.test(keyTrimmed);
	const keyClash = (templates ?? []).some((t) => t.templateKey === keyTrimmed);
	const labelValid = label.trim().length > 0;
	const groupValid = mode === "empty" ? groupKey.length > 0 : true;
	const cloneSourceValid = mode === "clone" ? sourceKey.length > 0 : true;
	const descriptionValid = mode === "empty" ? description.trim().length > 0 : true;
	const formValid =
		keyValid && !keyClash && labelValid && groupValid && cloneSourceValid && descriptionValid;

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!formValid) return;
		setBusy(true);
		try {
			if (mode === "clone") {
				const result = await cloneTemplate({
					sourceTemplateKey: sourceKey,
					newTemplateKey: keyTrimmed,
					newGroupKey: groupKey || undefined,
					newLabel: label.trim() || undefined,
					newDescription: description.trim() || undefined,
					newIcon: icon.trim() || undefined,
				});
				toast.success(`Template "${result.templateKey}" created`);
				router.push(`${prefix}/industries/${encodeURIComponent(result.templateKey)}`);
			} else {
				const result = await createTemplate({
					templateKey: keyTrimmed,
					groupKey,
					label: label.trim(),
					description: description.trim(),
					icon: icon.trim() || undefined,
					definition: {},
				});
				toast.success(`Template "${result.templateKey}" created`);
				router.push(`${prefix}/industries/${encodeURIComponent(result.templateKey)}`);
			}
		} catch (err) {
			toast.error(normalizeError(err, "Failed to create template"));
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="flex max-w-3xl flex-col gap-4">
			<div className="flex items-center justify-between">
				<Link
					href={`${prefix}/industries`}
					className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
				>
					<ArrowLeft className="h-3.5 w-3.5" /> All industries
				</Link>
			</div>

			<OwnerSettingsCard
				title="New industry template"
				description="Pick a starting point. Cloning copies the source template's pipelines, fields, AI persona, and mock data into a new editable row. Starting from scratch lands you in the editor with empty slots. You'll fill them in tab-by-tab."
			>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<button
						type="button"
						onClick={() => setMode("clone")}
						className={
							mode === "clone"
								? "flex items-start gap-3 rounded-[var(--radius)] border border-primary bg-primary/5 p-4 text-start transition-colors"
								: "flex items-start gap-3 rounded-[var(--radius)] border border-border bg-background p-4 text-start transition-colors hover:bg-muted"
						}
					>
						<Copy className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
						<div className="flex flex-col gap-1">
							<span className="text-sm font-semibold">Clone existing</span>
							<span className="text-xs text-muted-foreground">
								Copy every slot (pipelines, fields, mock data, AI persona) from a
								built-in or custom template into a new row. Fastest path.
							</span>
						</div>
					</button>
					<button
						type="button"
						onClick={() => setMode("empty")}
						className={
							mode === "empty"
								? "flex items-start gap-3 rounded-[var(--radius)] border border-primary bg-primary/5 p-4 text-start transition-colors"
								: "flex items-start gap-3 rounded-[var(--radius)] border border-border bg-background p-4 text-start transition-colors hover:bg-muted"
						}
					>
						<FilePlus className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
						<div className="flex flex-col gap-1">
							<span className="text-sm font-semibold">Start from scratch</span>
							<span className="text-xs text-muted-foreground">
								Create an empty template. You'll fill in pipelines, fields, modules,
								etc. tab-by-tab in the editor.
							</span>
						</div>
					</button>
				</div>
			</OwnerSettingsCard>

			<form onSubmit={handleSubmit} className="flex flex-col gap-4">
				{mode === "clone" ? (
					<OwnerSettingsCard
						title="Source template"
						description="Pick the row whose definition you want to copy. Identity fields below auto-fill from the chosen source. Feel free to override."
					>
						{templates.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								No templates exist yet. Switch to "Start from scratch" instead.
							</p>
						) : (
							<ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
								{templates
									.filter((t) => !t.isArchived)
									.map((t) => {
										const isSelected = sourceKey === t.templateKey;
										return (
											<li key={t._id}>
												<button
													type="button"
													onClick={() => handlePickSource(t.templateKey)}
													className={
														isSelected
															? "flex w-full items-start gap-3 rounded-[var(--radius)] border border-primary bg-primary/10 p-3 text-start transition-colors"
															: "flex w-full items-start gap-3 rounded-[var(--radius)] border border-border bg-background p-3 text-start transition-colors hover:bg-muted"
													}
												>
													<span className="mt-0.5 flex-shrink-0 text-base">
														{t.icon ?? (
															<Building2 className="h-4 w-4" />
														)}
													</span>
													<div className="min-w-0 flex-1">
														<p className="truncate text-sm font-medium">
															{t.label}
															{t.isBuiltIn ? (
																<span className="ms-2 rounded-[var(--radius)] bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-700 dark:text-amber-400">
																	built-in
																</span>
															) : null}
														</p>
														<p className="truncate font-mono text-[11px] text-muted-foreground">
															{t.templateKey} · in {t.groupKey}
														</p>
														<p className="line-clamp-2 mt-1 text-[11px] leading-snug text-muted-foreground">
															{t.description}
														</p>
													</div>
												</button>
											</li>
										);
									})}
							</ul>
						)}
					</OwnerSettingsCard>
				) : null}

				<OwnerSettingsCard
					title="Identity"
					description="The templateKey is the stable id stored in `org.industry`. It cannot be renamed later. Choose carefully. Hyphens and lowercase only."
				>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="flex flex-col gap-1.5 sm:col-span-2">
							<Label htmlFor={keyId} className="text-xs font-medium">
								templateKey
							</Label>
							<Input
								id={keyId}
								value={templateKey}
								onChange={(e) => {
									setTemplateKey(normaliseKey(e.target.value));
									setKeyEdited(true);
								}}
								placeholder="real-estate-luxury"
								className="font-mono"
								autoComplete="off"
								spellCheck={false}
							/>
							{keyClash ? (
								<span className="text-[11px] text-destructive">
									This key is already taken. Choose another.
								</span>
							) : keyTrimmed.length > 0 && !keyValid ? (
								<span className="text-[11px] text-destructive">
									Lowercase letters, numbers, and hyphens only. Cannot start with
									a digit or hyphen.
								</span>
							) : (
								<span className="text-[11px] text-muted-foreground">
									Stable id. Used in URLs, audit logs, and `org.industry`. Cannot
									be renamed after save.
								</span>
							)}
						</div>

						<div className="flex flex-col gap-1.5">
							<Label htmlFor={labelId} className="text-xs font-medium">
								Display label
							</Label>
							<Input
								id={labelId}
								value={label}
								onChange={(e) => setLabel(e.target.value)}
								placeholder="Real Estate (Luxury)"
								autoComplete="off"
							/>
						</div>

						<div className="flex flex-col gap-1.5">
							<Label htmlFor={iconId} className="text-xs font-medium">
								Icon (optional)
							</Label>
							<Input
								id={iconId}
								value={icon}
								onChange={(e) => setIcon(e.target.value)}
								placeholder="🏠"
								maxLength={8}
								autoComplete="off"
							/>
						</div>

						<div className="flex flex-col gap-1.5 sm:col-span-2">
							<Label htmlFor={groupId} className="text-xs font-medium">
								Industry group
							</Label>
							<select
								id={groupId}
								value={groupKey}
								onChange={(e) => setGroupKey(e.target.value)}
								className="h-9 rounded-[var(--radius)] border border-input bg-background px-3 text-sm outline-none focus:border-ring"
							>
								<option value="">select group</option>
								{groups.map((g) => (
									<option key={g.groupKey} value={g.groupKey}>
										{g.label} ({g.groupKey})
									</option>
								))}
							</select>
							{mode === "clone" && sourceTemplate ? (
								<span className="text-[11px] text-muted-foreground">
									Defaults to source's group ({sourceTemplate.groupKey}). Pick a
									different one to move the clone.
								</span>
							) : (
								<span className="text-[11px] text-muted-foreground">
									Determines step 1 of the onboarding picker the new template
									appears under.
								</span>
							)}
						</div>

						<div className="flex flex-col gap-1.5 sm:col-span-2">
							<Label htmlFor={descId} className="text-xs font-medium">
								Description
							</Label>
							<Textarea
								id={descId}
								rows={3}
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="One-sentence summary surfaced on the onboarding card."
							/>
							<span className="text-[11px] text-muted-foreground">
								Shown on the onboarding picker beneath the label.
							</span>
						</div>
					</div>
				</OwnerSettingsCard>

				{mode === "empty" ? (
					<Alert className="border-amber-500/40 bg-amber-500/10 text-foreground">
						<AlertDescription className="text-xs leading-relaxed">
							Empty templates have no pipelines, fields, or mock data. Onboardings
							that pick this template land on a sparse workspace. After saving, you'll
							be redirected to the editor — fill in slots tab-by-tab before making it
							visible to onboardings.
						</AlertDescription>
					</Alert>
				) : null}

				<div className="flex justify-end gap-2">
					<Button asChild type="button" variant="outline" size="sm">
						<Link href={`${prefix}/industries`}>Cancel</Link>
					</Button>
					<Button type="submit" size="sm" disabled={!formValid || busy}>
						{busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
						{mode === "clone" ? "Clone & open editor" : "Create & open editor"}
					</Button>
				</div>
			</form>
		</div>
	);
}
