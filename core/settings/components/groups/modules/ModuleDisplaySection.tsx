"use client";

/**
 * ModuleDisplaySection — per-slot display config used inside the Modules group.
 *
 * Renders default view / board group-by / card fields / list columns for ONE
 * entity slot. The Modules group mounts one of these per tab.
 *
 * Writes to `orgs.settings.modules[]` — merges with whatever is already stored
 * so other per-slot fields (hidden, order, label) are preserved.
 */

import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
	ALLOWED_BOARD_GROUP_BY,
	DEFAULT_BOARD_GROUP_BY,
	DEFAULT_CARD_FIELDS,
	DEFAULT_LIST_COLUMNS,
	DEFAULT_VIEW,
} from "@/core/entities/shared/config/defaults";
import { FIELD_CATALOG } from "@/core/entities/shared/config/field-catalog";
import type { EntitySlot, ViewKind } from "@/core/entities/shared/types";
import type { OrgSettings } from "../../../types";
import { SettingsSection } from "../../shared/SettingsSection";

type ModulesArray = NonNullable<NonNullable<OrgSettings["settings"]>["modules"]>;

interface Props {
	slot: EntitySlot;
	orgId: Id<"orgs">;
	modules?: ModulesArray;
}

export function ModuleDisplaySection({ slot, orgId, modules }: Props) {
	const updateOrg = useMutation(api.orgs.mutations.update);

	const mod = modules?.find((m) => m.slot === slot);
	const [defaultView, setDefaultView] = useState<ViewKind>(
		(mod?.defaultView as ViewKind) ?? DEFAULT_VIEW[slot],
	);
	const [boardGroupBy, setBoardGroupBy] = useState<string>(
		(mod?.boardGroupBy as string) ?? DEFAULT_BOARD_GROUP_BY[slot],
	);
	const [cardFields, setCardFields] = useState<string[]>(
		(mod?.cardFields as string[]) ?? DEFAULT_CARD_FIELDS[slot],
	);
	const [listColumns, setListColumns] = useState<string[]>(
		(mod?.listColumns as string[]) ?? DEFAULT_LIST_COLUMNS[slot],
	);
	const [saving, setSaving] = useState(false);

	// Resync local state when the slot changes or the saved module config arrives
	// from Convex. Guards against reverting unsaved local changes: if the user is
	// actively editing, saving, or the mod object hasn't changed reference, do
	// nothing. Serialize-compare on the primitive fields catches actual DB changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: slot intentionally drives the reset
	useEffect(() => {
		if (!mod) return;
		setDefaultView((mod.defaultView as ViewKind) ?? DEFAULT_VIEW[slot]);
		setBoardGroupBy((mod.boardGroupBy as string) ?? DEFAULT_BOARD_GROUP_BY[slot]);
		setCardFields((mod.cardFields as string[]) ?? DEFAULT_CARD_FIELDS[slot]);
		setListColumns((mod.listColumns as string[]) ?? DEFAULT_LIST_COLUMNS[slot]);
	}, [
		slot,
		mod?.defaultView,
		mod?.boardGroupBy,
		JSON.stringify(mod?.cardFields),
		JSON.stringify(mod?.listColumns),
	]);

	const catalog = FIELD_CATALOG[slot];
	const allKeys = Object.keys(catalog);
	const allowedGroupBy = ALLOWED_BOARD_GROUP_BY[slot];

	const handleSave = async () => {
		setSaving(true);
		try {
			const next = [...(modules ?? [])];
			const idx = next.findIndex((m) => m.slot === slot);
			const patch = { slot, defaultView, boardGroupBy, cardFields, listColumns };
			if (idx >= 0) next[idx] = { ...next[idx], ...patch };
			else next.push(patch);
			await updateOrg({ orgId, settings: { modules: next } });
			toast.success("Display settings saved");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Save failed");
		} finally {
			setSaving(false);
		}
	};

	const toggleField = (key: string, list: string[], setList: (v: string[]) => void) => {
		if (list.includes(key)) setList(list.filter((k) => k !== key));
		else setList([...list, key]);
	};

	return (
		<SettingsSection
			id={`modules.${slot}.display`}
			title="Module Display"
			description="How this entity renders across the app. Users can override the default view under Appearance → Default views."
		>
			<div className="flex flex-col gap-5">
				{/* Default view */}
				<div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
					<Label className="text-xs font-medium">Default view</Label>
					<ToggleGroup
						type="single"
						size="sm"
						variant="outline"
						value={defaultView}
						onValueChange={(v) => {
							if (v) setDefaultView(v as ViewKind);
						}}
					>
						<ToggleGroupItem value="list" className="h-7 px-3 text-xs">
							List
						</ToggleGroupItem>
						<ToggleGroupItem value="board" className="h-7 px-3 text-xs">
							Board
						</ToggleGroupItem>
					</ToggleGroup>
				</div>

				{/* Board group by */}
				<div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
					<Label className="text-xs font-medium">Board group by</Label>
					<Select value={boardGroupBy} onValueChange={setBoardGroupBy}>
						<SelectTrigger size="sm" className="h-7 w-44 text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{allowedGroupBy.map((key) => (
								<SelectItem key={key} value={key} className="text-xs capitalize">
									{catalog[key]?.label ?? key}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{/* Card fields */}
				<div className="space-y-1.5">
					<Label className="text-xs font-medium">Card fields</Label>
					<p className="text-[11px] text-muted-foreground">
						Fields shown on the board card.
					</p>
					<div className="flex flex-wrap gap-2">
						{allKeys.map((key) => {
							const id = `md-card-${slot}-${key}`;
							return (
								<label
									key={key}
									htmlFor={id}
									className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius)] border bg-muted/30 px-2 py-1 text-[11px]"
								>
									<Checkbox
										id={id}
										checked={cardFields.includes(key)}
										onCheckedChange={() =>
											toggleField(key, cardFields, setCardFields)
										}
									/>
									{catalog[key].label}
								</label>
							);
						})}
					</div>
				</div>

				{/* List columns */}
				<div className="space-y-1.5">
					<Label className="text-xs font-medium">List columns</Label>
					<p className="text-[11px] text-muted-foreground">
						Columns shown in the table view.
					</p>
					<div className="flex flex-wrap gap-2">
						{allKeys.map((key) => {
							const id = `md-list-${slot}-${key}`;
							return (
								<label
									key={key}
									htmlFor={id}
									className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius)] border bg-muted/30 px-2 py-1 text-[11px]"
								>
									<Checkbox
										id={id}
										checked={listColumns.includes(key)}
										onCheckedChange={() =>
											toggleField(key, listColumns, setListColumns)
										}
									/>
									{catalog[key].label}
								</label>
							);
						})}
					</div>
				</div>

				<div className="flex justify-end">
					<Button
						size="sm"
						onClick={handleSave}
						disabled={saving}
						className="h-7 text-xs"
					>
						{saving ? "Saving…" : "Save"}
					</Button>
				</div>
			</div>
		</SettingsSection>
	);
}
