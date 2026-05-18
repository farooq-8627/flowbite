"use client";

/**
 * RemindersCard — dashboard card showing today + overdue reminders, with
 * an inline "+ New" reminder form.
 *
 * STATUS: IMPLEMENTED.
 *
 * Two tabs:
 *   - **Today & overdue** — what fires when you sit down at your desk.
 *     Capped at 8 cards. When empty, shows `<NextReminderFallback />`
 *     with the next upcoming reminder so the card stays useful.
 *   - **Mine** — overdue items assigned to the current user. Capped at 6.
 *
 * The "+ New" button opens the same `<ReminderForm />` drawer used on
 * the reminders page (no navigation, no full-page transition). Defaults
 * to `source: "manual"` so the activity log shows the right origin.
 *
 * Data:
 *   - `useRemindersDueAndOverdue` — server-side filter `dueAt <= eod &&
 *     status="pending"` so a reminder dragged to yesterday surfaces here.
 *   - `useRemindersNextUpcoming` — only fetched when the main bucket is
 *     empty; powers the fallback card.
 *
 * Subscriptions: 2 (todayAndOverdue, nextUpcoming). The currentUser is
 * read from `useMe()` context (zero new subscriptions).
 */

import { BellPlusIcon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Id } from "@/convex/_generated/dataModel";
import { ReminderCard } from "@/core/scheduling/reminders/components/ReminderCard";
import { ReminderForm } from "@/core/scheduling/reminders/components/ReminderForm";
import {
	useRemindersDueAndOverdue,
	useRemindersNextUpcoming,
} from "@/core/scheduling/reminders/hooks";
import { bucketByDue } from "@/core/scheduling/reminders/lib/reminder-buckets";
import { useMe } from "@/core/shell/shared/hooks/useCurrentOrg";
import { NextReminderFallback } from "./NextReminderFallback";

interface RemindersCardProps {
	orgId: Id<"orgs">;
	orgSlug: string;
}

export function RemindersCard({ orgId, orgSlug }: RemindersCardProps) {
	const me = useMe();
	const reminders = useRemindersDueAndOverdue({ orgId });
	const nextUpcoming = useRemindersNextUpcoming({ orgId, limit: 1 });
	const [now] = useState(() => Date.now());
	const [drawerOpen, setDrawerOpen] = useState(false);

	const { todayAndOverdue, myOverdue } = useMemo(() => {
		if (!reminders) return { todayAndOverdue: [], myOverdue: [] };
		const buckets = bucketByDue(reminders, now);
		// Most-overdue first, then today.
		const all = [...buckets.overdue, ...buckets.today];
		const mine = buckets.overdue.filter((r) => r.assignedTo === me?._id);
		return { todayAndOverdue: all.slice(0, 8), myOverdue: mine.slice(0, 6) };
	}, [reminders, now, me?._id]);

	const next = nextUpcoming?.[0];
	const isLoading = reminders === undefined;

	return (
		<Card className="flex h-full flex-col">
			<CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
				<CardTitle className="text-base">Reminders</CardTitle>
				<div className="flex items-center gap-1">
					<Link
						href={`/${orgSlug}/reminders`}
						className="text-xs text-muted-foreground hover:text-foreground"
					>
						View all
					</Link>
					<Button
						size="sm"
						variant="outline"
						className="h-7 text-xs"
						data-tour="quick-add-reminder"
						onClick={() => setDrawerOpen(true)}
					>
						<BellPlusIcon className="me-1 size-3" />
						New
					</Button>
				</div>
			</CardHeader>
			<CardContent className="flex flex-1 flex-col pt-0">
				<Tabs defaultValue="due" className="flex flex-1 flex-col">
					<TabsList className="h-7 text-xs self-start">
						<TabsTrigger value="due" className="text-xs h-6 px-2">
							Today &amp; overdue ({todayAndOverdue.length})
						</TabsTrigger>
						<TabsTrigger value="mine" className="text-xs h-6 px-2">
							Mine ({myOverdue.length})
						</TabsTrigger>
					</TabsList>
					<TabsContent value="due" className="mt-2 flex-1 min-h-0">
						{isLoading ? (
							<p className="text-xs text-muted-foreground">Loading…</p>
						) : todayAndOverdue.length === 0 ? (
							<NextReminderFallback next={next} orgSlug={orgSlug} />
						) : (
							<div className="grid gap-1.5">
								{todayAndOverdue.map((r) => (
									<ReminderCard key={r._id} reminder={r} />
								))}
							</div>
						)}
					</TabsContent>
					<TabsContent value="mine" className="mt-2 flex-1 min-h-0">
						{myOverdue.length === 0 ? (
							<p className="rounded-[var(--radius)] border border-dashed bg-muted/30 px-3 py-3 text-center text-xs text-muted-foreground">
								You're caught up. 🎉
							</p>
						) : (
							<div className="grid gap-1.5">
								{myOverdue.map((r) => (
									<ReminderCard key={r._id} reminder={r} />
								))}
							</div>
						)}
					</TabsContent>
				</Tabs>
			</CardContent>
			<ReminderForm
				open={drawerOpen}
				onOpenChange={setDrawerOpen}
				defaults={{ source: "manual" }}
			/>
		</Card>
	);
}
