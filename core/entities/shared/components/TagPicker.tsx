"use client";

/**
 * TagPicker — multi-select tag input built on the universal MultiSelect.
 *
 * Replaces the pre-Round-5 chip-list trigger. Now the trigger reads
 * "N tags selected" (or the placeholder when empty); the popover has the
 * standard left-content + right-checkbox row treatment.
 *
 * Create-on-the-fly: when the search query has no exact match, a "Create
 * '<query>'" row appears below the results. Clicking it calls the tag
 * `create` mutation and selects the new tag.
 */

import { useMutation, useQuery } from "convex/react";
import { useMemo } from "react";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

interface TagPickerProps {
	orgId: Id<"orgs"> | undefined;
	/** Currently-selected tag NAMES. */
	value: string[];
	onChange: (tags: string[]) => void;
	placeholder?: string;
	disabled?: boolean;
}

interface TagOption extends MultiSelectOption {
	color?: string;
}

export function TagPicker({
	orgId,
	value,
	onChange,
	placeholder = "Add tags…",
	disabled,
}: TagPickerProps) {
	const tags = useQuery(api.crm.shared.tags.queries.listByOrg, orgId ? { orgId } : "skip");
	const createTag = useMutation(api.crm.shared.tags.mutations.create);

	const options: TagOption[] = useMemo(
		() =>
			(tags ?? []).map((t) => ({
				value: t.name,
				label: t.name,
				color: t.color as string | undefined,
			})),
		[tags],
	);

	const handleCreate = async (label: string): Promise<string | undefined> => {
		if (!orgId) return undefined;
		try {
			await createTag({ orgId, name: label });
			return label; // selecting by name
		} catch {
			return undefined;
		}
	};

	return (
		<MultiSelect<TagOption>
			value={value}
			onChange={onChange}
			options={options}
			placeholder={placeholder}
			searchPlaceholder="Search or create tag…"
			emptyText="No tags yet."
			onCreate={orgId ? handleCreate : undefined}
			disabled={disabled}
			renderRow={(option) => (
				<div className="flex min-w-0 flex-1 items-center gap-2">
					{option.color && (
						<span
							aria-hidden
							className="inline-block size-2 shrink-0 rounded-full"
							style={{ backgroundColor: option.color }}
						/>
					)}
					<span className="truncate text-sm">{option.label}</span>
				</div>
			)}
		/>
	);
}
