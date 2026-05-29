"use client";

/**
 * core/shell/shell/views/dashboard/cards/AIPinnedRow.tsx
 *
 * Stage 5 of /DASHBOARD-V2-PLAN.md (2026-05-29). The AI-Pinned row
 * sits above the regular dashboard layout and renders any
 * `ephemeralDashboardCells` rows the AI tool `render_widget` has
 * pinned for the current user (24h TTL).
 *
 * Each pinned cell has:
 *   - The widget content (delegated to the same render-callback used
 *     by the regular layout — see `DashboardLayoutRenderer`).
 *   - A "Pin to my dashboard" button (writes to the user's
 *     `dashboardLayoutOverride.layout` via promoteToLayout, which
 *     deletes the ephemeral cell in the same edit).
 *   - A Dismiss × button (hard-deletes the row).
 *
 * RTL-safe: uses `me-*`, `ms-*`, `start-*`, `end-*`. Border radius
 * via `var(--radius)`. App strings via `APP_CONFIG`.
 *
 * The component is silent when there are no cells (returns null) so
 * it never adds vertical space on a clean dashboard.
 */

import { useMutation, useQuery } from "convex/react";
import { Pin, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { WIDGETS, type WidgetKey } from "@/convex/_shared/widgetRegistry";

interface AIPinnedRowProps {
	orgId: Id<"orgs">;
	orgSlug: string;
	/**
	 * Render callback delegated to the parent (`DashboardHomeView` /
	 * `DashboardLayoutRenderer`). Lets us reuse the exact same widget
	 * dispatch table the canonical layout uses — pinned cells render
	 * identically to permanent panels.
	 */
	renderWidget: (key: WidgetKey) => React.ReactNode;
}

export function AIPinnedRow({ orgId, orgSlug: _orgSlug, renderWidget }: AIPinnedRowProps) {
	const cells = useQuery(api.dashboard.ephemeralCells.queries.listForUser, { orgId });
	const dismiss = useMutation(api.dashboard.ephemeralCells.mutations.dismiss);
	const promote = useMutation(api.dashboard.ephemeralCells.mutations.promoteToLayout);

	if (!cells || cells.length === 0) return null;

	return (
		<div className="grid gap-3">
			<div className="flex items-center gap-2">
				<Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
				<h2 className="text-sm font-semibold tracking-tight">Pinned by AI</h2>
				<Badge variant="secondary" className="text-[10px]">
					Visible only to you · 24h
				</Badge>
			</div>
			<div className="grid gap-4 lg:grid-cols-2">
				{cells.map((cell) => (
					<AIPinnedCellShell
						key={cell._id}
						cell={cell}
						orgId={orgId}
						onDismiss={async () => {
							await dismiss({ orgId, cellRowId: cell._id });
						}}
						onPromote={async () => {
							await promote({
								orgId,
								cellRowId: cell._id,
								span: 2,
							});
						}}
						renderWidget={renderWidget}
					/>
				))}
			</div>
		</div>
	);
}

// ─── Inner cell shell ────────────────────────────────────────────────────────

interface AIPinnedCellShellProps {
	cell: Doc<"ephemeralDashboardCells">;
	orgId: Id<"orgs">;
	onDismiss: () => Promise<void>;
	onPromote: () => Promise<void>;
	renderWidget: (key: WidgetKey) => React.ReactNode;
}

function AIPinnedCellShell({ cell, onDismiss, onPromote, renderWidget }: AIPinnedCellShellProps) {
	const widgetKey = cell.widgetKey as WidgetKey;
	const meta = WIDGETS[widgetKey];
	const headline = cell.title ?? meta?.label ?? widgetKey;
	const node = renderWidget(widgetKey);

	return (
		<Card className="rounded-[var(--radius)] border-dashed border-primary/40">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<div className="flex items-center gap-2 min-w-0">
					<Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
					<CardTitle className="text-sm font-medium truncate" title={headline}>
						{headline}
					</CardTitle>
				</div>
				<div className="flex items-center gap-1 ms-auto">
					<Button
						type="button"
						size="sm"
						variant="ghost"
						className="h-7 px-2 text-xs"
						onClick={() => {
							void onPromote();
						}}
						aria-label="Pin to my dashboard"
					>
						<Pin className="h-3.5 w-3.5 me-1" aria-hidden="true" />
						<span>Pin</span>
					</Button>
					<Button
						type="button"
						size="icon"
						variant="ghost"
						className="h-7 w-7"
						onClick={() => {
							void onDismiss();
						}}
						aria-label="Dismiss"
					>
						<X className="h-3.5 w-3.5" aria-hidden="true" />
					</Button>
				</div>
			</CardHeader>
			<CardContent className="pt-0">
				{node ?? (
					<div className="text-xs text-muted-foreground rounded-[var(--radius)] border border-dashed p-3 text-center">
						This widget kind has no inline preview yet.
					</div>
				)}
			</CardContent>
		</Card>
	);
}
