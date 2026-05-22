"use client";

/**
 * TimelineNodeEntry — compact entry for state transitions (status / stage
 * changes, system events). Same visual pattern as the bare entry, but
 * uses a **smaller** node (status changes are visually less weighty than
 * a creation event). The headline carries the "from → to" fragment when
 * the metadata supplies it.
 *
 * Visual contract:
 *   ┌──────────────────────────────────────────────────────────────┐
 *   │ ⇄  Deal stage changed → Negotiation     5m ago · by Umar    │
 *   │     Big Deal · D-007                                         │
 *   └──────────────────────────────────────────────────────────────┘
 */

import { IdentityBadge } from "@/core/entities/shared/components/IdentityBadge";
import { useOrgMemberMap } from "@/core/shell/shared/hooks/useCurrentOrg";
import { resolveActionTheme } from "./action-theme";
import { ActionNode, TrailingMeta } from "./TimelineBareEntry";
import type { TimelineActivityEntry } from "./types";

interface TimelineNodeEntryProps {
	entry: TimelineActivityEntry;
	isLast?: boolean;
	gapPx?: number;
}

export function TimelineNodeEntry({ entry, isLast, gapPx }: TimelineNodeEntryProps) {
	const memberMap = useOrgMemberMap();
	const member = memberMap.get(String(entry.userId));
	const actorName = member?.user?.name ?? member?.user?.email ?? "Someone";
	const avatarUrl = member?.user?.avatarUrl;

	const theme = resolveActionTheme({
		entityType: entry.entityType,
		action: entry.action,
		actorType: entry.actorType,
	});

	const tail = resolveStatusTail(entry);
	const subject = extractSubject(entry);

	return (
		<div className="relative flex items-start gap-3">
			<ActionNode theme={theme} isLast={isLast} gapPx={gapPx} />

			<div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-1">
				<div className="flex items-baseline justify-between gap-3">
					<div className="text-sm font-semibold text-foreground">
						{theme.titleVerb}
						{tail && (
							<>
								<span className="mx-1 text-muted-foreground">→</span>
								<span className="text-foreground/80">{tail}</span>
							</>
						)}
					</div>
					<TrailingMeta
						time={entry.createdAt}
						actorName={actorName}
						actorAvatarUrl={avatarUrl}
					/>
				</div>

				{subject && (
					<div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
						{subject.name && <span className="text-foreground/80">{subject.name}</span>}
						{subject.code && (
							<>
								{subject.name && <span aria-hidden>·</span>}
								<IdentityBadge
									entityType={subject.codeKind}
									code={subject.code}
									layout="code"
									size="xs"
								/>
							</>
						)}
					</div>
				)}
			</div>
		</div>
	);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function resolveStatusTail(entry: TimelineActivityEntry): string | null {
	const meta = entry.metadata as
		| { newStatus?: string; newStage?: string; to?: string }
		| undefined;
	if (!meta) return null;
	const v = meta.newStatus ?? meta.newStage ?? meta.to;
	return typeof v === "string" ? v : null;
}

function extractSubject(entry: TimelineActivityEntry): {
	name?: string;
	code?: string;
	codeKind: "person" | "deal" | "company" | "lead" | "contact";
} | null {
	const meta = entry.metadata as { dealCode?: string; companyCode?: string } | undefined;

	const codeKind: "person" | "deal" | "company" | "lead" | "contact" =
		entry.entityType === "deal"
			? "deal"
			: entry.entityType === "company"
				? "company"
				: entry.entityType === "lead"
					? "lead"
					: entry.entityType === "contact"
						? "contact"
						: "person";

	let code: string | undefined;
	if (entry.entityType === "deal" && meta?.dealCode) {
		code = meta.dealCode;
	} else if (entry.entityType === "company" && meta?.companyCode) {
		code = meta.companyCode;
	} else if (entry.personCode) {
		code = entry.personCode;
	}

	let name: string | undefined;
	if (entry.description) {
		const colonIdx = entry.description.indexOf(":");
		if (colonIdx >= 0 && colonIdx < entry.description.length - 1) {
			name = entry.description.slice(colonIdx + 1).trim();
		}
	}

	if (!name && !code) return null;
	return { name, code, codeKind };
}
