"use client";

/**
 * MockDataBanner — Phase 3A.
 *
 * Renders a dismissible banner at the top of the dashboard when the org
 * still has the template-seeded sample records. Two actions:
 *
 *   1. **Clear sample data** — calls `orgs.mutations.clearMockData`,
 *      which hard-deletes every record tagged `source:"template_seed"`
 *      or `(excludeFromAI && createdAt === mockDataSeededAt)`.
 *   2. **Dismiss** — calls `orgs.mutations.dismissMockDataBanner`,
 *      which patches `mockDataDismissedAt = now` so the banner stops
 *      nagging while leaving the data in place.
 *
 * Invisible when:
 *   - `org.settings.mockDataSeededAt` is unset (no mock data seeded).
 *   - `org.settings.mockDataDismissedAt` is set (user clicked dismiss).
 *
 * Permission to act: `org.editSettings`. Owners + Admins see the
 * buttons. Everyone else sees the banner read-only.
 */

import { useMutation } from "convex/react";
import { Sparkles, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useOrgPermissions } from "@/core/shell/shared/hooks/useCurrentOrg";
import { toast } from "@/lib/toast";

interface MockDataBannerProps {
	orgId: Id<"orgs">;
	mockDataSeededAt: number | undefined;
	mockDataDismissedAt: number | undefined;
}

export function MockDataBanner({
	orgId,
	mockDataSeededAt,
	mockDataDismissedAt,
}: MockDataBannerProps) {
	const [busy, setBusy] = useState<"clear" | "dismiss" | null>(null);
	const permissions = useOrgPermissions();
	const canEdit = permissions.includes("org.editSettings");

	const clearMockData = useMutation(api.orgs.mutations.clearMockData);
	const dismiss = useMutation(api.orgs.mutations.dismissMockDataBanner);

	if (!mockDataSeededAt) return null;
	if (mockDataDismissedAt) return null;

	const handleClear = async () => {
		if (busy) return;
		const ok = window.confirm(
			"Delete all sample records? This removes the seeded leads, deals, contacts, companies, notes, and reminders. Real data is untouched.",
		);
		if (!ok) return;
		setBusy("clear");
		try {
			const r = await clearMockData({ orgId });
			toast.success(`Cleared ${r.deleted} sample records.`);
		} catch (err) {
			toast.mutationError(err, "Could not clear sample data.");
		} finally {
			setBusy(null);
		}
	};

	const handleDismiss = async () => {
		if (busy) return;
		setBusy("dismiss");
		try {
			await dismiss({ orgId });
		} catch (err) {
			toast.mutationError(err, "Could not dismiss banner.");
		} finally {
			setBusy(null);
		}
	};

	return (
		<div className="flex items-start gap-3 rounded-[var(--radius)] border border-amber-300/60 bg-amber-50 p-3 text-sm dark:border-amber-700/40 dark:bg-amber-950/30">
			<Sparkles className="mt-0.5 size-4 flex-none text-amber-600 dark:text-amber-300" />
			<div className="flex-1">
				<p className="font-medium text-amber-900 dark:text-amber-100">
					You're viewing sample data
				</p>
				<p className="mt-0.5 text-amber-800/80 dark:text-amber-100/70">
					We seeded a few records so the workspace doesn't feel empty. Clear them once
					you've added your own — or keep them around and dismiss this banner.
				</p>
				{canEdit && (
					<div className="mt-2.5 flex gap-2">
						<Button
							size="sm"
							variant="outline"
							onClick={handleClear}
							disabled={busy !== null}
						>
							{busy === "clear" ? "Clearing…" : "Clear sample data"}
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onClick={handleDismiss}
							disabled={busy !== null}
						>
							Keep & dismiss
						</Button>
					</div>
				)}
			</div>
			{canEdit && (
				<Button
					variant="ghost"
					size="icon"
					className="size-7"
					onClick={handleDismiss}
					disabled={busy !== null}
					aria-label="Dismiss banner"
				>
					<X className="size-4" />
				</Button>
			)}
		</div>
	);
}
