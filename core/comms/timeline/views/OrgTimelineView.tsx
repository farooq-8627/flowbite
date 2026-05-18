"use client";

/**
 * OrgTimelineView — org-wide audit feed.
 *
 * Mounts `<TimelineFeed scope={kind:"org"}>` in the standard
 * `EntityPageLayout` chrome (slim toolbar with the page header).
 *
 * Permissions
 *   - `activityLogs.viewOrg` is enforced server-side by the timeline
 *     query (see `convex/crm/shared/timeline/queries.ts`).
 *
 * Composer
 *   - Hidden on this scope. There's no canonical entity to attach
 *     comments to org-wide. (Comments belong on a person/deal/company.)
 */

import { ActivityIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { TimelineFeed } from "@/core/comms/timeline/components/TimelineFeed";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";

export function OrgTimelineView() {
	useCurrentOrg(); // ensure we're inside <OrgProvider>

	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex shrink-0 items-center gap-2 border-b bg-background px-4 py-2.5">
				<ActivityIcon
					className="size-4 text-muted-foreground"
					aria-hidden
				/>
				<h1 className="text-sm font-semibold">Timeline</h1>
				<span className="text-xs text-muted-foreground">
					Workspace-wide activity, notes, and reminders.
				</span>
			</div>

			<div className="min-h-0 flex-1 p-3 xl:p-4">
				<Card className="h-full overflow-hidden p-3 xl:p-4">
					<TimelineFeed
						scope={{ kind: "org" }}
						pageSize={50}
						showComposer={false}
						emptyState={{
							title: "No workspace activity yet",
							body: "When teammates create leads, notes, or follow-ups, they'll show up here.",
						}}
					/>
				</Card>
			</div>
		</div>
	);
}
