"use client";

/**
 * TagsCell — inline tag display + editor, self-contained.
 *
 * Owns its data: reads attached tags via `tags.queries.getTagsForEntity`
 * and writes via `attachToEntity` / `detachFromEntity`. Callers only pass
 * the link keys (orgId + entityType + entityId) so the same component works
 * for leads, contacts, deals, companies, or any future entity.
 *
 * UI:
 *   - No tags: (+) button → popover to pick tags.
 *   - Has tags: chip row + (✎) pencil on hover → popover.
 */

import { useMutation, useQuery } from "convex/react";
import { PencilIcon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface TagsCellProps {
	orgId: Id<"orgs"> | undefined;
	entityType: "lead" | "contact" | "deal" | "company" | string;
	entityId: string;
	/** Visual density — `xs` for table rows, `sm` for cards. */
	size?: "xs" | "sm";
	/** Max chips before a "+N" overflow chip. */
	max?: number;
	/**
	 * When true, hides the pencil-edit affordance once tags exist (display-only
	 * mode). The initial `+` button remains so empty records can still be
	 * tagged quickly. Used on cards where edit flows through the overflow menu.
	 */
	readOnlyAfterFirst?: boolean;
	className?: string;
}

export function TagsCell({
	orgId,
	entityType,
	entityId,
	size = "xs",
	max = 3,
	readOnlyAfterFirst = false,
	className,
}: TagsCellProps) {
	const [open, setOpen] = useState(false);
	const [inputValue, setInputValue] = useState("");

	const allTags = useQuery(api.crm.shared.tags.queries.listByOrg, orgId ? { orgId } : "skip");
	const attached = useQuery(
		api.crm.shared.tags.queries.getTagsForEntity,
		orgId ? { orgId, entityType, entityId } : "skip",
	);

	const attach = useMutation(api.crm.shared.tags.mutations.attachToEntity);
	const detach = useMutation(api.crm.shared.tags.mutations.detachFromEntity);
	const createTag = useMutation(api.crm.shared.tags.mutations.create);

	const attachedIds = useMemo(
		() =>
			new Set(
				(attached ?? [])
					.filter((t): t is NonNullable<typeof t> => t !== null)
					.map((t) => t._id as string),
			),
		[attached],
	);

	const options = allTags ?? [];
	const filtered = useMemo(() => {
		if (!inputValue) return options;
		const q = inputValue.toLowerCase();
		return options.filter((t) => t.name.toLowerCase().includes(q));
	}, [options, inputValue]);

	const tagRecords = (attached ?? [])
		.filter((t): t is NonNullable<typeof t> => t !== null)
		.map((t) => ({ name: t.name, color: t.color as string | undefined }));
	const visible = tagRecords.slice(0, max);
	const overflow = tagRecords.length - visible.length;
	const isEmpty = tagRecords.length === 0;

	const chipCls =
		size === "xs" ? "h-4 px-1 text-[9px] font-normal" : "h-5 px-1.5 text-[10px] font-normal";

	const toggleTag = async (tagId: Id<"tags">) => {
		if (!orgId) return;
		try {
			if (attachedIds.has(tagId as string)) {
				await detach({ orgId, tagId, entityType, entityId });
			} else {
				await attach({ orgId, tagId, entityType, entityId });
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Tag update failed");
		}
	};

	const createAndAttach = async () => {
		if (!orgId || !inputValue.trim()) return;
		try {
			const newTagId = await createTag({ orgId, name: inputValue.trim() });
			if (newTagId) {
				await attach({ orgId, tagId: newTagId, entityType, entityId });
				setInputValue("");
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't create tag");
		}
	};

	const exactMatch = options.find(
		(t) => t.name.toLowerCase() === inputValue.trim().toLowerCase(),
	);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<div className={cn("group/tagscell flex items-center gap-1", className)}>
				{isEmpty ? (
					<Tooltip>
						<TooltipTrigger asChild>
							<PopoverTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className={size === "xs" ? "size-5" : "size-6"}
									aria-label="Add tag"
								>
									<PlusIcon className={size === "xs" ? "size-3" : "size-3.5"} />
								</Button>
							</PopoverTrigger>
						</TooltipTrigger>
						<TooltipContent side="top" className="text-xs">
							Add tag
						</TooltipContent>
					</Tooltip>
				) : (
					<>
						{visible.map((tag) => (
							<Badge
								key={tag.name}
								variant="outline"
								className={chipCls}
								style={
									tag.color
										? {
												backgroundColor: `${tag.color}1a`,
												borderColor: `${tag.color}66`,
												color: tag.color,
											}
										: undefined
								}
							>
								{tag.name}
							</Badge>
						))}
						{overflow > 0 && (
							<Badge variant="secondary" className={chipCls}>
								+{overflow}
							</Badge>
						)}
						{!readOnlyAfterFirst && (
							<PopoverTrigger asChild>
								<Button
									variant="ghost"
									size="icon"
									className={cn(
										"size-5 opacity-0 transition-opacity group-hover/tagscell:opacity-100",
									)}
									aria-label="Edit tags"
								>
									<PencilIcon className="size-3" />
								</Button>
							</PopoverTrigger>
						)}
					</>
				)}
			</div>
			<PopoverContent className="w-64 p-0" align="start">
				<Command shouldFilter={false}>
					<CommandInput
						placeholder="Search or create tag…"
						value={inputValue}
						onValueChange={setInputValue}
					/>
					<CommandList>
						<CommandEmpty>
							{inputValue.trim() ? (
								<Button
									variant="ghost"
									size="sm"
									className="w-full justify-start"
									onClick={createAndAttach}
								>
									<PlusIcon className="me-2 size-3.5" />
									Create "{inputValue.trim()}"
								</Button>
							) : (
								"No tags yet."
							)}
						</CommandEmpty>
						<CommandGroup>
							{filtered.map((tag) => {
								const isOn = attachedIds.has(tag._id as string);
								return (
									<CommandItem
										key={tag._id}
										value={tag.name}
										onSelect={() => toggleTag(tag._id)}
									>
										<span
											aria-hidden
											className="me-2 inline-block size-2 shrink-0 rounded-full"
											style={{ backgroundColor: tag.color ?? "#94a3b8" }}
										/>
										<span className="flex-1 truncate text-sm">{tag.name}</span>
										{isOn && (
											<span className="text-xs text-muted-foreground">✓</span>
										)}
									</CommandItem>
								);
							})}
							{inputValue.trim() && !exactMatch && filtered.length > 0 && (
								<CommandItem
									value={`__create__${inputValue}`}
									onSelect={createAndAttach}
								>
									<PlusIcon className="me-2 size-3.5" />
									Create "{inputValue.trim()}"
								</CommandItem>
							)}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}
