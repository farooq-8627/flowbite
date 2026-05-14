"use client";
"use client";

import type { Id } from "@/convex/_generated/dataModel";
import { FileUpload } from "@/core/files/components/FileUpload";
import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";
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
 * Each group returns a stack of `<ProfileSection>` cards. Every card id MUST
 * match an entry in `PROFILE_SECTIONS` so it shows up in the toolbar pills and
 * is searchable through the shell's Fuse index.
 *
 * Every tab is a placeholder for now. Slice 2 of
 * `ENTITY_SCAFFOLDS_ARCHITECTURE.md` replaces these with real content
 * (PersonHeader, PersonOverviewTab, UnifiedTimeline, etc.).
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
		case "reminders":
			return <RemindersGroup personCode={personCode} />;
		case "calendar":
			return <CalendarGroup personCode={personCode} />;
		default:
			return null;
	}
}

// ─── Placeholder groups (Slice 2 replaces these with real content) ────────────

function OverviewGroup({ personCode }: { personCode: string }) {
	// Labels are reactive — rename "Company" → "Venue" in Settings and the
	// section title + description update here without a reload.
	const labels = useEntityLabels();
	return (
		<div className="grid gap-6">
			<ProfileSection
				id="overview.vitals"
				title="Vitals"
				description="Name, personCode, avatar, status, and assignee."
			>
				<PlaceholderRow personCode={personCode} label="Vitals" />
			</ProfileSection>
			<ProfileSection
				id="overview.contact"
				title="Contact"
				description="Email, phone, WhatsApp, and preferred channel."
			>
				<PlaceholderRow personCode={personCode} label="Contact info" />
			</ProfileSection>
			<ProfileSection
				id="overview.company"
				title={labels.company.singular}
				description={`Linked ${labels.company.singular.toLowerCase()} and role at that ${labels.company.singular.toLowerCase()}.`}
			>
				<PlaceholderRow personCode={personCode} label={`${labels.company.singular} link`} />
			</ProfileSection>
			<ProfileSection
				id="overview.tags"
				title="Tags"
				description="Tags applied to this person."
			>
				<PlaceholderRow personCode={personCode} label="Tag picker" />
			</ProfileSection>
			<ProfileSection
				id="overview.custom-fields"
				title="Custom Fields"
				description="Workspace-defined fields, stage-aware."
			>
				<PlaceholderRow personCode={personCode} label="Dynamic fields" />
			</ProfileSection>
		</div>
	);
}

function MessagesGroup({ personCode }: { personCode: string }) {
	return (
		<div className="grid gap-6">
			<ProfileSection
				id="messages.thread"
				title="Conversation"
				description="Human messages and AI on-behalf replies."
			>
				<PlaceholderRow personCode={personCode} label="Message thread" />
			</ProfileSection>
		</div>
	);
}

function TimelineGroup({ personCode, orgSlug }: { personCode: string; orgSlug: string }) {
	return (
		<div className="grid gap-6">
			<ProfileSection
				id="timeline.feed"
				title="Feed"
				description="Unified log — created, updated, stage change, AI action, WhatsApp, reminders."
			>
				<PlaceholderRow
					personCode={personCode}
					label={`Unified timeline (org: ${orgSlug})`}
				/>
			</ProfileSection>
		</div>
	);
}

function NotesGroup({ personCode }: { personCode: string }) {
	return (
		<div className="grid gap-6">
			<ProfileSection
				id="notes.ai-briefing"
				title="AI Briefing"
				description="AI-generated summary of the most important context."
			>
				<PlaceholderRow personCode={personCode} label="AI briefing" />
			</ProfileSection>
			<ProfileSection
				id="notes.entries"
				title="Notes"
				description="Agent-written notes, editable."
			>
				<PlaceholderRow personCode={personCode} label="Notes list" />
			</ProfileSection>
		</div>
	);
}

function DealsGroup({ personCode }: { personCode: string }) {
	const labels = useEntityLabels();
	return (
		<div className="grid gap-6">
			<ProfileSection
				id="deals.list"
				title={labels.deal.plural}
				description={`Every ${labels.deal.singular.toLowerCase()} linked via personCode.`}
			>
				<PlaceholderRow
					personCode={personCode}
					label={`${labels.deal.plural} for this person`}
				/>
			</ProfileSection>
		</div>
	);
}

/**
 * FilesGroup — drag-and-drop attachments scoped to a single person
 * (scope="person", scopeId=personCode). Future passes will gate AI access to
 * these files through a per-person consent flag.
 */
function FilesGroup({ personCode, orgId }: { personCode: string; orgId: Id<"orgs"> | undefined }) {
	return (
		<div className="grid gap-6">
			<ProfileSection
				id="files.attachments"
				title="Attachments"
				description="Drop files here — contracts, IDs, notes. Available to AI only with explicit consent (coming soon)."
			>
				{orgId ? (
					<FileUpload
						orgId={orgId}
						scope="person"
						scopeId={personCode}
						label="Drop files here or click to browse"
						emptyText="No files attached yet."
					/>
				) : (
					<div className="text-xs text-muted-foreground">Loading…</div>
				)}
			</ProfileSection>
		</div>
	);
}

function RemindersGroup({ personCode }: { personCode: string }) {
	return (
		<div className="grid gap-6">
			<ProfileSection
				id="reminders.list"
				title="Reminders"
				description="All follow-ups scheduled for this person."
			>
				<PlaceholderRow personCode={personCode} label="Reminders" />
			</ProfileSection>
		</div>
	);
}

function CalendarGroup({ personCode }: { personCode: string }) {
	return (
		<div className="grid gap-6">
			<ProfileSection
				id="calendar.upcoming"
				title="Upcoming"
				description="Scheduled meetings and follow-up plan."
			>
				<PlaceholderRow personCode={personCode} label="Calendar" />
			</ProfileSection>
		</div>
	);
}

function PlaceholderRow({ personCode, label }: { personCode: string; label: string }) {
	return (
		<div className="text-xs text-muted-foreground">
			{label} for <span className="font-mono text-foreground">{personCode}</span> — coming
			soon.
		</div>
	);
}
