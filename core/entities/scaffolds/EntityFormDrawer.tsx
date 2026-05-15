"use client";

/**
 * EntityFormDrawer — thin wrapper over FormDrawer adding RHF + zod + dedup
 * banner + toast + a universal keyboard contract.
 *
 * KEYBOARD CONTRACT
 *   Pressing **Enter** inside any text-like field jumps to the next field
 *   in document order. Pressing **Enter** in the LAST field calls the
 *   drawer's `onSubmit` (so the user can fill the form purely from the
 *   keyboard and finish with one final Enter). This is wired here so EVERY
 *   entity drawer (Add/Edit Lead, Contact, Deal, Company, …) inherits it
 *   without per-form code.
 *
 *   Excluded from the navigation:
 *     - `<textarea>` — Enter must insert a newline.
 *     - Buttons (Save, Cancel, segmented toggles, popover triggers).
 *     - Checkboxes / radios — Enter on those toggles the value (browser default).
 *     - Anything inside a Radix Portal (Select dropdown, Popover content).
 *       The portal lives outside the drawer DOM, so its events don't reach
 *       this handler. That's intentional — selectable popovers manage their
 *       own keyboard handling.
 *
 *   `data-form-skip-enter` on a wrapper opts the wrapped controls out of
 *   the navigation (e.g. a search box that already has its own Enter
 *   semantics).
 */

import { type KeyboardEvent, type ReactNode, useCallback, useRef } from "react";
import { DedupBanner } from "../shared/components/DedupBanner";
import { FormDrawer } from "../shared/components/FormDrawer";
import type { DedupResult } from "../shared/hooks/useDedup";

interface EntityFormDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: string;
	size?: "sm" | "md" | "lg" | "xl";
	onSubmit: () => void;
	isSubmitting: boolean;
	submitLabel?: string;
	submitDisabled?: boolean;
	duplicates?: DedupResult[];
	onDismissDuplicates?: () => void;
	children: ReactNode;
}

/**
 * CSS selector matching every "field-like" focusable control we treat as a
 * stepping stone in the Enter-to-next-field flow. Pinned UIs (popovers,
 * checkboxes) deliberately don't appear here; they remain interactive but
 * aren't part of the linear nav path.
 */
const FIELD_SELECTOR = [
	'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([disabled]):not([readonly])',
	"textarea:not([disabled]):not([readonly])",
	'button[data-slot="select-trigger"]:not([disabled])',
	'button[role="combobox"]:not([disabled])',
].join(", ");

export function EntityFormDrawer({
	open,
	onOpenChange,
	title,
	description,
	size = "md",
	onSubmit,
	isSubmitting,
	submitLabel,
	submitDisabled,
	duplicates,
	onDismissDuplicates,
	children,
}: EntityFormDrawerProps) {
	const bodyRef = useRef<HTMLDivElement | null>(null);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLDivElement>) => {
			if (e.key !== "Enter") return;

			const target = e.target as HTMLElement | null;
			if (!target) return;

			// Allow textarea / contentEditable to insert newlines.
			if (target.tagName === "TEXTAREA") return;
			if (target.isContentEditable) return;

			// Submit/cancel buttons should keep their native click behaviour.
			if (target.tagName === "BUTTON" && target.dataset.slot !== "select-trigger") return;

			// Honor explicit opt-out wrappers.
			if (target.closest("[data-form-skip-enter]")) return;

			const container = bodyRef.current;
			if (!container) return;

			// Only run for elements that are actually inside our body. (Radix
			// portals attach popover content to document.body — those events
			// won't bubble here, but the closest() check is a cheap sanity
			// guard for nested contenteditable cases.)
			if (!container.contains(target)) return;

			const fields = Array.from(
				container.querySelectorAll<HTMLElement>(FIELD_SELECTOR),
			).filter(
				(el) =>
					// `offsetParent === null` for hidden / display:none elements.
					el.offsetParent !== null,
			);
			const idx = fields.indexOf(target);
			if (idx === -1) return;

			e.preventDefault();
			if (idx < fields.length - 1) {
				fields[idx + 1]?.focus();
				// For inputs we also select the existing text so the next Enter
				// can overwrite it cleanly. For Select triggers / comboboxes
				// .select() is a no-op, which is fine.
				const next = fields[idx + 1] as HTMLInputElement;
				if (typeof next.select === "function") {
					try {
						next.select();
					} catch {
						/* not all elements support select() — safe to ignore */
					}
				}
			} else if (!submitDisabled && !isSubmitting) {
				// Last field — trigger submit.
				onSubmit();
			}
		},
		[onSubmit, submitDisabled, isSubmitting],
	);

	return (
		<FormDrawer
			open={open}
			onOpenChange={onOpenChange}
			title={title}
			description={description}
			size={size}
			onSubmit={onSubmit}
			isSubmitting={isSubmitting}
			submitLabel={submitLabel}
			submitDisabled={submitDisabled}
		>
			{duplicates && duplicates.length > 0 && (
				<DedupBanner duplicates={duplicates} onDismiss={onDismissDuplicates} />
			)}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: keyboard handler implements form-wide Enter-to-next-field navigation */}
			<div ref={bodyRef} onKeyDown={handleKeyDown}>
				{children}
			</div>
		</FormDrawer>
	);
}
