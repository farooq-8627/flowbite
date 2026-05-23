"use client";

/**
 * core/ai/components/results/SettingsResultCard.tsx
 *
 * Renders a deep-link to the Settings page section that was just touched
 * by a tool result emitting `display: { kind: "settings", sectionId }`.
 * Used by tools like `update_org_settings` and `rename_entity_labels` so
 * the user can verify the change in context with one click.
 *
 * The section ids are the same anchor ids used by `useSettingsSearch` —
 * the Settings page deep-links to them via the `?section=<id>` query
 * param. We mount a Link to that route and rely on
 * `useSettingsSearch::scrollToSection` to do the scroll.
 */

import { SettingsIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";

type SettingsResultCardProps = { sectionId: string; orgId: string };

export function SettingsResultCard({ sectionId }: SettingsResultCardProps) {
	const params = useParams();
	const orgSlug = params?.orgSlug as string | undefined;
	const locale = params?.locale as string | undefined;

	const href = orgSlug
		? `${locale ? `/${locale}` : ""}/${orgSlug}/settings?section=${encodeURIComponent(sectionId)}`
		: null;

	const card = (
		<div
			className={cn(
				"flex items-center gap-2 rounded-[var(--radius)] border bg-card px-3 py-2 text-xs",
				"shadow-xs hover:border-ring/40 hover:shadow-sm cursor-pointer",
			)}
		>
			<SettingsIcon className="size-3.5 text-primary" />
			<span className="font-medium">Settings updated</span>
			<span className="text-muted-foreground">·</span>
			<span className="text-[11px] text-muted-foreground">{prettySectionId(sectionId)}</span>
		</div>
	);

	if (href) {
		return (
			<Link
				href={href}
				className="block rounded-[var(--radius)] no-underline outline-none focus-visible:ring-1 focus-visible:ring-ring hover:no-underline"
				style={{ textDecoration: "none" }}
				title="Open in Settings"
			>
				{card}
			</Link>
		);
	}
	return card;
}

function prettySectionId(id: string): string {
	return id
		.replace(/[-_.]/g, " ")
		.replace(/^./, (c) => c.toUpperCase())
		.trim();
}
