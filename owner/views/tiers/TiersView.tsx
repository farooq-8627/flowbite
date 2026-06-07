"use client";

/**
 * Owner-panel tiers view — Stage 4 (full editor incl. marketing copy).
 *
 * **2026-05-27 P0.1.2 + P0.2.E** — extended beyond the Stage-4 v1 scope to
 * include marketing-copy fields (`description`, `features`, `highlight`)
 * and the LemonSqueezy variant ids (`lemonSqueezyVariantIdMonthly`,
 * `lemonSqueezyVariantIdYearly`). Edits to these flow through the
 * `listPublicTiers` query into both the in-app `<PricingCard>` and the
 * marketing `/pricing` page (separate PR track).
 *
 * Each card is its own form (per-section save button — locked decision
 * #5 in `AGENTS.md`). On submit, calls
 * `_platform.tiers.mutations.updateTier` which appends an audit row.
 *
 * Limit values: -1 represents "unlimited" — operators type the magic
 * number; the helper text reminds them. 0 = "feature disabled".
 *
 * Spec: PLATFORM-OWNER-PANEL.md §5 row 3, §10 stage 4.
 */
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import { useSettingsForm } from "@/core/platform/settings/hooks/useSettingsForm";
import { normalizeError } from "@/lib/normalizeError";
import { OwnerSettingsCard } from "../../components/OwnerSettingsCard";

type TierKey = "free" | "starter" | "pro" | "enterprise";

const limitsSchema = z.object({
	maxPipelinesPerEntityType: z.coerce.number().int().min(-1),
	maxDeals: z.coerce.number().int().min(-1),
	maxLeads: z.coerce.number().int().min(-1),
	maxMembers: z.coerce.number().int().min(-1),
	maxCustomFieldsPerEntityType: z.coerce.number().int().min(-1),
	maxStorageBytes: z.coerce.number().int().min(-1),
	aiTokensPerMonth: z.coerce.number().int().min(-1),
	aiMessageCreditsPerMonth: z.coerce.number().int().min(-1),
});

const tierFormSchema = z.object({
	displayName: z.string().trim().min(1, "Required").max(60),
	description: z.string().trim().max(280).optional(),
	features: z.string().trim().optional(),
	highlight: z.boolean(),
	monthlyPriceUSD: z.coerce.number().min(0),
	yearlyPriceUSD: z.coerce.number().min(0),
	trialDays: z.coerce.number().int().min(0).max(365),
	lemonSqueezyVariantIdMonthly: z.string().trim().max(40).optional(),
	lemonSqueezyVariantIdYearly: z.string().trim().max(40).optional(),
	active: z.boolean(),
	limits: limitsSchema,
});

type TierFormValues = z.infer<typeof tierFormSchema>;

