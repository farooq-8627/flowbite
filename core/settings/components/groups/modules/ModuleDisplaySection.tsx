"use client";

/**
 * ModuleDisplaySection — per-slot display config (Modules group).
 *
 * Layout note: this card uses the shared `<SettingsRow>` for label/control
 * alignment so it stays visually consistent with every other Settings page
 * (label on the left, control flush to the inline-end). Default View is a
 * tight icon-segmented control reusing the same `<ViewToggleIcons>` design
 * as the entity layout's view switcher — so users see one consistent affordance
 * for "list vs board" wherever it appears.
 *
 * Persists `defaultView` and `boardGroupBy`. Card fields and list columns are
 * driven by `fieldDefinitions.order` + `hidden` (managed in the Fields tab).
 */

import { useMutation } from "convex/react";
import { LayoutGridIcon, ListIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
	ALLOWED_BOARD_GROUP_BY,
	DEFAULT_BOARD_GROUP_BY,
	DEFAULT_VIEW,
} from "@/core/entities/shared/config/defaults";
import type { EntitySlot, ViewKind } from "@/core/entities/shared/types";
import { cn } from "@/lib/utils";
import type { OrgSettings } from "../../../types";
import { SettingsRow } from "../../shared/SettingsRow";
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
	const [isSaving, setIsSaving] = useState(false);

	const handleSave = async () => {
		setIsSaving(true);
		try {
			const next: ModulesArray = (modules ?? []).map((m) =>
				m.slot === slot ? { ...m, defaultView, boardGroupBy } : m,
			);
			if (!next.find((m) => m.slot === slot)) {
				next.push({
					slot,
					hidden: false,
					order: next.length,
					defaultView,
					boardGroupBy,
				} as ModulesArray[number]);
			}
			await updateOrg({ orgId, settings: { modules: next } });
			toast.success("Saved");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Couldn't save");
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<SettingsSection
			id={`modules.${slot}.display`}
			title="Display"
			description="How records are presented by default and which axis groups the board."
		>
			<SettingsRow
				label="Default view"
				description="What new visitors see when they open this module."
				compact
			>
				<ViewKindSegmented value={defaultView} onChange={setDefaultView} />
			</SettingsRow>

			<SettingsRow
				label="Group board by"
				description="Axis used to bucket records into columns on the board view."
			>
				<Select value={boardGroupBy} onValueChange={setBoardGroupBy}>
					<SelectTrigger className="h-9 w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{ALLOWED_BOARD_GROUP_BY[slot].map((g) => (
							<SelectItem key={g} value={g} className="capitalize">
								{labelForGroupBy(g)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</SettingsRow>

			<div className="flex justify-end pt-2">
				<Button size="sm" onClick={handleSave} disabled={isSaving}>
					{isSaving ? "Saving…" : "Save"}
				</Button>
			</div>
		</SettingsSection>
	);
}

// ─── Icon segmented control for list/board ───────────────────────────────────

function ViewKindSegmented({
	value,
	onChange,
}: {
	value: ViewKind;
	onChange: (next: ViewKind) => void;
}) {
	return (
		<div className="inline-flex h-8 items-center overflow-hidden rounded-[var(--radius)] border bg-background p-0.5">
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-pressed={value === "list"}
						onClick={() => onChange("list")}
						className={cn(
							"size-6 shrink-0 rounded-[calc(var(--radius)-2px)]",
							value === "list"
								? "bg-accent text-accent-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<ListIcon className="size-3.5" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>List view</TooltipContent>
			</Tooltip>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						aria-pressed={value === "board"}
						onClick={() => onChange("board")}
						className={cn(
							"size-6 shrink-0 rounded-[calc(var(--radius)-2px)]",
							value === "board"
								? "bg-accent text-accent-foreground"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<LayoutGridIcon className="size-3.5" />
					</Button>
				</TooltipTrigger>
				<TooltipContent>Board view</TooltipContent>
			</Tooltip>
		</div>
	);
}

function labelForGroupBy(key: string): string {
	switch (key) {
		case "status":
			return "Status";
		case "assignedTo":
			return "Assignee";
		case "source":
			return "Source";
		case "tag":
		case "tags":
			return "Tag";
		case "currentStageId":
			return "Stage";
		case "industry":
			return "Industry";
		default:
			return key.charAt(0).toUpperCase() + key.slice(1);
	}
}
