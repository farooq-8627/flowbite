"use client";

import type * as React from "react";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Props = Omit<React.ComponentProps<typeof Input>, "id"> & {
	label: React.ReactNode;
	id?: string;
	/** Additional class on the wrapper div */
	wrapperClassName?: string;
};

/**
 * Input with an overlapping floating label that sits on the border:
 *
 *   ┌── Singular ──────────┐
 *   │ Lead                 │
 *   └──────────────────────┘
 *
 * Uses logical start/end properties → safe in RTL.
 */
export function FloatingLabelInput({
	label,
	id,
	className,
	wrapperClassName,
	...inputProps
}: Props) {
	const generatedId = useId();
	const inputId = id ?? generatedId;

	return (
		<div className={cn("group relative w-full", wrapperClassName)}>
			<Label
				htmlFor={inputId}
				className="pointer-events-none absolute top-0 start-2 z-10 block -translate-y-1/2 bg-card px-1 text-[10px] font-medium text-muted-foreground"
			>
				{label}
			</Label>
			<Input id={inputId} className={cn("h-10", className)} {...inputProps} />
		</div>
	);
}
