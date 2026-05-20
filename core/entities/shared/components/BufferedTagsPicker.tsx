"use client";

/**
 * BufferedTagsPicker — single-select tag picker with the same UI as
 * `TagsCell` but backed by local state instead of the DB.
 *
 * Use this in CREATE-mode forms where the entity row doesn't exist yet, so
 * we can't write tag joins. The form holds the selected tag NAME in local
 * state; the parent attaches it after the entity is created.
 *
 * In EDIT mode forms, render `TagsCell` directly — it owns its data and
 * writes through to Convex on every pick.
 *
 * This file mirrors `TagsCell`'s trigger (chip + pencil-on-hover, or `+`
 * when empty) so the visual is identical between create and edit.
 */

import { useMutation } from "convex/react";
import { PencilIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useOrgTags } from "@/core/entities/shared/hooks/useOrgTags";
import { normalizeError } from "@/lib/normalizeError";
import { cn } from "@/lib/utils";
import { TagsPickerPopoverContent } from "./TagsPickerPopover";

interface BufferedTagsPickerProps {
	orgId: Id<"orgs"> | undefined;
	/** Currently buffered tag NAME (or undefined when none). */
	value: string | undefined;
	/** Buffer the chosen tag NAME (or undefined to clear). */
	onChange: (next: string | undefined) => void;
	size?: "xs" | "sm";
	className?: string;
}

export function BufferedTagsPicker({
	orgId,
	value,
	onChange,
	size = "sm",
	className,
}: BufferedTagsPickerProps) {
	const [open, setOpen] = useState(false);
	// Picker list — reads from the shared `<CrmDataProvider>` context, so
	// many BufferedTagsPickers on the same page share one subscription.
	// Gated on `open` so unopened pickers contribute zero.
	const allTags = useOrgTags(open ? orgId : undefined);
	const createTag = useMutation(api.crm.shared.tags.mutations.create);

	const options = useMemo(
		() =>
			(allTags ?? []).map((t) => ({
				id: t.name, // identifier-as-name (we buffer names not Ids in create mode)
				name: t.name,
				color: t.color as string | undefined,
			})),
		[allTags],
	);

	const currentTag = useMemo(
		() => (value ? options.find((o) => o.name === value) : undefined),
		[options, value],
	);

	const handleSelect = (name: string) => {
		setOpen(false);
		// Same-name twice → clear.
		if (value === name) {
			onChange(undefined);
			return;
		}
		onChange(name);
	};

	const handleCreate = async (name: string) => {
		if (!orgId) {
			// No org context — just buffer the name; the parent attaches later.
			onChange(name);
			setOpen(false);
			return;
		}
		setOpen(false);
		try {
			await createTag({ orgId, name });
			onChange(name);
		} catch (err) {
			toast.error(normalizeError(err, "Couldn't create tag"));
		}
	};

	const chipCls =
		size === "xs" ? "h-4 px-1 text-[9px] font-normal" : "h-5 px-1.5 text-[10px] font-normal";
	const isEmpty = !value;

	return (
		<Popover open={open} onOpenChange={setOpen} modal>
			<div className={cn("group/tagscell flex h-9 items-center gap-1", className)}>
				{isEmpty ? (
					<PopoverTrigger asChild>
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="h-9 w-full justify-start gap-2 px-3 text-sm font-normal text-muted-foreground"
						>
							<PlusIcon className="size-3.5" />
							<span className="truncate">Add tag</span>
						</Button>
					</PopoverTrigger>
				) : (
					<>
						<Badge
							variant="outline"
							className={chipCls}
							style={
								currentTag?.color
									? {
											backgroundColor: `${currentTag.color}1a`,
											borderColor: `${currentTag.color}66`,
											color: currentTag.color as string,
										}
									: undefined
							}
						>
							{value}
						</Badge>
						<PopoverTrigger asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="size-6 opacity-60 transition-opacity hover:opacity-100"
								aria-label="Change tag"
							>
								<PencilIcon className="size-3" />
							</Button>
						</PopoverTrigger>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="ms-auto h-7 px-2 text-[10px] text-muted-foreground"
							onClick={() => onChange(undefined)}
						>
							Clear
						</Button>
					</>
				)}
			</div>

			<PopoverContent
				className="w-64 p-0"
				align="start"
				sideOffset={4}
				onPointerDown={(e) => e.stopPropagation()}
				onClick={(e) => e.stopPropagation()}
			>
				<TagsPickerPopoverContent
					options={options}
					selectedId={value}
					onSelect={handleSelect}
					onCreate={orgId ? handleCreate : undefined}
				/>
			</PopoverContent>
		</Popover>
	);
}
