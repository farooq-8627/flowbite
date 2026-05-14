"use client";

/**
 * CopyField — clickable text that silently copies its value on click.
 *
 * No copy icon / button — the whole string is the affordance. Shows a sonner
 * toast on success. Failures fall back to a `document.execCommand('copy')` path
 * for older WebView/Safari contexts.
 *
 * Typical usage:
 *   <CopyField value={lead.email} />
 *   <CopyField value={lead.phone} kind="phone" />
 *
 * `kind` only controls the toast copy ("Email copied" vs. "Phone copied") —
 * rendering is identical.
 */

import { type ReactNode, useCallback } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface CopyFieldProps {
	value: string | null | undefined;
	/** Custom render for the displayed text. Defaults to `value`. */
	children?: ReactNode;
	/** Used to pick a sensible toast message. */
	kind?: "email" | "phone" | "text" | "code";
	/** Fallback when value is empty. Defaults to an em-dash. */
	emptyLabel?: ReactNode;
	className?: string;
	title?: string;
	"aria-label"?: string;
}

export function CopyField({
	value,
	children,
	kind = "text",
	emptyLabel = "—",
	className,
	title,
	...props
}: CopyFieldProps) {
	const handleCopy = useCallback(async () => {
		if (!value) return;
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(value);
			} else {
				// Legacy fallback for older WebView contexts
				const el = document.createElement("textarea");
				el.value = value;
				el.setAttribute("readonly", "");
				el.style.position = "absolute";
				el.style.left = "-9999px";
				document.body.appendChild(el);
				el.select();
				document.execCommand("copy");
				document.body.removeChild(el);
			}
			toast.success(toastMessage(kind), { duration: 1500 });
		} catch {
			toast.error("Couldn't copy to clipboard");
		}
	}, [value, kind]);

	if (!value) {
		return <span className="text-muted-foreground">{emptyLabel}</span>;
	}

	return (
		<button
			type="button"
			onClick={handleCopy}
			title={title ?? "Click to copy"}
			className={cn(
				// No underline — plain clickable text. Copy confirmation comes via the toast.
				"max-w-full truncate text-start text-inherit transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none",
				className,
			)}
			{...props}
		>
			{children ?? value}
		</button>
	);
}

function toastMessage(kind: CopyFieldProps["kind"]): string {
	switch (kind) {
		case "email":
			return "Email copied to clipboard";
		case "phone":
			return "Phone copied to clipboard";
		case "code":
			return "Code copied";
		default:
			return "Copied to clipboard";
	}
}
