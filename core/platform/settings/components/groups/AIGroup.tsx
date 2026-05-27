"use client";

/**
 * AIGroup — Settings → AI.
 *
 * Refactored 2026-05-26 to the tabbed pattern (mirrors `CRMGroup.tsx` and
 * `ModulesGroup`). Previously this group rendered all 7 AI settings
 * sections in one long flow which was hard to navigate; now each tab
 * surfaces ONE concern at a time:
 *
 *   • Identity     — Business Context blob + Memory (org + user)
 *   • Preferences  — default model, briefing toggle, auto-context
 *   • Approvals    — per-user auto-approve toggles for AI tool calls
 *   • Automation   — autonomy toggles + standing orders editor
 *   • API Keys     — BYOK key manager
 *   • Usage        — usage/quota stats + per-tool reliability card
 *
 * Section IDs preserve their historical values (`ai.context`,
 * `ai.memory`, `ai.preferences`, `ai.automation`, `ai.byok`, `ai.usage`)
 * so existing topnav pill highlights, the search index, and any deep-
 * links keep working. The new tab "Approvals" introduces section ID
 * `ai.approvals` for completeness.
 *
 * The active tab is persisted in the URL as `?tab=<slug>` (via `nuqs`).
 * An unknown slug falls back to "identity".
 */

import { useMutation, useQuery } from "convex/react";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { useEffect } from "react";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { useSettingsForm } from "../../hooks/useSettingsForm";
import { SettingsSaveButton } from "../shared/SettingsSaveButton";
import { SettingsSection } from "../shared/SettingsSection";
import { AIApprovalsSection } from "./ai/AIApprovalsSection";
import { AIAutomationSection } from "./ai/AIAutomationSection";
import { AIMemorySection } from "./ai/AIMemorySection";
import { AIPreferencesSection } from "./ai/AIPreferencesSection";
import { AIReliabilityCard } from "./ai/AIReliabilityCard";
import { AIUsageSection } from "./ai/AIUsageSection";
import { ApiKeySection } from "./ai/ApiKeySection";

// ─── Tabs ────────────────────────────────────────────────────────────────

const AI_TABS = ["identity", "preferences", "approvals", "automation", "keys", "usage"] as const;
type AITab = (typeof AI_TABS)[number];

const TAB_LABELS: Record<AITab, string> = {
	identity: "Identity",
	preferences: "Preferences",
	approvals: "Approvals",
	automation: "Automation",
	keys: "API Keys",
	usage: "Usage",
};

/**
 * Map every sub-tab to the canonical settings-section id. Preserves the
 * historical section ids so deep-links + topnav pill highlight + search
 * keywords keep working. The Identity tab maps to the Business Context
 * id (`ai.context`) since that's the headline editor on that tab.
 */
const SECTION_ID_BY_TAB: Record<AITab, string> = {
	identity: "ai.context",
	preferences: "ai.preferences",
	approvals: "ai.approvals",
	automation: "ai.automation",
	keys: "ai.byok",
	usage: "ai.usage",
};

// ─── Business Context (Identity tab headline) ────────────────────────────
//
// Owner-edited static identity blob. Stored on aiPersonaContext
// (org-level row) since 2026-05-24; previously on the now-dropped
// `orgs.aiContext` column.

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

// ─── Tabbed shell ────────────────────────────────────────────────────────

export function AIGroup({ orgId }: { orgId: Id<"orgs"> }) {
	const [tab, setTab] = useQueryState(
		"tab",
		parseAsStringEnum(AI_TABS as unknown as string[]).withDefault("identity"),
	);
	const activeTab: AITab = tab as AITab;

	// Tell the shell which sub-group pill to highlight whenever the tab
	// changes. Same contract `CRMGroup` / `ModulesGroup` use — the shell
	// listens for `shell:section-active` and updates `activeSectionId`.
	useEffect(() => {
		const sectionId = SECTION_ID_BY_TAB[activeTab];
		window.dispatchEvent(new CustomEvent("shell:section-active", { detail: { sectionId } }));
	}, [activeTab]);

	// Listen for shell sub-group pill clicks. When the sidebar dispatches
	// `shell:section-requested` for one of our section ids, switch the
	// active tab so the requested section renders.
	useEffect(() => {
		function onRequested(e: Event) {
			const id = (e as CustomEvent<{ sectionId: string }>).detail?.sectionId;
			if (!id) return;
			// Map section id → tab. Try exact match first, then prefix-based fallback.
			const target = (Object.keys(SECTION_ID_BY_TAB) as AITab[]).find((t) => {
				const sid = SECTION_ID_BY_TAB[t];
				return id === sid || id.startsWith(`${sid}.`);
			});
			if (!target) return;
			if (target !== tab) setTab(target);
		}
		window.addEventListener("shell:section-requested", onRequested as EventListener);
		return () =>
			window.removeEventListener("shell:section-requested", onRequested as EventListener);
	}, [tab, setTab]);

	return (
		<div className="flex flex-col gap-4">
			{/* Thin horizontal sub-tab toolbar — same pattern as CRMGroup. */}
			<div
				role="tablist"
				aria-label="AI settings"
				className="flex w-full items-center gap-0.5 rounded-[var(--radius)] border bg-background p-0.5"
			>
				{AI_TABS.map((t) => {
					const active = activeTab === t;
					return (
						<Button
							key={t}
							role="tab"
							aria-selected={active}
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => setTab(t)}
							className={cn(
								"h-7 flex-1 rounded-[calc(var(--radius)-2px)] px-2 text-xs font-medium",
								active
									? "bg-accent text-accent-foreground"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{TAB_LABELS[t]}
						</Button>
					);
				})}
			</div>

			{/* Active-tab content. The id on the wrapper matches the
			    canonical section id so scroll-to-anchor + the shell's
			    IntersectionObserver land on the right element. */}
			<div
				id={SECTION_ID_BY_TAB[activeTab]}
				className="grid gap-4 scroll-mt-4 rounded-[var(--radius)]"
			>
				{activeTab === "identity" && (
					<>
						<BusinessContextSection orgId={orgId} />
						<AIMemorySection orgId={orgId} />
					</>
				)}
				{activeTab === "preferences" && <AIPreferencesSection />}
				{activeTab === "approvals" && <AIApprovalsSection />}
				{activeTab === "automation" && <AIAutomationSection orgId={orgId} />}
				{activeTab === "keys" && <ApiKeySection orgId={orgId} />}
				{activeTab === "usage" && (
					<>
						<AIUsageSection orgId={orgId} />
						<AIReliabilityCard orgId={orgId} />
					</>
				)}
			</div>
		</div>
	);
}
