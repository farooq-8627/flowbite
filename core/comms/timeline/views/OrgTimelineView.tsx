"use client";

import { ActivityIcon } from "lucide-react";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { TimelineFeed } from "@/core/comms/timeline/components/TimelineFeed";
import { TimelineFilters } from "@/core/comms/timeline/components/TimelineFilters";
import type { TimelineFilter } from "@/core/comms/timeline/components/types";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";

export function OrgTimelineView() {
	useCurrentOrg();
	const [filter, setFilter] = useState<TimelineFilter>("all");

	return (
		<div className="flex h-full min-h-0 flex-col">
			{/* Header — icon + filter chips inline */}
			<div className="flex shrink-0 items-center gap-3 border-b bg-background px-4 py-2">
				<ActivityIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
				<TimelineFilters value={filter} onChange={setFilter} />
			</div>

			<div className="min-h-0 flex-1 p-3 xl:p-4">
				<Card className="h-full overflow-hidden p-3 xl:p-4">
					<TimelineFeed
						scope={{ kind: "org" }}
						pageSize={50}
						showComposer={false}
						showFilters={false}
						externalFilter={filter}
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
