"use client";

/**
 * RemindersPanel — compact reminder list embedded in entity profile tabs.
 *
 * STATUS: IMPLEMENTED.
 *
 * Mounted inside person profiles + (later) deal/company detail pages.
 * Built around ONE subscription: `useRemindersForPerson({ orgId,
 * personCode })`. Stats are derived; cards re-use `<ReminderCard>`
 * which itself reads `useMe` + `useOrgPermissions` from context.
 *
 * UX:
 *   - Header: "Reminders (3)" + "+ Add" inline button.
 *   - Body: groups by Overdue → Today → Upcoming → Completed (collapsed by default).
 *   - Empty state: panel-variant `<ReminderEmptyState>` with create CTA.
 *   - Click any card → opens edit drawer.
 *   - One-click ✓ on each card → completes (optimistic).
 *
 * Performance contract (per SCHEDULING-IMPLEMENTATION.md §4.2):
 *   - personCode-indexed query → no full-table scan.
 *   - No per-row queries; everything reads the single result + context.
 */

import { BellPlusIcon, ChevronDownIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { Doc } from "@/convex/_generated/dataModel";
import { useDeleteReminder, useRemindersForPerson } from "@/core/scheduling/reminders/hooks";
import {
	bucketByDue,
	openCount,
	REMINDER_BUCKET_ORDER,
} from "@/core/scheduling/reminders/lib/reminder-buckets";
import { REMINDER_STATE_LABEL } from "@/core/scheduling/reminders/lib/reminder-status";
import { useCurrentOrg, useOrgPermissions } from "@/core/shell/shared/hooks/useCurrentOrg";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { ReminderCard } from "../components/ReminderCard";
import { ReminderEmptyState } from "../components/ReminderEmptyState";
import { ReminderForm } from "../components/ReminderForm";

type Reminder = Doc<"reminders">;

interface RemindersPanelProps {
	/** The person whose reminders we want. Required. */
	personCode: string;
	/** Optional: pin the form to a specific entity (deal/company) when the panel is mounted from that entity's tab. */
	defaults?: {
		dealCode?: string;
		entityType?: string;
		entityId?: string;
	};
	className?: string;
}

export function RemindersPanel({ personCode, defaults, className }: RemindersPanelProps) {
	const { orgId } = useCurrentOrg();
	const permissions = useOrgPermissions();
	const canCreate = permissions.includes("reminders.create");

	const reminders = useRemindersForPerson({ orgId, personCode });
	const isLoading = reminders === undefined;

	// ── State ────────────────────────────────────────────────────────
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [editing, setEditing] = useState<Reminder | null>(null);
	const [deletingReminder, setDeletingReminder] = useState<Reminder | null>(null);
	const [deleting, setDeleting] = useState(false);
	const deleteReminder = useDeleteReminder();
	const [now] = useState(() => Date.now());

	const buckets = useMemo(() => bucketByDue(reminders ?? [], now), [reminders, now]);
	const openTotal = openCount(buckets);

	const openCreate = useCallback(() => {
		setEditing(null);
		setDrawerOpen(true);
	}, []);

	const openEdit = useCallback((r: Reminder) => {
		setEditing(r);
		setDrawerOpen(true);
	}, []);

	const askDelete = useCallback((r: Reminder) => {
		setDeletingReminder(r);
	}, []);

	async function confirmDelete() {
		if (!deletingReminder || !orgId) return;
		setDeleting(true);
		try {
			await deleteReminder({ orgId, reminderId: deletingReminder._id });
			toast.success("Reminder deleted");
			setDeletingReminder(null);
		} catch (err) {
			toast.mutationError(err, "Couldn't delete reminder");
		} finally {
			setDeleting(false);
		}
	}

	return (
		<div className={cn("flex flex-col gap-3", className)}>
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-baseline gap-2">
					<h3 className="text-sm font-semibold">Reminders</h3>
					<span className="text-xs text-muted-foreground">
						{openTotal === 0
							? "no open reminders"
							: openTotal === 1
								? "1 open"
								: `${openTotal} open`}
					</span>
				</div>
				{canCreate && (
					<Button
						size="sm"
						variant="outline"
						onClick={openCreate}
						className="h-7 text-xs"
					>
						<BellPlusIcon className="me-1.5 size-3.5" />
						Add
					</Button>
				)}
			</div>

			{/* Body */}
			{isLoading ? (
				<p className="text-xs text-muted-foreground">Loading…</p>
			) : (reminders?.length ?? 0) === 0 ? (
				<ReminderEmptyState variant="panel" onCreate={canCreate ? openCreate : undefined} />
			) : (
				<div className="grid gap-3">
					{REMINDER_BUCKET_ORDER.map((bucket) => {
						const items = buckets[bucket];
						if (items.length === 0) return null;
						const isCompletedBucket = bucket === "completed";
						return (
							<BucketSection
								key={bucket}
								title={REMINDER_STATE_LABEL[bucket]}
								count={items.length}
								defaultOpen={!isCompletedBucket}
							>
								<div className="grid gap-2">
									{items.map((r) => (
										<ReminderCard
											key={r._id}
											reminder={r}
											onEdit={openEdit}
											onDelete={askDelete}
											hidePersonCode
										/>
									))}
								</div>
							</BucketSection>
						);
					})}
				</div>
			)}

			{/* Drawer */}
			<ReminderForm
				open={drawerOpen}
				onOpenChange={setDrawerOpen}
				reminder={editing}
				defaults={
					editing
						? undefined
						: {
								personCode,
								dealCode: defaults?.dealCode,
								entityType: defaults?.entityType ?? "person",
								entityId: defaults?.entityId ?? personCode,
								source: "manual",
							}
				}
			/>

			{/* Delete confirm */}
			<AlertDialog
				open={!!deletingReminder}
				onOpenChange={(v) => !v && setDeletingReminder(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this reminder?</AlertDialogTitle>
						<AlertDialogDescription>
							{deletingReminder?.title}. This can't be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={(e) => {
								e.preventDefault();
								void confirmDelete();
							}}
							disabled={deleting}
							className="bg-destructive text-white hover:bg-destructive/90"
						>
							{deleting ? "Deleting…" : "Delete"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

// ─── Section accordion ───────────────────────────────────────────────────────

function BucketSection({
	title,
	count,
	defaultOpen,
	children,
}: {
	title: string;
	count: number;
	defaultOpen?: boolean;
	children: React.ReactNode;
}) {
	const [open, setOpen] = useState(defaultOpen ?? true);
	return (
		<div className="grid gap-2">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
			>
				<span className="flex items-center gap-1.5">
					<ChevronDownIcon
						className={cn("size-3 transition-transform", !open && "-rotate-90")}
						aria-hidden
					/>
					<span>{title}</span>
					<span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{count}</span>
				</span>
			</button>
			{open && children}
		</div>
	);
}
