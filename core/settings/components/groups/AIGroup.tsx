"use client";

import { useMutation } from "convex/react";
import { z } from "zod/v4";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { OrgSettings } from "../../types";
import { useSettingsForm } from "../../hooks/useSettingsForm";
import { SettingsSection } from "../shared/SettingsSection";
import { SettingsRow } from "../shared/SettingsRow";
import { SettingsSaveButton } from "../shared/SettingsSaveButton";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

// ────────────────────────────────────────────────────────────────────────────
// Business Context
// ────────────────────────────────────────────────────────────────────────────

const AI_CONTEXT_MAX = 10_000;

const aiContextSchema = z.object({
	aiContext: z.string().max(AI_CONTEXT_MAX, `Max ${AI_CONTEXT_MAX.toLocaleString()} characters`),
});

function BusinessContextSection({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const update = useMutation(api.orgs.mutations.update);
	const { form, isSubmitting, isDirty, handleSubmit } = useSettingsForm({
		schema: aiContextSchema,
		values: { aiContext: org.aiContext ?? "" },
		onSubmit: async (data) => {
			await update({ orgId, aiContext: data.aiContext });
		},
	});

	const value = form.watch("aiContext") ?? "";
	const count = value.length;
	const percent = (count / AI_CONTEXT_MAX) * 100;

	return (
		<SettingsSection
			id="ai.context"
			title="Business Context"
			description="Describe your business so the AI assistant can give accurate answers. Include industry, products, customer types, sales process, and anything else the AI should know."
		>
			<Form {...form}>
				<form onSubmit={handleSubmit}>
					<FormField
						control={form.control}
						name="aiContext"
						render={({ field }) => (
							<FormItem className="py-4">
								<FormControl>
									<Textarea
										rows={10}
										maxLength={AI_CONTEXT_MAX}
										placeholder="We are a B2B SaaS company selling CRM software to mid-market retailers in the GCC. Our typical customer has 50-500 employees and needs…"
										className="resize-y"
										{...field}
									/>
								</FormControl>
								<div className="flex items-center justify-between text-xs text-muted-foreground">
									<FormMessage />
									<span
										className={
											percent >= 95
												? "text-destructive font-medium"
												: percent >= 80
													? "text-amber-600 dark:text-amber-400"
													: ""
										}
									>
										{count.toLocaleString()} / {AI_CONTEXT_MAX.toLocaleString()}
									</span>
								</div>
							</FormItem>
						)}
					/>
					<SettingsSaveButton
						isSubmitting={isSubmitting}
						isDirty={isDirty}
						onReset={() => form.reset()}
					/>
				</form>
			</Form>
		</SettingsSection>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Usage (read-only, placeholder pending real usage backend)
// ────────────────────────────────────────────────────────────────────────────

function UsageSection({ org }: { org: OrgSettings }) {
	// Plan-based limits — mirror the logic you'd use in billing.
	const planLimits: Record<string, number> = {
		free: 100,
		starter: 500,
		pro: 2_000,
		business: 10_000,
	};
	const limit = planLimits[org.plan] ?? 500;
	// NOTE: Replace with real usage query when AI usage tracking ships.
	const used = 0;
	const percent = (used / limit) * 100;

	return (
		<SettingsSection
			id="ai.usage"
			title="AI Usage"
			description="AI messages consumed this billing period."
			action={
				<Badge variant="secondary" className="capitalize">
					{org.plan} plan
				</Badge>
			}
		>
			<SettingsRow
				label="Messages this month"
				description="Resets at the start of each billing cycle."
			>
				<div className="flex flex-col gap-1.5">
					<div className="flex items-center justify-end gap-2">
						<span className="text-sm font-medium tabular-nums">
							{used.toLocaleString()}
						</span>
						<span className="text-sm text-muted-foreground">
							/ {limit.toLocaleString()}
						</span>
					</div>
					<Progress value={percent} className="w-full" />
				</div>
			</SettingsRow>
		</SettingsSection>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Export
// ────────────────────────────────────────────────────────────────────────────

export function AIGroup({
	org,
	orgId,
}: { org: OrgSettings; orgId: Id<"orgs"> }) {
	return (
		<div className="grid gap-6">
			<BusinessContextSection org={org} orgId={orgId} />
			<UsageSection org={org} />
		</div>
	);
}
