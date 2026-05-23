"use client";
/**
 * core/ai/components/code/CopyButton.tsx
 *
 * Tiny icon-only button that copies a string to the clipboard. Shows a
 * checkmark for 1.5s on success. Falls back to a toast on error.
 *
 * Sized to slot inside the <CodeBlock> header bar (24px tall). For other
 * uses, override className.
 */
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface Props {
	/** The text to copy. */
	value: string;
	/** Visible label for screen readers — defaults to "Copy". */
	label?: string;
	className?: string;
}

export function CopyButton({ value, label = "Copy", className }: Props) {
	const [copied, setCopied] = useState(false);

	async function handleClick() {
		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1500);
		} catch {
			// Some browsers / non-secure-context iframes deny clipboard
			// access. Tell the user once; never throw.
			toast.error("Couldn't access the clipboard.");
		}
	}

	return (
		<Button
			type="button"
			size="sm"
			variant="ghost"
			onClick={handleClick}
			aria-label={copied ? "Copied" : label}
			title={copied ? "Copied" : label}
			className={cn(
				"h-6 w-6 p-0 text-muted-foreground hover:text-foreground transition-colors",
				className,
			)}
		>
			{copied ? (
				<Check className="size-3.5 text-emerald-500" />
			) : (
				<Copy className="size-3.5" />
			)}
		</Button>
	);
}
