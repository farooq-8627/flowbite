"use client";

import { useMutation } from "convex/react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { normalizeError } from "@/lib/normalizeError";
import type { OrgSettings } from "../../../types";
import { resolveEntityLabels } from "../../../types";
import { SettingsRow } from "../../shared/SettingsRow";
import { SettingsSection } from "../../shared/SettingsSection";

const ENTITY_KEYS = ["lead", "contact", "deal", "company"] as const;
type EntityKey = (typeof ENTITY_KEYS)[number];

function patchModulesForSlot(
	modules: NonNullable<OrgSettings["settings"]>["modules"],
	slot: string,
	hidden: boolean,
): Array<{ slot: string; label?: string; hidden?: boolean; order?: number }> {
	const next = [...(modules ?? [])];
	const idx = next.findIndex((m) => m.slot === slot);
	if (idx === -1) {
		next.push({ slot, hidden });
	} else {
		next[idx] = { ...next[idx], hidden };
	}
	return next;
}

export function ModuleVisibilitySection({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const update = useMutation(api.orgs.mutations.update);
	const labels = resolveEntityLabels(org.entityLabels);
	const modules = org.settings?.modules ?? [];

	const isHidden = (slot: EntityKey) => modules.find((m) => m.slot === slot)?.hidden === true;

	const handleToggle = async (slot: EntityKey, nextVisible: boolean) => {
		const hidden = !nextVisible;
		try {
			await update({
				orgId,
				settings: {
					modules: patchModulesForSlot(modules, slot, hidden),
				},
			});
			toast.success(
				hidden
					? `${labels[slot].plural} hidden from the sidebar`
					: `${labels[slot].plural} visible in the sidebar`,
			);
		} catch (err) {
			toast.error(normalizeError(err, "Failed to update module visibility"));
		}
	};

	return (
		<SettingsSection
			id="workspace.modules"
			title="Module Visibility"
			description="Hide CRM entities you don't use from the sidebar. Data is preserved — toggle back on at any time."
		>
			{ENTITY_KEYS.map((slot) => {
				const hidden = isHidden(slot);
				const current = labels[slot];
				const Icon = hidden ? EyeOff : Eye;
				return (
					<SettingsRow
						key={slot}
						label={
							<span className="inline-flex items-center gap-2">
								<Icon
									className={`size-4 ${hidden ? "text-muted-foreground" : "text-foreground"}`}
									aria-hidden
								/>
								{current.plural}
							</span>
						}
						description={
							hidden
								? `${current.plural} are hidden. Existing records are preserved.`
								: `${current.plural} appear in the sidebar.`
						}
						compact
					>
						<Switch
							checked={!hidden}
							onCheckedChange={(v) => handleToggle(slot, v)}
							aria-label={`Show ${current.plural.toLowerCase()} in sidebar`}
						/>
					</SettingsRow>
				);
			})}
		</SettingsSection>
	);
}
