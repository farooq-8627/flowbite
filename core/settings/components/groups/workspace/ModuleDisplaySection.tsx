"use client";

/**
 * ModuleDisplaySection — admin controls for per-slot defaultView, boardGroupBy,
 * cardFields, and listColumns. Lives in Settings → Workspace → CRM group.
 *
 * Per §9.7 of ENTITY_SCAFFOLDS_PLAN.md:
 * - Default view: radio (list/board)
 * - Board group by: select from ALLOWED_BOARD_GROUP_BY
 * - Card fields: multi-select (reorder deferred to future with @dnd-kit)
 * - List columns: multi-select (reorder deferred)
 */

import { useMutation } from "convex/react";
import { useState } from "react";
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
import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";

const SLOTS: EntitySlot[] = ["lead", "contact", "deal", "company"];

interface ModuleDisplaySectionProps {
	orgId: Id<"orgs">;
	modules?: Array<Record<string, unknown>>;
}

export function ModuleDisplaySection({ orgId, modules }: ModuleDisplaySectionProps) {
	const labels = useEntityLabels(orgId);
	const updateOrg = useMutation(api.orgs.mutations.update);

	const getModuleConfig = (slot: EntitySlot) => {
		const mod = modules?.find((m) => m.slot === slot);
		return {
			defaultView: (mod?.defaultView as ViewKind) ?? DEFAULT_VIEW[slot],
			boardGroupBy: (mod?.boardGroupBy as string) ?? DEFAULT_BOARD_GROUP_BY[slot],
			cardFields: (mod?.cardFields as string[]) ?? DEFAULT_CARD_FIELDS[slot],
			listColumns: (mod?.listColumns as string[]) ?? DEFAULT_LIST_COLUMNS[slot],
		};
	};

	return (
		<div className="flex flex-col gap-6">
			{SLOTS.map((slot) => (
				<SlotConfig
					key={slot}
					slot={slot}
					label={labels[slot].plural}
					orgId={orgId}
					config={getModuleConfig(slot)}
					modules={modules}
					onSave={(args) => updateOrg(args as Parameters<typeof updateOrg>[0])}
				/>
			))}
		</div>
	);
}

function SlotConfig({
	slot,
	label,
	orgId,
	config,
	modules,
	onSave,
}: {
	slot: EntitySlot;
	label: string;
	orgId: Id<"orgs">;
	config: {
		defaultView: ViewKind;
		boardGroupBy: string;
		cardFields: string[];
		listColumns: string[];
	};
	modules?: Array<Record<string, unknown>>;
	onSave: (args: Record<string, unknown>) => Promise<unknown>;
}) {
	const [defaultView, setDefaultView] = useState(config.defaultView);
	const [boardGroupBy, setBoardGroupBy] = useState(config.boardGroupBy);
	const [cardFields, setCardFields] = useState(config.cardFields);
	const [listColumns, setListColumns] = useState(config.listColumns);
	const [saving, setSaving] = useState(false);

	const catalog = FIELD_CATALOG[slot];
	const allKeys = Object.keys(catalog);
	const allowedGroupBy = ALLOWED_BOARD_GROUP_BY[slot];

	const handleSave = async () => {
		setSaving(true);
		try {
			const updatedModules = [...(modules ?? [])];
			const idx = updatedModules.findIndex((m) => m.slot === slot);
			const patch = { slot, defaultView, boardGroupBy, cardFields, listColumns };
			if (idx >= 0) {
				updatedModules[idx] = { ...updatedModules[idx], ...patch };
			} else {
				updatedModules.push(patch);
			}
			await onSave({ orgId, settings: { modules: updatedModules } });
			toast.success(`${label} display settings saved`);
		} catch {
			toast.error("Failed to save");
		} finally {
			setSaving(false);
		}
	};

	const toggleField = (key: string, list: string[], setList: (v: string[]) => void) => {
		if (list.includes(key)) setList(list.filter((k) => k !== key));
		else setList([...list, key]);
	};

	return (
		<div className="rounded-[var(--radius)] border p-4">
			<h4 className="mb-3 text-sm font-semibold">{label}</h4>

			<div className="flex flex-col gap-4">
				{/* Default view */}
				<div className="flex items-center gap-4">
					<Label className="w-28 text-xs">Default view</Label>
					<div className="flex gap-3">
						<label className="flex items-center gap-1.5 text-xs">
							<input
								type="radio"
								checked={defaultView === "list"}
								onChange={() => setDefaultView("list")}
								className="accent-primary"
							/>
							List
						</label>
						<label className="flex items-center gap-1.5 text-xs">
							<input
								type="radio"
								checked={defaultView === "board"}
								onChange={() => setDefaultView("board")}
								className="accent-primary"
							/>
							Board
						</label>
					</div>
				</div>

				{/* Board group by */}
				<div className="flex items-center gap-4">
					<Label className="w-28 text-xs">Board group by</Label>
					<Select value={boardGroupBy} onValueChange={setBoardGroupBy}>
						<SelectTrigger className="h-8 w-40">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{allowedGroupBy.map((key) => (
								<SelectItem key={key} value={key} className="capitalize text-xs">
									{catalog[key]?.label ?? key}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				{/* Card fields */}
				<div>
					<p className="mb-1.5 text-xs font-medium">Card fields</p>
					<div className="flex flex-wrap gap-2">
						{allKeys.map((key) => (
							<span key={key} className="flex items-center gap-1 text-xs">
								<Checkbox
									checked={cardFields.includes(key)}
									onCheckedChange={() =>
										toggleField(key, cardFields, setCardFields)
									}
								/>
								{catalog[key].label}
							</span>
						))}
					</div>
				</div>

				{/* List columns */}
				<div>
					<p className="mb-1.5 text-xs font-medium">List columns</p>
					<div className="flex flex-wrap gap-2">
						{allKeys.map((key) => (
							<span key={key} className="flex items-center gap-1 text-xs">
								<Checkbox
									checked={listColumns.includes(key)}
									onCheckedChange={() =>
										toggleField(key, listColumns, setListColumns)
									}
								/>
								{catalog[key].label}
							</span>
						))}
					</div>
				</div>

				<Button size="sm" onClick={handleSave} disabled={saving} className="w-fit">
					{saving ? "Saving…" : "Save"}
				</Button>
			</div>
		</div>
	);
}
