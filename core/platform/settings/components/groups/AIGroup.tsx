"use client";

import { useMutation, useQuery } from "convex/react";
import { z } from "zod/v4";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSettingsForm } from "../../hooks/useSettingsForm";
import { SettingsSaveButton } from "../shared/SettingsSaveButton";
import { SettingsSection } from "../shared/SettingsSection";
import { AIMemorySection } from "./ai/AIMemorySection";
import { AIPreferencesSection } from "./ai/AIPreferencesSection";
import { AIReliabilityCard } from "./ai/AIReliabilityCard";
import { AIUsageSection } from "./ai/AIUsageSection";
import { ApiKeySection } from "./ai/ApiKeySection";

// ────────────────────────────────────────────────────────────────────────────
// Business Context — owner-edited static identity blob.
// Stored on aiPersonaContext (org-level row) since 2026-05-24; previously
// on the now-dropped `orgs.aiContext` column.
// ────────────────────────────────────────────────────────────────────────────

const AI_CONTEXT_MAX = 10_000;

const aiContextSchema = z.object({
	identity: z.string().max(AI_CONTEXT_MAX, `Max ${AI_CONTEXT_MAX.toLocaleString()} characters`),
});

function BusinessContextSection({ orgId }: { orgId: Id<"orgs"> }) {
	const data = useQuery(api.ai.personaContext.getOrgIdentity, { orgId });
	const setIdentity = useMutation(api.ai.personaContext.setOrgIdentity);
	const { form, isSubmitting, isDirty, handleSubmit } = useSettingsForm({
		schema: aiContextSchema,
		values: { identity: data?.identity ?? "" },
		onSubmit: async (formData) => {
			await setIdentity({ orgId, identity: formData.identity });
		},
	});

	const value = form.watch("identity") ?? "";
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
						name="identity"
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
// Export
// ────────────────────────────────────────────────────────────────────────────

export function AIGroup({ orgId }: { orgId: Id<"orgs"> }) {
	return (
		<div className="grid gap-6">
			<BusinessContextSection orgId={orgId} />
			<AIMemorySection orgId={orgId} />
			<AIPreferencesSection />
			<ApiKeySection orgId={orgId} />
			<AIUsageSection orgId={orgId} />
			<AIReliabilityCard orgId={orgId} />
		</div>
	);
}
