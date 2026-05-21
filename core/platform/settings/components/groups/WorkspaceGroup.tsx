"use client";

import type { Id } from "@/convex/_generated/dataModel";
import type { OrgSettings } from "../../types";
import { CodePrefixesSection } from "./workspace/CodePrefixesSection";
import { EntityLabelsSection } from "./workspace/EntityLabelsSection";
import { GeneralSection } from "./workspace/GeneralSection";
import { ModuleVisibilitySection } from "./workspace/ModuleVisibilitySection";
import { WorkspaceTemplateSection } from "./workspace/WorkspaceTemplateSection";

/**
 * WorkspaceGroup — top-level "Workspace" tab in Settings.
 *
 * NOTE (2026-05-22): The org-wide File Policy section was removed. File
 * restrictions are now declared per field at field-creation time (see
 * `fieldDefinitions.allowedFileTypes`) so different fields on the same
 * record can demand different file categories. Storage size is still
 * capped via `org.settings.fileUpload.maxSizeMb` server-side, but the UI
 * knob is gone — admins set it once per template and shouldn't have to
 * fiddle.
 */
export function WorkspaceGroup({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	return (
		<div className="grid gap-6">
			<GeneralSection org={org} orgId={orgId} />
			<WorkspaceTemplateSection org={org} orgId={orgId} />
			<EntityLabelsSection org={org} orgId={orgId} />
			<ModuleVisibilitySection org={org} orgId={orgId} />
			<CodePrefixesSection org={org} orgId={orgId} />
		</div>
	);
}
