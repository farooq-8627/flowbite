"use client";

/**
 * FollowUpsPanel — embedded panel for entity profile / deal / company tabs.
 *
 * STATUS: IMPLEMENTED.
 *
 * Built around ONE subscription:
 *   - profile tab: `useFollowupsForPerson({ orgId, personCode })`
 *   - deal/company tab: `useFollowupsForEntity({ orgId, entityType, entityId })`
 *
 * The panel is mode-driven by which props the caller supplies. Stats /
 * cards / form all read the single result.
 *
 * UX (Pipedrive-inspired cadence pattern):
 *   - Header: "Follow-ups (N open)" + "+ New" button.
 *   - Body: groups by Overdue → Today → This week → Later → Completed
 *     (completed collapsed by default).
 *   - Click any card → opens edit drawer.
 *   - One-click ✓ → completes (optimistic).
 */

import { CalendarPlusIcon, ChevronDownIcon } from "lucide-react";
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
import { useCurrentOrg, useOrgPermissions } from "@/core/shell/shared/hooks/useCurrentOrg";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { FollowUpCard } from "../components/FollowUpCard";
import { FollowUpForm } from "../components/FollowUpForm";
import {
	useDeleteFollowup,
	useFollowupsForEntity,
	useFollowupsForPerson,
} from "../hooks";
import {
	bucketFollowups,
	FOLLOWUP_BUCKET_LABEL,
	FOLLOWUP_BUCKET_ORDER,
	openFollowupCount,
} from "../lib/followup-buckets";

type FollowUp = Doc<"reminders">;

type FollowUpsPanelProps =
	| {
			/** Profile tab — followups for a person (lead/contact merged via personCode). */
			personCode: string;
			entityType?: never;
			entityId?: never;
			/** Optional pre-bound deal context when the panel mounts inside a deal-aware view. */
			defaults?: { dealCode?: string };
			className?: string;
	  }
	| {
			/** Deal / company detail tab — followups for an entity (deal/company). */
			personCode?: never;
			entityType: "deal" | "company";
			entityId: string;
			/** Optional fallback personCode when the entity has a primary contact. */
			defaults?: { personCode?: string };
			className?: string;
	  };

