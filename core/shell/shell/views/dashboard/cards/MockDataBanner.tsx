"use client";

/**
 * MockDataBanner — Phase 3A.
 *
 * Renders a persistent banner at the top of the dashboard while the
 * org still has the template-seeded sample records. Two ways to clear:
 *
 *   1. Big "Clear sample data" button (visible when the user has
 *      `org.editSettings`).
 *   2. The "X" close button in the top-right corner — same action,
 *      same `window.confirm()` flow. Closing the banner IS clearing
 *      the data; there is no separate "dismiss without clearing"
 *      route any more.
 *
 * Both paths call `orgs.mutations.clearMockData`, which hard-deletes
 * every record tagged `source:"template_seed"` (or
 * `excludeFromAI && createdAt === mockDataSeededAt`) and resets
 * `mockDataSeededAt`. The banner re-renders to `null` automatically
 * the moment the seed timestamp clears.
 *
 * The banner re-appears on every refresh until `mockDataSeededAt` is
 * undefined — that's the explicit user requirement (2026-05-30): mock
 * data should be unmissable until it's actually gone.
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
}

export function MockDataBanner({ orgId, mockDataSeededAt }: MockDataBannerProps) {
	const [busy, setBusy] = useState(false);
	const permissions = useOrgPermissions();
	const canEdit = permissions.includes("org.editSettings");

	const clearMockData = useMutation(api.orgs.mutations.clearMockData);

	if (!mockDataSeededAt) return null;

	const handleClear = async () => {
		if (busy) return;
		const ok = window.confirm(
			"Delete all sample records? This removes the seeded leads, deals, contacts, companies, notes, and reminders. Real data is untouched.",
		);
		if (!ok) return;
		setBusy(true);
		try {
			const r = await clearMockData({ orgId });
			toast.success(`Cleared ${r.deleted} sample records.`);
		} catch (err) {
			toast.mutationError(err, "Could not clear sample data.");
		} finally {
			setBusy(false);
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
					you've added your own — closing this banner clears the data.
				</p>
				{canEdit && (
					<div className="mt-2.5 flex gap-2">
						<Button size="sm" variant="outline" onClick={handleClear} disabled={busy}>
							{busy ? "Clearing…" : "Clear sample data"}
						</Button>
					</div>
				)}
			</div>
			{canEdit && (
				<Button
					variant="ghost"
					size="icon"
					className="size-7"
					onClick={handleClear}
					disabled={busy}
					aria-label="Clear sample data"
				>
					<X className="size-4" />
				</Button>
			)}
		</div>
	);
}