export function TiersView() {
	const tiers = useQuery(api._platform.tiers.queries.listTiers, {});

	if (tiers === undefined) {
		return (
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Loader2 className="h-4 w-4 animate-spin" /> Loading tiers…
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			{tiers.map((tier) => (
				<TierCard key={tier.key} tier={tier} />
			))}
		</div>
	);
}

type TierRow = NonNullable<
	ReturnType<typeof useQuery<typeof api._platform.tiers.queries.listTiers>>
>[number];

function TierCard({ tier }: { tier: TierRow }) {
	const updateTier = useMutation(api._platform.tiers.mutations.updateTier);

	const initial = useMemo<TierFormValues>(
		() => ({
			displayName: tier.displayName,
			description: tier.description,
			features: (tier.features ?? []).join("\n"),
			highlight: tier.highlight,
			monthlyPriceUSD: tier.monthlyPriceUSD,
			yearlyPriceUSD: tier.yearlyPriceUSD,
			trialDays: tier.trialDays,
			lemonSqueezyVariantIdMonthly: tier.lemonSqueezyVariantIdMonthly ?? "",
			lemonSqueezyVariantIdYearly: tier.lemonSqueezyVariantIdYearly ?? "",
			active: tier.active,
			limits: { ...tier.limits },
		}),
		[tier],
	);

	const { form, isSubmitting, isDirty, handleSubmit } = useSettingsForm<TierFormValues>({
		schema: tierFormSchema,
		values: initial,
		onSubmit: async (data) => {
			const features = (data.features ?? "")
				.split("\n")
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
			await updateTier({
				key: tier.key as TierKey,
				patch: {
					displayName: data.displayName,
					description: data.description ?? "",
					features,
					highlight: data.highlight,
					monthlyPriceUSD: data.monthlyPriceUSD,
					yearlyPriceUSD: data.yearlyPriceUSD,
					trialDays: data.trialDays,
					lemonSqueezyVariantIdMonthly:
						data.lemonSqueezyVariantIdMonthly?.trim() || undefined,
					lemonSqueezyVariantIdYearly:
						data.lemonSqueezyVariantIdYearly?.trim() || undefined,
					active: data.active,
					limits: data.limits,
				},
			});
		},
	});

	const description = tier.seeded
		? `Last updated ${tier.updatedAt ? new Date(tier.updatedAt).toLocaleString() : "—"}.`
		: "Not yet seeded. First save will create the row.";

	return (
		<OwnerSettingsCard title={`${tier.displayName} (${tier.key})`} description={description}>
			<Form {...form}>
				<form
					onSubmit={async (e) => {
						try {
							await handleSubmit(e);
						} catch (err) {
							toast.error(normalizeError(err, "Failed to save tier"));
						}
					}}
					className="space-y-5"
				>
					<div className="grid gap-4 sm:grid-cols-2">
						<LabelledField
							label="Display name"
							error={form.formState.errors.displayName?.message?.toString()}
						>
							<Input
								{...form.register("displayName")}
								placeholder={tier.displayName}
								autoComplete="off"
							/>
						</LabelledField>
						<LabelledField
							label="Active"
							hint="Disable to remove from billing UI without deleting the row."
						>
							<Switch
								checked={form.watch("active")}
								onCheckedChange={(v) =>
									form.setValue("active", v, {
										shouldDirty: true,
										shouldValidate: true,
									})
								}
							/>
						</LabelledField>
						<LabelledField
							label="Highlight as 'Most popular'"
							hint="Adds an accent ring + badge on the marketing tile."
						>
							<Switch
								checked={form.watch("highlight")}
								onCheckedChange={(v) =>
									form.setValue("highlight", v, {
										shouldDirty: true,
										shouldValidate: true,
									})
								}
							/>
						</LabelledField>
						<LabelledField
							label="Monthly price (USD)"
							error={form.formState.errors.monthlyPriceUSD?.message?.toString()}
						>
							<Input
								type="number"
								min={0}
								step="0.01"
								{...form.register("monthlyPriceUSD")}
							/>
						</LabelledField>
						<LabelledField
							label="Yearly price (USD)"
							error={form.formState.errors.yearlyPriceUSD?.message?.toString()}
						>
							<Input
								type="number"
								min={0}
								step="0.01"
								{...form.register("yearlyPriceUSD")}
							/>
						</LabelledField>
						<LabelledField
							label="Trial days"
							error={form.formState.errors.trialDays?.message?.toString()}
						>
							<Input
								type="number"
								min={0}
								max={365}
								step="1"
								{...form.register("trialDays")}
							/>
						</LabelledField>
					</div>

					<div className="rounded-[var(--radius)] border border-border/60 bg-muted/40 p-4">
						<h3 className="mb-3 text-sm font-semibold">Marketing copy</h3>
						<p className="mb-3 text-xs text-muted-foreground">
							Edits flow to BOTH the in-app billing page and the marketing /pricing
							page (when shipped) via{" "}
							<code className="font-mono">listPublicTiers</code>.
						</p>
						<div className="grid gap-4">
							<LabelledField
								label="Description (one-line tagline)"
								error={form.formState.errors.description?.message?.toString()}
							>
								<Input
									{...form.register("description")}
									placeholder="For solo operators ready to scale beyond the free tier."
								/>
							</LabelledField>
							<LabelledField
								label="Features (one bullet per line)"
								hint="Markdown is NOT rendered, plain text only."
							>
								<Textarea
									rows={6}
									{...form.register("features")}
									placeholder={
										"Up to 5,000 leads & 1,000 deals\n10 team members\n…"
									}
								/>
							</LabelledField>
						</div>
					</div>

					<div className="rounded-[var(--radius)] border border-border/60 bg-muted/40 p-4">
						<h3 className="mb-3 text-sm font-semibold">LemonSqueezy variants</h3>
						<p className="mb-3 text-xs text-muted-foreground">
							Set the variant ids from your LemonSqueezy dashboard. The webhook
							handler reads these back to map an inbound `variant_id` → plan tier.
						</p>
						<div className="grid gap-4 sm:grid-cols-2">
							<LabelledField
								label="Monthly variant id"
								hint="Leave empty if there's no monthly billing for this tier."
							>
								<Input
									{...form.register("lemonSqueezyVariantIdMonthly")}
									placeholder="123456"
									inputMode="numeric"
								/>
							</LabelledField>
							<LabelledField
								label="Yearly variant id"
								hint="Leave empty if there's no yearly billing for this tier."
							>
								<Input
									{...form.register("lemonSqueezyVariantIdYearly")}
									placeholder="123457"
									inputMode="numeric"
								/>
							</LabelledField>
						</div>
					</div>

					<div className="rounded-[var(--radius)] border border-border/60 bg-muted/40 p-4">
						<h3 className="mb-3 text-sm font-semibold">Limits</h3>
						<p className="mb-3 text-xs text-muted-foreground">
							Use <code className="font-mono">-1</code> for unlimited;{" "}
							<code className="font-mono">0</code> for "feature disabled" (e.g. AI on
							free).
						</p>
						<div className="grid gap-4 sm:grid-cols-2">
							<LabelledField label="Max pipelines per entity type">
								<Input
									type="number"
									min={-1}
									step="1"
									{...form.register("limits.maxPipelinesPerEntityType")}
								/>
							</LabelledField>
							<LabelledField label="Max deals per org">
								<Input
									type="number"
									min={-1}
									step="1"
									{...form.register("limits.maxDeals")}
								/>
							</LabelledField>
							<LabelledField label="Max leads per org">
								<Input
									type="number"
									min={-1}
									step="1"
									{...form.register("limits.maxLeads")}
								/>
							</LabelledField>
							<LabelledField label="Max members per org">
								<Input
									type="number"
									min={-1}
									step="1"
									{...form.register("limits.maxMembers")}
								/>
							</LabelledField>
							<LabelledField label="Max custom fields per entity type">
								<Input
									type="number"
									min={-1}
									step="1"
									{...form.register("limits.maxCustomFieldsPerEntityType")}
								/>
							</LabelledField>
							<LabelledField label="Max storage (bytes)">
								<Input
									type="number"
									min={-1}
									step="1"
									{...form.register("limits.maxStorageBytes")}
								/>
							</LabelledField>
							<LabelledField label="AI tokens per month">
								<Input
									type="number"
									min={-1}
									step="1"
									{...form.register("limits.aiTokensPerMonth")}
								/>
							</LabelledField>
							<LabelledField
								label="AI message credits per month"
								hint="One credit = one assistant turn. 0 = not enforced."
							>
								<Input
									type="number"
									min={-1}
									step="1"
									{...form.register("limits.aiMessageCreditsPerMonth")}
								/>
							</LabelledField>
						</div>
					</div>

					<div className="flex justify-end gap-2 pt-1">
						<Button
							type="button"
							variant="outline"
							size="sm"
							disabled={isSubmitting || !isDirty}
							onClick={() => form.reset()}
						>
							Reset
						</Button>
						<Button type="submit" size="sm" disabled={isSubmitting || !isDirty}>
							{isSubmitting ? <Loader2 className="me-2 size-4 animate-spin" /> : null}
							Save tier
						</Button>
					</div>
				</form>
			</Form>
		</OwnerSettingsCard>
	);
}

function LabelledField({
	label,
	hint,
	error,
	children,
}: {
	label: string;
	hint?: string;
	error?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-xs font-medium text-foreground">{label}</span>
			{children}
			{hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
			{error ? <span className="text-[11px] text-destructive">{error}</span> : null}
		</div>
	);
}
