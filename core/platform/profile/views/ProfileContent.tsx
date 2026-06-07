"use client";

import { useQuery } from "convex/react";
import { Sparkles } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { AISuggestionsPanel } from "@/core/ai/components/AISuggestionsPanel";
import { sendChatPrefill } from "@/core/ai/lib/chatPrefill";
import { MessagesPanel } from "@/core/comms/messages/components/MessagesPanel";
import { NotesPanel } from "@/core/comms/notes/components/NotesPanel";
import { EntityTimeline } from "@/core/comms/timeline/components/EntityTimeline";
import { EntityAISummaryCard } from "@/core/entities/shared/components/EntityAISummaryCard";
import { EntityFilesPanel } from "@/core/entities/shared/components/EntityFilesPanel";
import { DealDetailShell } from "@/core/platform/profile/components/DealDetailShell";
import { OverviewCard } from "@/core/platform/profile/components/OverviewCard";
import { PersonFilesByDealStage } from "@/core/platform/profile/components/PersonFilesByDealStage";
import { PersonCalendarPanel } from "@/core/scheduling/calendar/panels/PersonCalendarPanel";
import { TasksPanel } from "@/core/scheduling/tasks/panels/TasksPanel";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import { useEntityLabels } from "@/core/shell/shared/hooks/useEntityLabels";
import type { ProfileGroupId } from "../config/profile-sections";
import { ProfileSection } from "./ProfileSection";

type Props = {
	activeGroup: ProfileGroupId;
	personCode: string;
	orgSlug: string;
	orgId: Id<"orgs"> | undefined;
};

/**
 * ProfileContent — dispatches to the correct profile group.
 *
 * Section chrome rules (asked for explicitly 2026-05-19):
 *   - Overview rows           → cards (Vitals / Contact / Company / Tags / Custom Fields)
 *   - Messages                → CHROMELESS (Messages panel is itself a full surface)
 *   - Timeline                → CHROMELESS (entity timeline feed is the surface)
 *   - Notes — AI briefing     → card (small summary block — looks odd without it)
 *   - Notes — entries         → CHROMELESS (the notes kanban is the surface)
 *   - Deals                   → card (placeholder for now)
 *   - Files                   → card (looks odd without — explicit user request)
 *   - Reminders               → CHROMELESS (reminders + follow-ups stack)
 *   - Calendar                → CHROMELESS (calendar grid is the surface)
 *
 * "Chromeless" sections still register with the shell's search system so the
 * topnav pill highlight and Fuse search behave identically — only the visual
 * card box is dropped. See `ProfileSection.chromeless` for details.
 */
export function ProfileContent({ activeGroup, personCode, orgSlug, orgId }: Props) {
	switch (activeGroup) {
		case "overview":
			return <OverviewGroup personCode={personCode} />;
		case "messages":
			return <MessagesGroup personCode={personCode} />;
		case "timeline":
			return <TimelineGroup personCode={personCode} orgSlug={orgSlug} />;
		case "notes":
			return <NotesGroup personCode={personCode} />;
		case "deals":
			return <DealsGroup personCode={personCode} />;
		case "files":
			return <FilesGroup personCode={personCode} orgId={orgId} />;
		case "tasks":
			return <RemindersGroup personCode={personCode} />;
		case "calendar":
			return <CalendarGroup personCode={personCode} />;
		default:
			return null;
	}
}

// ─── Overview — single unified OverviewCard (replaces the 5-card layout) ─────

function OverviewGroup({ personCode }: { personCode: string }) {
	const { orgId } = useCurrentOrg();
	const person = useQuery(
		api.crm.people.queries.getByPersonCode,
		orgId ? { orgId, personCode } : "skip",
	);
	const ai = (person?.entity as Doc<"leads"> | Doc<"contacts"> | undefined)?.aiContext;
	const personType = person?.type;

	return (
		<div className="grid gap-4">
			{/* AI summary surfaces the precomputed aiContext from leads/contacts.
			    Renders null when summary + keyFacts are both empty so the
			    page is unchanged for entities without context. */}
			<EntityAISummaryCard
				summary={ai?.summary}
				keyFacts={ai?.keyFacts}
				lastUpdatedAt={ai?.lastUpdatedAt}
			/>

			{/* P1.14 — Proactive AI suggestions scoped to this record (lead /
			    contact). Hidden when there are zero suggestions. */}
			{orgId && personType ? (
				<AISuggestionsPanel
					orgId={orgId}
					scope="entity"
					entityType={personType}
					entityCode={personCode}
					onTakeAction={sendChatPrefill}
				/>
			) : null}

			<ProfileSection
				id="overview.card"
				title="Overview"
				description="Vitals, contact, owner, tags, latest messages, reminders, and deals."
				chromeless
			>
				<OverviewCard personCode={personCode} />
			</ProfileSection>
		</div>
	);
}

