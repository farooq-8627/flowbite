"use client";

/**
 * Owner-panel settings-card primitives — simple "card" frames used inside
 * each owner-panel route. NOT a re-export of the dashboard's
 * `<SettingsSection>` because Stage 2 ships standalone placeholder views
 * with no save buttons, no dirty-form state, no per-section scroll
 * targets. When Stage 4+ ship real editors, swap this alias for the
 * existing settings-card primitive in one find-and-replace.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §3.1, §6.2.
 */
import type { ReactNode } from "react";

export function OwnerSettingsCard({
	title,
	description,
	children,
	footer,
}: {
	title: string;
	description?: string;
	children?: ReactNode;
	footer?: ReactNode;
}) {
	return (
		<section className="rounded-[var(--radius)] border border-border bg-card text-card-foreground shadow-sm">
			<header className="border-b border-border px-6 py-4">
				<h2 className="text-base font-semibold leading-tight">{title}</h2>
				{description ? (
					<p className="mt-1 text-sm text-muted-foreground">{description}</p>
				) : null}
			</header>
			{children ? <div className="px-6 py-5">{children}</div> : null}
			{footer ? <footer className="border-t border-border px-6 py-3">{footer}</footer> : null}
		</section>
	);
}

/**
 * Empty-state body shared across "coming soon" Stage 2 placeholder views.
 */
export function OwnerComingSoon({ caption }: { caption: string }) {
	return (
		<div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
			<span className="rounded-[var(--radius)] bg-muted px-2 py-0.5 text-xs font-medium uppercase tracking-wide">
				Coming next
			</span>
			<p>{caption}</p>
		</div>
	);
}
