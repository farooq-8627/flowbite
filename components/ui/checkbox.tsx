"use client";

import { CheckIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Checkbox — Radix primitive themed for our design system.
 *
 * VISIBILITY CONTRACT
 *   The check mark must be unambiguously visible on every theme and density.
 *   We achieve that by:
 *     - Locking the tick colour to `text-white` whenever the checkbox is
 *       checked. Primary backgrounds in this app are always saturated
 *       accents (any preset), so a white tick keeps maximum contrast even
 *       on themes where `--primary-foreground` falls short. (We previously
 *       used `text-primary-foreground` and got dark-on-dark on a few
 *       presets — this hard-codes the safe path.)
 *     - Bumping the icon `stroke-[3.5]` so the glyph reads at size-4
 *       (16px) without going wispy. Lucide's default is too thin.
 *     - Slight `drop-shadow-[0_1px_0_rgba(0,0,0,0.25)]` for a hint of
 *       depth — keeps the tick crisp against the saturated fill.
 *
 * FOCUS CONTRACT
 *   We do NOT use a 3px ring. Per the project glow-removal rule, the focus
 *   state is just a border colour change to `border-ring`. This avoids the
 *   ring being clipped by parent overflow:hidden in popovers/scroll
 *   containers (which read as visual "cuts" on every side).
 */
function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
	return (
		<CheckboxPrimitive.Root
			data-slot="checkbox"
			className={cn(
				"peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-colors outline-none",
				"focus-visible:border-ring",
				"disabled:cursor-not-allowed disabled:opacity-50",
				"aria-invalid:border-destructive",
				"data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-white",
				"dark:bg-input/30 dark:data-[state=checked]:bg-primary",
				className,
			)}
			{...props}
		>
			<CheckboxPrimitive.Indicator
				data-slot="checkbox-indicator"
				className="grid place-content-center text-white"
			>
				<CheckIcon
					className="size-3.5 stroke-[3.5] drop-shadow-[0_1px_0_rgba(0,0,0,0.25)]"
					aria-hidden
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</CheckboxPrimitive.Indicator>
		</CheckboxPrimitive.Root>
	);
}

export { Checkbox };
