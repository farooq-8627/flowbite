"use client";

import type { SettingsGroupId } from "../config/settings-nav";
import { SETTINGS_GROUPS } from "../config/settings-nav";
import type { Id } from "@/convex/_generated/dataModel";

type OrgSettings = {
	_id: Id<"orgs">;
	name: string;
	slug: string;
	plan: string;
	logoStorageId?: Id<"_storage">;
	industry?: string;
	aiContext?: string;
	entityLabels?: unknown;
	settings?: unknown;
};

type Props = {
	activeGroup: SettingsGroupId;
	activeSubGroup: string | null;
	org: OrgSettings;
	orgId: Id<"orgs">;
	permissions: string[];
};

export function SettingsContent({ activeGroup, activeSubGroup, org }: Props) {
	const group = SETTINGS_GROUPS.find((g) => g.id === activeGroup);
	const sub = group?.subGroups.find((s) => s.id === activeSubGroup);

	return (
		<main className="flex-1 overflow-y-auto p-6 bg-sidebar rounded-[var(--radius)]">
			<div className="max-w-2xl space-y-6">
				<div>
					<h1 className="text-2xl font-semibold">{sub?.label ?? group?.label}</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						{sub?.description ?? `Manage ${group?.label?.toLowerCase()} settings`}
					</p>
				</div>

				<div className="rounded-[var(--radius)] border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
					<p className="font-medium">{sub?.label ?? group?.label} settings</p>
					<p className="mt-1 text-xs">Coming soon — building in next phase</p>
				</div>
			</div>
		</main>
	);
}
