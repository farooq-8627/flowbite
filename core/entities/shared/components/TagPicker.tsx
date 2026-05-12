"use client";

/**
 * TagPicker — multi-select combobox over tags query (D16: search built-in).
 */

import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
} from "@/components/ui/combobox";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

interface TagPickerProps {
	orgId: Id<"orgs"> | undefined;
	value: string[];
	onChange: (tags: string[]) => void;
	placeholder?: string;
}

export function TagPicker({ orgId, value, onChange, placeholder = "Add tags…" }: TagPickerProps) {
	const tags = useQuery(api.crm.shared.tags.queries.listByOrg, orgId ? { orgId } : "skip");
	const [inputValue, setInputValue] = useState("");

	const options = useMemo(() => tags ?? [], [tags]);
	const filtered = useMemo(() => {
		if (!inputValue) return options;
		const q = inputValue.toLowerCase();
		return options.filter((t) => t.name.toLowerCase().includes(q));
	}, [options, inputValue]);

	const toggle = (tagName: string) => {
		if (value.includes(tagName)) {
			onChange(value.filter((t) => t !== tagName));
		} else {
			onChange([...value, tagName]);
		}
	};

	return (
		<div className="flex flex-col gap-2">
			{value.length > 0 && (
				<div className="flex flex-wrap gap-1">
					{value.map((t) => (
						<Badge key={t} variant="secondary" className="text-xs">
							{t}
							<button
								type="button"
								className="ms-1 text-muted-foreground hover:text-foreground"
								onClick={() => toggle(t)}
							>
								×
							</button>
						</Badge>
					))}
				</div>
			)}
			<Combobox
				value={null}
				onValueChange={(val) => {
					if (val) toggle(val as string);
				}}
			>
				<ComboboxInput
					placeholder={placeholder}
					value={inputValue}
					onChange={(e) => setInputValue(e.target.value)}
				/>
				<ComboboxContent>
					<ComboboxList>
						<ComboboxEmpty>No tags found</ComboboxEmpty>
						{filtered.map((tag) => (
							<ComboboxItem key={tag._id} value={tag.name}>
								<span className="text-sm">{tag.name}</span>
								{value.includes(tag.name) && (
									<span className="ms-auto text-xs text-muted-foreground">✓</span>
								)}
							</ComboboxItem>
						))}
					</ComboboxList>
				</ComboboxContent>
			</Combobox>
		</div>
	);
}
