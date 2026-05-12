"use client";

/**
 * UserEntityDefaultsSection — per-user default view override (Appearance settings).
 *
 * Per §9.8 of ENTITY_SCAFFOLDS_PLAN.md:
 * - Per slot: Workspace default / List / Board radio
 * - Saves to `users.preferences.entityDefaultView[slot]`
 * - "workspace" option = clear the override (inherit workspace default)
 *
 * Hooks into the precedence chain consumed by `useViewToggle(slot)`:
 *   URL ?view= → users.preferences.entityDefaultView → modules.defaultView → DEFAULT_VIEW
 */

import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { EntitySlot, ViewKind } from "@/core/entities/shared/types";
import { useEntityLabels } from "@/core/shared/hooks/useEntityLabels";

const SLOTS: EntitySlot[] = ["lead", "contact", "deal", "company"];

interface UserEntityDefaultsSectionProps {
	orgId: Id<"orgs">;
	userId: Id<"users">;
	currentPreferences?: Record<string, "list" | "board">;
}

export function UserEntityDefaultsSection({
	orgId,
	userId: _userId,
	currentPreferences,
}: UserEntityDefaultsSectionProps) {
	const labels = useEntityLabels(orgId);
	const updatePreferences = useMutation(api.users.mutations.updatePreferences);

	const [prefs, setPrefs] = useState<Record<string, ViewKind | "workspace">>(() =>
		Object.fromEntries(SLOTS.map((s) => [s, currentPreferences?.[s] ?? "workspace"])),
	);
	const [saving, setSaving] = useState(false);

	// Sync external changes (e.g. admin updated via another tab)
	useEffect(() => {
		setPrefs(
			Object.fromEntries(
				SLOTS.map((s) => [s, currentPreferences?.[s] ?? "workspace"]),
			) as Record<string, ViewKind | "workspace">,
		);
	}, [currentPreferences]);

	const isDirty = SLOTS.some((s) => {
		const current = currentPreferences?.[s] ?? "workspace";
		return prefs[s] !== current;
	});

	const handleSave = async () => {
		setSaving(true);
		try {
			const entityDefaultView: Record<string, "list" | "board"> = {};
			for (const slot of SLOTS) {
				const val = prefs[slot];
				if (val === "list" || val === "board") {
					entityDefaultView[slot] = val;
				}
			}
			await updatePreferences({ entityDefaultView });
			toast.success("Default view preferences saved");
		} catch (err) {
			toast.error("Failed to save", {
				description: err instanceof Error ? err.message : undefined,
			});
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="flex flex-col gap-3">
			{SLOTS.map((slot) => (
				<div
					key={slot}
					className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between"
				>
					<Label className="text-xs font-medium">{labels[slot].plural}</Label>
					<ToggleGroup
						type="single"
						size="sm"
						variant="outline"
						value={prefs[slot]}
						onValueChange={(v) => {
							if (!v) return;
							setPrefs((p) => ({
								...p,
								[slot]: v as ViewKind | "workspace",
							}));
						}}
						className="w-full sm:w-auto"
					>
						<ToggleGroupItem value="workspace" className="h-7 px-3 text-xs">
							Workspace default
						</ToggleGroupItem>
						<ToggleGroupItem value="list" className="h-7 px-3 text-xs">
							List
						</ToggleGroupItem>
						<ToggleGroupItem value="board" className="h-7 px-3 text-xs">
							Board
						</ToggleGroupItem>
					</ToggleGroup>
				</div>
			))}

			<div className="flex justify-end">
				<Button
					size="sm"
					onClick={handleSave}
					disabled={saving || !isDirty}
					className="h-7 text-xs"
				>
					{saving ? "Saving…" : "Save"}
				</Button>
			</div>
		</div>
	);
}
