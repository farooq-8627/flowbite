"use client";

/**
 * Owner-panel tiers view (Stage 4 — real editor).
 *
 * One editable card per plan tier (free/starter/pro/enterprise). Each card
 * is its own form (per-section save button — locked decision #5 in
 * `AGENTS.md`). On submit, calls `_platform.tiers.mutations.updateTier`
 * which appends an audit row.
 *
 * Limit values: -1 represents "unlimited" — we surface this as a
 * "Unlimited" badge + checkbox so operators don't need to type the magic
 * number. 0 represents "feature disabled" (e.g. AI on free tier).
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
import { api } from "@/convex/_generated/api";
import { useSettingsForm } from "@/core/platform/settings/hooks/useSettingsForm";
import { normalizeError } from "@/lib/normalizeError";
import { OwnerSettingsCard } from "../../components/OwnerSettingsCard";

type TierKey = "free" | "starter" | "pro" | "enterprise";

const limitsSchema = z.object({
	maxPipelinesPerEntityType: z.coerce.number().int().min(-1),
	maxDeals: z.coerce.number().int().min(-1),
	maxMembers: z.coerce.number().int().min(-1),
	maxCustomFieldsPerEntityType: z.coerce.number().int().min(-1),
	maxStorageBytes: z.coerce.number().int().min(-1),
	aiTokensPerMonth: z.coerce.number().int().min(-1),
});

const tierFormSchema = z.object({
	displayName: z.string().trim().min(1, "Required").max(60),
	monthlyPriceUSD: z.coerce.number().min(0),
	yearlyPriceUSD: z.coerce.number().min(0),
	trialDays: z.coerce.number().int().min(0).max(365),
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
			monthlyPriceUSD: tier.monthlyPriceUSD,
			yearlyPriceUSD: tier.yearlyPriceUSD,
			trialDays: tier.trialDays,
			active: tier.active,
			limits: { ...tier.limits },
		}),
		[tier],
	);

	const { form, isSubmitting, isDirty, handleSubmit } = useSettingsForm<TierFormValues>({
		schema: tierFormSchema,
		values: initial,
		onSubmit: async (data) => {
			await updateTier({
				key: tier.key as TierKey,
				patch: {
					displayName: data.displayName,
					monthlyPriceUSD: data.monthlyPriceUSD,
					yearlyPriceUSD: data.yearlyPriceUSD,
					trialDays: data.trialDays,
					active: data.active,
					limits: data.limits,
				},
			});
		},
	});

	const description = tier.seeded
		? `Last updated ${tier.updatedAt ? new Date(tier.updatedAt).toLocaleString() : "—"}.`
		: "Not yet seeded — first save will create the row.";

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
