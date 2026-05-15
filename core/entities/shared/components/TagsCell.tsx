"use client";

/**
 * TagsCell — inline tag display + editor, self-contained.
 *
 * SELECTION SEMANTICS — **single-select**. Each entity has at most one tag;
 * picking a new tag detaches whichever tag was previously attached and
 * attaches the new one. Picking the currently-attached tag clears it. The
 * popover closes immediately after a pick.
 *
 * UI is shared with `BufferedTagsPicker` (forms in create-mode) via
 * `TagsPickerPopoverContent` so every place a user picks a tag looks and
 * feels identical: search box, single-line rows with a coloured dot + check
 * mark, create-on-the-fly affordance.
 *
 * First-time tour anchor: `data-tour="tags-cell-add"` on the empty + button.
 */

import { useMutation, useQuery } from "convex/react";
import { PencilIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { TagsPickerPopoverContent } from "./TagsPickerPopover";

interface TagsCellProps {
	orgId: Id<"orgs"> | undefined;
	entityType: "lead" | "contact" | "deal" | "company" | string;
	entityId: string;
	/** Visual density — `xs` for table rows, `sm` for cards. */
	size?: "xs" | "sm";
	/**
	 * When true, hides the pencil-edit affordance once a tag is set
	 * (display-only mode). The initial `+` button remains so empty records
	 * can still be tagged quickly. Used on cards where edit flows through
	 * the overflow menu.
	 */
	readOnlyAfterFirst?: boolean;
	className?: string;
}

export function TagsCell({
	orgId,
	entityType,
	entityId,
	size = "xs",
	readOnlyAfterFirst = false,
	className,
}: TagsCellProps) {
	const [open, setOpen] = useState(false);

	const allTags = useQuery(api.crm.shared.tags.queries.listByOrg, orgId ? { orgId } : "skip");
	const attached = useQuery(
		api.crm.shared.tags.queries.getTagsForEntity,
		orgId ? { orgId, entityType, entityId } : "skip",
	);

	const attach = useMutation(api.crm.shared.tags.mutations.attachToEntity);
	const detach = useMutation(api.crm.shared.tags.mutations.detachFromEntity);
	const createTag = useMutation(api.crm.shared.tags.mutations.create);

	const attachedTags = useMemo(
		() => (attached ?? []).filter((t): t is NonNullable<typeof t> => t !== null),
		[attached],
	);
	const currentTag = attachedTags[0];
	const currentId = currentTag?._id as string | undefined;

	const options = useMemo(
		() =>
			(allTags ?? []).map((t) => ({
				id: t._id as string,
				name: t.name,
				color: t.color as string | undefined,
			})),
		[allTags],
	);

	const chipCls =
		size === "xs" ? "h-4 px-1 text-[9px] font-normal" : "h-5 px-1.5 text-[10px] font-normal";
	const isEmpty = !currentTag;

	/** Replace the attached tag with `tagId`. Same id twice = clear. */
	const selectTag = async (tagId: string) => {
		if (!orgId) return;
		setOpen(false);
		try {
			await Promise.all(
				attachedTags.map((t) =>
					detach({
						orgId,
						tagId: t._id,
						entityType,
						entityId,
					}),
				),
			);
			if (currentId !== tagId) {
				await attach({
					orgId,
					tagId: tagId as Id<"tags">,
					entityType,
					entityId,
				});
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Tag update failed");
		}
	};

	const createAndSelect = async (name: string) => {
		if (!orgId) return;
		setOpen(false);
		try {
			const newTagId = await createTag({ orgId, name });
			if (!newTagId) return;
			await Promise.all(
				attachedTags.map((t) =>
					detach({
						orgId,
						tagId: t._id,
						entityType,
						entityId,
					}),
				),
			);
			await attach({ orgId, tagId: newTagId, entityType, entityId });
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't create tag");
		}
	};

	return (
		<Popover open={open} onOpenChange={setOpen} modal>
			<div className={cn("group/tagscell flex items-center gap-1", className)}>
				{isEmpty ? (
					<PopoverTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className={size === "xs" ? "size-5" : "size-6"}
							aria-label="Add tag"
							data-tour="tags-cell-add"
						>
							<PlusIcon className={size === "xs" ? "size-3" : "size-3.5"} />
						</Button>
					</PopoverTrigger>
				) : (
					<>
						<Badge
							variant="outline"
							className={chipCls}
							style={
								currentTag.color
									? {
											backgroundColor: `${currentTag.color}1a`,
											borderColor: `${currentTag.color}66`,
											color: currentTag.color as string,
										}
									: undefined
							}
						>
							{currentTag.name}
						</Badge>
						{!readOnlyAfterFirst && (
							<PopoverTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className={cn(
										"size-5 opacity-0 transition-opacity group-hover/tagscell:opacity-100",
									)}
									aria-label="Change tag"
								>
									<PencilIcon className="size-3" />
								</Button>
							</PopoverTrigger>
						)}
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
					selectedId={currentId}
					onSelect={selectTag}
					onCreate={createAndSelect}
				/>
			</PopoverContent>
		</Popover>
	);
}
