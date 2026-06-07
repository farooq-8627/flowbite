"use client";

/**
 * core/platform/settings/components/groups/ai/AIFeaturesSection.tsx
 *
 * B.42 follow-up (2026-06-05). Mirrors the `ModuleVisibilitySection`
 * pattern for the two AI surfaces that ship in the sidebar today
 * (`AI → Audit feed`, `AI → Next actions`). Toggling a row OFF writes
 * `org.settings.aiFeatures.<key> = false`; the sidebar reads the slot
 * and hides the entry. Permission gates (`ai.audit.view`,
 * `ai.trace.view`) still apply on top, and the server-side queries at
 * `convex/ai/queries/auditFeed.ts:listAuditFeed` etc. are the source
 * of truth — flipping a flag never grants access, only removes the
 * navigation surface.
 *
 * Sub-tab home: Settings → AI → Preferences (least-surprising place
 * for "what AI surfaces are visible to my team").
 */
import { useMutation } from "convex/react";
import { Eye, EyeOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentOrg, useOrgPermissions } from "@/core/shell/shared/hooks/useCurrentOrg";
import { toast } from "@/lib/toast";
import { SettingsRow } from "../../shared/SettingsRow";
import { SettingsSection } from "../../shared/SettingsSection";

type FeatureKey = "auditFeed" | "nextActions";

const FEATURES: Array<{
	key: FeatureKey;
	label: string;
	description: string;
}> = [
	{
		key: "auditFeed",
		label: "AI Audit feed",
		description:
			"Org-wide chronological feed of every AI capability call. Owners + Admins only by default (`ai.audit.view`).",
	},
	{
		key: "nextActions",
		label: "AI Next actions",
		description: "Proactive list of suggested follow-ups. Member-eligible (`ai.trace.view`).",
	},
];

export function AIFeaturesSection({ orgId }: { orgId: Id<"orgs"> }) {
	const { fullOrgEntry } = useCurrentOrg();
	const permissions = useOrgPermissions();
	const canEdit = permissions.includes("org.editSettings");

	const update = useMutation(api.orgs.mutations.update);
	const flags = fullOrgEntry?.org.settings?.aiFeatures ?? {};

	async function toggle(key: FeatureKey, nextVisible: boolean) {
		try {
			await update({
				orgId,
				settings: {
					aiFeatures: { [key]: nextVisible },
				},
			});
			toast.success(
				nextVisible
					? `${FEATURES.find((f) => f.key === key)?.label} visible in the sidebar`
					: `${FEATURES.find((f) => f.key === key)?.label} hidden from the sidebar`,
			);
		} catch (err) {
			toast.mutationError(err, "Couldn't update AI feature visibility.");
		}
	}

	return (
		<SettingsSection
			id="ai.features"
			title="AI sidebar features"
			description="Hide AI observability surfaces you don't use from the sidebar. Permission gates still apply. Flipping a switch off never grants access, it only removes the nav entry."
		>
			{FEATURES.map((f) => {
				// `aiFeatures.<key> !== false` matches the sidebar's resolution rule —
				// undefined is treated as "visible" so existing workspaces stay
				// untouched.
				const visible = flags[f.key] !== false;
				const Icon = visible ? Eye : EyeOff;
				return (
					<SettingsRow
						key={f.key}
						label={
							<span className="inline-flex items-center gap-2">
								<Icon
									className={`size-4 ${visible ? "text-foreground" : "text-muted-foreground"}`}
									aria-hidden
								/>
								{f.label}
							</span>
						}
						description={f.description}
						compact
					>
						<Switch
							checked={visible}
							disabled={!canEdit}
							onCheckedChange={(v) => toggle(f.key, v)}
							aria-label={`Show ${f.label.toLowerCase()} in sidebar`}
						/>
					</SettingsRow>
				);
			})}
		</SettingsSection>
	);
}
