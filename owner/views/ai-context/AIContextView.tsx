"use client";

/**
 * Owner-panel AI Context view (Stage 6 — real implementation).
 *
 * Edit `platformContext.main` — the row injected into Layer 1 of every
 * AI system prompt. Plain textareas for content + rules; each save
 * appends a `platformAuditLogs` row with a full before/after diff so
 * regressions are easy to roll back manually.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §5 row 6, §10 stage 6.
 */
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { normalizeError } from "@/lib/normalizeError";
import { OwnerSettingsCard } from "../../components/OwnerSettingsCard";

export function AIContextView() {
	const ctx = useQuery(api._platform.platformContext.queries.getMain, {});
	const update = useMutation(api._platform.platformContext.mutations.update);

	const versionId = useId();
	const contentId = useId();
	const rulesId = useId();

	const [version, setVersion] = useState("");
	const [content, setContent] = useState("");
	const [rulesText, setRulesText] = useState("");
	const [busy, setBusy] = useState(false);
	const [hydrated, setHydrated] = useState(false);

	// Hydrate the form when the query first lands. Subsequent updates
	// from the server don't clobber in-progress edits.
	useEffect(() => {
		if (ctx === undefined) return;
		if (hydrated) return;
		if (ctx) {
			setVersion(ctx.version);
			setContent(ctx.content);
			setRulesText((ctx.rules ?? []).join("\n"));
		} else {
			setVersion("v1.0.0");
			setContent("");
			setRulesText("");
		}
		setHydrated(true);
	}, [ctx, hydrated]);

	if (ctx === undefined) {
		return (
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Loader2 className="h-4 w-4 animate-spin" /> Loading platform context…
			</div>
		);
	}

	const dirty =
		ctx === null
			? content.length > 0 || rulesText.length > 0 || version.length > 0
			: ctx.version !== version ||
				ctx.content !== content ||
				(ctx.rules ?? []).join("\n") !== rulesText;

	return (
		<OwnerSettingsCard
			title="Platform AI context"
			description={
				ctx
					? `Currently at ${ctx.version} · last updated ${new Date(ctx.updatedAt).toLocaleString()}.`
					: "No row yet. First save will create it."
			}
		>
			<form
				onSubmit={async (e) => {
					e.preventDefault();
					setBusy(true);
					try {
						const rules = rulesText
							.split("\n")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await update({
							content,
							rules: rules.length > 0 ? rules : undefined,
							version: version.trim() || undefined,
						});
						toast.success("Platform context saved");
					} catch (err) {
						toast.error(normalizeError(err, "Failed to save context"));
					} finally {
						setBusy(false);
					}
				}}
				className="space-y-4"
			>
				<div className="flex flex-col gap-1">
					<Label htmlFor={versionId} className="text-xs font-medium">
						Version label
					</Label>
					<Input
						id={versionId}
						value={version}
						onChange={(e) => setVersion(e.target.value)}
						placeholder="v1.2.0"
						className="font-mono"
						autoComplete="off"
					/>
					<span className="text-[11px] font-normal text-muted-foreground">
						Free-form. Leave blank to auto-generate a timestamp string on save.
					</span>
				</div>

				<div className="flex flex-col gap-1">
					<Label htmlFor={contentId} className="text-xs font-medium">
						System prompt content (markdown)
					</Label>
					<Textarea
						id={contentId}
						rows={18}
						value={content}
						onChange={(e) => setContent(e.target.value)}
						className="font-mono text-xs"
						placeholder="# YourApp: AI Assistant Context"
					/>
				</div>

				<div className="flex flex-col gap-1">
					<Label htmlFor={rulesId} className="text-xs font-medium">
						Rules (one per line)
					</Label>
					<Textarea
						id={rulesId}
						rows={6}
						value={rulesText}
						onChange={(e) => setRulesText(e.target.value)}
						placeholder={"Respond in the user's language.\nNever access another org."}
						className="text-sm"
					/>
					<span className="text-[11px] font-normal text-muted-foreground">
						These become the `rules` array — explicit dos and don'ts repeated to the
						model in addition to the markdown content.
					</span>
				</div>

				<div className="flex justify-end gap-2 pt-1">
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={busy || !dirty || !ctx}
						onClick={() => {
							if (!ctx) {
								setVersion("v1.0.0");
								setContent("");
								setRulesText("");
							} else {
								setVersion(ctx.version);
								setContent(ctx.content);
								setRulesText((ctx.rules ?? []).join("\n"));
							}
						}}
					>
						Reset
					</Button>
					<Button type="submit" size="sm" disabled={busy || !dirty}>
						{busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
						Save context
					</Button>
				</div>
			</form>
		</OwnerSettingsCard>
	);
}
