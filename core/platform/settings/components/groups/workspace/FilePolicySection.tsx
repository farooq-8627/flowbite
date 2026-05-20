"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/multi-select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FILE_CATEGORIES } from "@/core/data-io/files/file-categories";
import { normalizeErrorDescription } from "@/lib/normalizeError";
import type { OrgSettings } from "../../../types";
import { SettingsRow } from "../../shared/SettingsRow";
import { SettingsSection } from "../../shared/SettingsSection";

export function FilePolicySection({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const update = useMutation(api.orgs.mutations.update);
	const policy = org.settings?.fileUpload;
	const initialCategories = policy?.allowedMimeCategories ?? [];
	const initialMaxSize = policy?.maxSizeMb ?? 25;

	const [categories, setCategories] = useState<string[]>(initialCategories);
	const [maxSizeMb, setMaxSizeMb] = useState<number>(initialMaxSize);
	const [isSaving, setIsSaving] = useState(false);

	const isDirty =
		JSON.stringify([...categories].sort()) !== JSON.stringify([...initialCategories].sort()) ||
		maxSizeMb !== initialMaxSize;

	const fileCategoryOptions: MultiSelectOption[] = FILE_CATEGORIES.filter(
		(c) => c.id !== "other",
	).map((c) => ({
		value: c.id,
		label: c.label,
		subtitle: c.description,
	}));
	fileCategoryOptions.push({
		value: "other",
		label: "Anything else",
		subtitle: "Allow any file type — overrides the whitelist",
	});

	const handleSave = async () => {
		setIsSaving(true);
		try {
			await update({
				orgId,
				settings: {
					fileUpload: {
						allowedMimeCategories: categories,
						maxSizeMb,
					},
				},
			});
			toast.success("File policy saved");
		} catch (err) {
			toast.error("Couldn't save", {
				description: normalizeErrorDescription(err),
			});
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<SettingsSection
			id="workspace.file-policy"
			title="File Policy"
			description="Control what kinds of files team members can attach to records."
		>
			<SettingsRow
				label="Allowed file types"
				description="Leave empty to allow every category."
				controlClassName="sm:min-w-auto"
			>
				<MultiSelect
					value={categories}
					onChange={setCategories}
					options={fileCategoryOptions}
					placeholder="Allow all categories"
					searchPlaceholder="Search categories…"
					emptyText="No categories found."
				/>
			</SettingsRow>
			<SettingsRow
				label="Max file size (MB)"
				description="Per-file upload limit."
				controlClassName="sm:min-w-auto"
			>
				<Input
					type="number"
					min={1}
					value={maxSizeMb}
					onChange={(e) => setMaxSizeMb(Number(e.target.value || 25))}
					className="w-32"
				/>
			</SettingsRow>
			<div className="flex justify-end pt-2">
				<button
					type="button"
					disabled={!isDirty || isSaving}
					onClick={handleSave}
					className="rounded-[var(--radius)] bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
				>
					{isSaving ? "Saving…" : "Save"}
				</button>
			</div>
		</SettingsSection>
	);
}