// ─── Messages — CHROMELESS, full-height panel ────────────────────────────────

function MessagesGroup({ personCode }: { personCode: string }) {
	return (
		<ProfileSection
			id="messages.thread"
			title="Conversation"
			description="Human messages and AI on-behalf replies, synced with WhatsApp and email when those channels are wired up."
			chromeless
			fillHeight
		>
			<MessagesPanel entityType="person" entityId={personCode} />
		</ProfileSection>
	);
}

// ─── Timeline — CHROMELESS, entity timeline feed ─────────────────────────────

function TimelineGroup({ personCode, orgSlug: _orgSlug }: { personCode: string; orgSlug: string }) {
	return (
		<ProfileSection
			id="timeline.feed"
			title="Feed"
			description="Unified log: created, updated, stage change, AI action, WhatsApp, reminders."
			chromeless
			fillHeight
		>
			<EntityTimeline personCode={personCode} />
		</ProfileSection>
	);
}

// ─── Notes — AI briefing stub + chromeless notes panel ──────────────────────

function NotesGroup({ personCode }: { personCode: string }) {
	return (
		<div className="grid gap-6">
			{/* AI briefing — Phase 3 stub. Pulls aiContext.summary off the
			    person if any, otherwise renders a "no briefing yet" state.
			    The full Phase 3 build will replace this with a streaming AI
			    summary that reblits whenever the entity changes. */}
			<ProfileSection
				id="notes.ai-briefing"
				title="AI Briefing"
				description="AI-generated summary of the most important context."
			>
				<AiBriefingBlock personCode={personCode} />
			</ProfileSection>

			{/* Notes panel is its own surface — render chromeless. */}
			<ProfileSection
				id="notes.entries"
				title="Notes"
				description="Sticky notes: color-code, filter, and drag between categories. Notes added here also appear on the org-wide Notes page."
				chromeless
			>
				<NotesPanel entityType="person" entityId={personCode} personCode={personCode} />
			</ProfileSection>
		</div>
	);
}

// ─── Deals — real list keyed by personCode ─────────────────────────────────

function DealsGroup({ personCode }: { personCode: string }) {
	const labels = useEntityLabels();
	return (
		<ProfileSection
			id="deals.list"
			title={labels.deal.plural}
			description={`Every ${labels.deal.singular.toLowerCase()} linked via personCode, with full details and stage-aware fields up to where the ${labels.deal.singular.toLowerCase()} is right now.`}
			chromeless
			fillHeight
		>
			<DealDetailShell personCode={personCode} />
		</ProfileSection>
	);
}

// ─── Files — flat panel + per-deal/per-stage breakdown (explicit user request) ─

function FilesGroup({ personCode, orgId }: { personCode: string; orgId: Id<"orgs"> | undefined }) {
	const labels = useEntityLabels();
	return (
		<div className="grid gap-6">
			<ProfileSection
				id="files.attachments"
				title="Attachments"
				description="Drop files here: contracts, IDs, notes. Files attached to deals/contacts that reference this person also appear here."
			>
				{orgId ? (
					<EntityFilesPanel
						orgId={orgId}
						entityType="person"
						entityId={personCode}
						personCode={personCode}
					/>
				) : (
					<div className="text-xs text-muted-foreground">Loading…</div>
				)}
			</ProfileSection>

			<ProfileSection
				id="files.by-deal-stage"
				title={`By ${labels.deal.singular} & stage`}
				description={`The same files, grouped per ${labels.deal.singular.toLowerCase()} and per stage they were uploaded against. Mirrors the per-stage view on the ${labels.deal.singular.toLowerCase()} card.`}
			>
				{orgId ? (
					<PersonFilesByDealStage orgId={orgId} personCode={personCode} />
				) : (
					<div className="text-xs text-muted-foreground">Loading…</div>
				)}
			</ProfileSection>
		</div>
	);
}

