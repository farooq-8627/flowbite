"use client";

import type { Id } from "@/convex/_generated/dataModel";
import type { OrgSettings } from "../../types";
import { CodePrefixesSection } from "./workspace/CodePrefixesSection";
import { EntityLabelsSection } from "./workspace/EntityLabelsSection";
import { FilePolicySection } from "./workspace/FilePolicySection";
import { GeneralSection } from "./workspace/GeneralSection";
import { ModuleVisibilitySection } from "./workspace/ModuleVisibilitySection";

export function WorkspaceGroup({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	return (
		<div className="grid gap-6">
			<GeneralSection org={org} orgId={orgId} />
			<EntityLabelsSection org={org} orgId={orgId} />
			<ModuleVisibilitySection org={org} orgId={orgId} />
			<CodePrefixesSection org={org} orgId={orgId} />
			<FilePolicySection org={org} orgId={orgId} />
		</div>
	);
}