export function FollowUpsPanel(props: FollowUpsPanelProps) {
	const { className } = props;
	const { orgId } = useCurrentOrg();
	const permissions = useOrgPermissions();
	const canCreate = permissions.includes("reminders.create");

	// Mode: person panel vs entity panel — one subscription either way.
	const isPersonPanel = "personCode" in props && !!props.personCode;
	const personFollowups = useFollowupsForPerson({
		orgId: isPersonPanel ? orgId : undefined,
		personCode: isPersonPanel ? (props as { personCode: string }).personCode : "",
	});
	const entityFollowups = useFollowupsForEntity({
		orgId: !isPersonPanel ? orgId : undefined,
		entityType: !isPersonPanel ? (props as { entityType: string }).entityType : undefined,
		entityId: !isPersonPanel ? (props as { entityId: string }).entityId : undefined,
	});
	const followups = isPersonPanel ? personFollowups : entityFollowups;
	const isLoading = followups === undefined;

	// ── State ────────────────────────────────────────────────────────
	const [drawerOpen, setDrawerOpen] = useState(false);
	const [editing, setEditing] = useState<FollowUp | null>(null);
	const [deleting, setDeleting] = useState<FollowUp | null>(null);
	const [removing, setRemoving] = useState(false);
	const deleteFollowup = useDeleteFollowup();
	const [now] = useState(() => Date.now());

	const buckets = useMemo(() => bucketFollowups(followups ?? [], now), [followups, now]);
	const openTotal = openFollowupCount(buckets);

	const openCreate = useCallback(() => {
		setEditing(null);
		setDrawerOpen(true);
	}, []);

	const openEdit = useCallback((f: FollowUp) => {
		setEditing(f);
		setDrawerOpen(true);
	}, []);

	const askDelete = useCallback((f: FollowUp) => {
		setDeleting(f);
	}, []);

	async function confirmDelete() {
		if (!deleting || !orgId) return;
		setRemoving(true);
		try {
			await deleteFollowup({ orgId, reminderId: deleting._id });
			toast.success("Follow-up deleted");
			setDeleting(null);
		} catch (err) {
			toast.mutationError(err, "Couldn't delete follow-up");
		} finally {
			setRemoving(false);
		}
	}

	// Build form defaults — pre-bind the entity / deal so the picker is
	// locked and the user can't accidentally re-target the follow-up.
	const formDefaults = useMemo(() => {
		if (isPersonPanel) {
			const p = props as { personCode: string; defaults?: { dealCode?: string } };
			return {
				personCode: p.personCode,
				dealCode: p.defaults?.dealCode,
				entityType: "person",
				entityId: p.personCode,
			};
		}
		const e = props as {
			entityType: "deal" | "company";
			entityId: string;
			defaults?: { personCode?: string };
		};
		return {
			personCode: e.defaults?.personCode,
			entityType: e.entityType,
			entityId: e.entityId,
		};
	}, [isPersonPanel, props]);

	return (
		<div className={cn("flex flex-col gap-3", className)}>
			{/* Header */}
			<div className="flex items-center justify-between">
				<div className="flex items-baseline gap-2">
					<h3 className="text-sm font-semibold">Follow-ups</h3>
					<span className="text-xs text-muted-foreground">
						{openTotal === 0
							? "no open follow-ups"
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
						<CalendarPlusIcon className="me-1.5 size-3.5" />
						New
					</Button>
				)}
			</div>

			{/* Body */}
			{isLoading ? (
				<p className="text-xs text-muted-foreground">Loading…</p>
			) : (followups?.length ?? 0) === 0 ? (
				<EmptyPanel canCreate={canCreate} onCreate={openCreate} />
			) : (
				<div className="grid gap-3">
					{FOLLOWUP_BUCKET_ORDER.map((bucket) => {
						const items = buckets[bucket];
						if (items.length === 0) return null;
						return (
							<BucketSection
								key={bucket}
								title={FOLLOWUP_BUCKET_LABEL[bucket]}
								count={items.length}
								defaultOpen={bucket !== "completed"}
							>
								<div className="grid gap-2">
									{items.map((f) => (
										<FollowUpCard
											key={f._id}
											followup={f}
											onEdit={openEdit}
											onDelete={askDelete}
											hidePersonCode={isPersonPanel}
										/>
									))}
								</div>
							</BucketSection>
						);
					})}
				</div>
			)}

			{/* Drawer */}
			<FollowUpForm
				open={drawerOpen}
				onOpenChange={setDrawerOpen}
				followup={editing}
				defaults={editing ? undefined : formDefaults}
			/>

			{/* Delete confirm */}
			<AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this follow-up?</AlertDialogTitle>
						<AlertDialogDescription>
							{deleting?.title}. This can't be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={(e) => {
								e.preventDefault();
								void confirmDelete();
							}}
							disabled={removing}
							className="bg-destructive text-white hover:bg-destructive/90"
						>
							{removing ? "Deleting…" : "Delete"}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

// ─── Empty placard ───────────────────────────────────────────────────────────

function EmptyPanel({ canCreate, onCreate }: { canCreate: boolean; onCreate: () => void }) {
	return (
		<div className="flex flex-col items-center gap-2 rounded-[var(--radius)] border border-dashed bg-muted/30 px-4 py-8 text-center">
			<CalendarPlusIcon className="size-5 text-muted-foreground" aria-hidden />
			<p className="text-xs text-muted-foreground">No follow-ups scheduled.</p>
			{canCreate && (
				<Button size="sm" variant="outline" onClick={onCreate} className="h-7 text-xs">
					<CalendarPlusIcon className="me-1.5 size-3.5" />
					Schedule a follow-up
				</Button>
			)}
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