// ─── Tasks — CHROMELESS tasks + follow-ups stack ─────────────────────────────

function RemindersGroup({ personCode }: { personCode: string }) {
	return (
		<div className="grid gap-6">
			<ProfileSection
				id="tasks.list"
				title="Tasks"
				description="All open tasks attached to this person — to-dos, calls, emails, meetings."
				chromeless
			>
				<TasksPanel personCode={personCode} />
			</ProfileSection>
			<ProfileSection
				id="tasks.followups"
				title="Follow-ups"
				description="Cadence-driven follow-ups attached to this person."
				chromeless
			>
				<TasksPanel personCode={personCode} type="followup" />
			</ProfileSection>
		</div>
	);
}

// ─── Calendar — CHROMELESS calendar panel ────────────────────────────────────

function CalendarGroup({ personCode }: { personCode: string }) {
	return (
		<ProfileSection
			id="calendar.upcoming"
			title="Upcoming"
			description="Scheduled meetings and follow-up plan."
			chromeless
			fillHeight
		>
			<PersonCalendarPanel personCode={personCode} />
		</ProfileSection>
	);
}

// ─── AI Briefing block (Phase 3 stub) ───────────────────────────────────────

/**
 * AiBriefingBlock — renders the precomputed `aiContext.summary` field from
 * the person's lead/contact row when available. This is a STUB ahead of the
 * full Phase 3 build:
 *   - We don't trigger a fresh AI call here; we just surface whatever the
 *     last refresh wrote to `aiContext.summary` (could come from voice/OCR
 *     ingestion or future scheduled rebuilds).
 *   - When no summary exists we render a friendly "AI briefing not ready"
 *     muted line so the section doesn't look broken.
 *
 * Why surface aiContext today? Because the data is already there — voice
 * note + OCR pipelines have been writing to it since Phase 2. Phase 3 will
 * add a "Refresh briefing" button + a system-prompt-aware AI tool, but the
 * field itself doesn't change shape. See `convex/_shared/validators.ts` for
 * the canonical aiContext shape.
 */
function AiBriefingBlock({ personCode }: { personCode: string }) {
	const { orgId } = useCurrentOrg();
	const person = useQuery(
		api.crm.people.queries.getByPersonCode,
		orgId ? { orgId, personCode } : "skip",
	);

	if (person === undefined) {
		return <p className="text-xs text-muted-foreground">Loading briefing…</p>;
	}
	if (!person) {
		return <p className="text-xs text-muted-foreground">Person not found.</p>;
	}

	const ai = (person.entity as Doc<"leads"> | Doc<"contacts">).aiContext;
	const summary = ai?.summary;
	const keyFacts = ai?.keyFacts ?? [];
	const lastUpdatedAt = ai?.lastUpdatedAt;

	if (!summary && keyFacts.length === 0) {
		return (
			<div className="flex items-start gap-2 rounded-[var(--radius)] border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
				<Sparkles className="mt-0.5 size-3 shrink-0" aria-hidden />
				<p>
					No AI briefing yet. As messages, notes, and follow-ups accumulate, the AI
					assistant will summarize key context here automatically.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-2">
			{summary && (
				<div className="flex items-start gap-2 rounded-[var(--radius)] border bg-muted/30 px-3 py-2 text-xs">
					<Sparkles
						className="mt-0.5 size-3 shrink-0 text-muted-foreground"
						aria-hidden
					/>
					<p className="leading-relaxed text-foreground">{summary}</p>
				</div>
			)}
			{keyFacts.length > 0 && (
				<ul className="grid gap-1 px-1 text-xs">
					{keyFacts.slice(0, 5).map((fact) => (
						<li key={fact} className="flex items-start gap-1.5 text-muted-foreground">
							<span
								aria-hidden
								className="mt-1 size-1 shrink-0 rounded-full bg-current"
							/>
							<span className="text-foreground">{fact}</span>
						</li>
					))}
				</ul>
			)}
			{lastUpdatedAt && (
				<p className="px-1 text-[10px] text-muted-foreground tabular-nums">
					Updated {new Date(lastUpdatedAt).toLocaleString()}
				</p>
			)}
		</div>
	);
}
