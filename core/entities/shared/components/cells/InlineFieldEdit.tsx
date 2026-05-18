"use client";

/**
 * InlineFieldEdit — empty-cell affordance for tables.
 *
 * UX (round 5):
 *   - Click `+` → tight popover with the field's input + Save.
 *   - **Pressing Enter or clicking Save closes the popover instantly.** The
 *     mutation runs in the background; toast surfaces success/failure. This
 *     fixes the prior "save freezes the popover for a second" feel.
 *   - **Esc cancels** without writing.
 *   - First-time hint banner inside the popover: a one-line tip about
 *     Enter-to-save, dismissed with the small × on the banner. Persists in
 *     `localStorage` under `flowbite:inline-edit:hint-seen` so the user only
 *     sees it once across the whole app.
 *
 * STORAGE
 *   - `field.storage === "fieldValues"` → `api.crm.fields.fieldValues.mutations.set`
 *   - `field.storage === "column"`      → per-slot update mutation
 *   - `field.type === "file" | "files"` → renders a small `<FileDropzone>`;
 *     uploaded files attach immediately (no Save button needed). The
 *     popover closes after the first file is queued.
 */

import { useMutation } from "convex/react";
import { PlusIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { FileDropzone, useFileAttachments } from "@/core/data-io/files/components/FileUpload";
import {
	useUpdateCompany,
	useUpdateContact,
	useUpdateDeal,
	useUpdateLead,
} from "@/core/entities/shared/hooks/useEntityMutations";
import type { EntitySlot } from "@/core/entities/shared/types";
import { cn } from "@/lib/utils";
import { type FieldDef, getInputRenderer } from "../inputs/input-dispatcher";

interface InlineFieldEditProps {
	field: FieldDef;
	orgId: Id<"orgs">;
	slot: EntitySlot;
	entityId: string;
	/** Pre-existing value (for re-edit; usually empty on this code path). */
	currentValue?: unknown;
	className?: string;
}

const HINT_KEY = "flowbite:inline-edit:hint-seen";

/**
 * Field kinds whose inline-edit UX would be poor in a tiny popover. They
 * keep the dispatcher's default "—" empty placeholder; the user opens the
 * full edit drawer for those.
 *
 * NOTE: file / files is supported here via the dropzone branch — kept OUT
 * of this skip list. Tags & assignee remain skipped because they have their
 * own dedicated UIs (TagsCell, PersonSelect).
 */
const SKIP_KINDS = new Set([
	"tags",
	"assignee",
	"personCode",
	"entityCode",
	"status",
	"company-ref",
	"displayName",
	"title",
]);
const SKIP_TYPES = new Set(["boolean"]);

export function isInlineEditable(field: FieldDef): boolean {
	if (field.kind && SKIP_KINDS.has(field.kind)) return false;
	if (SKIP_TYPES.has(field.type)) return false;
	return true;
}

export function InlineFieldEdit({
	field,
	orgId,
	slot,
	entityId,
	currentValue,
	className,
}: InlineFieldEditProps) {
	const [open, setOpen] = useState(false);
	const [value, setValue] = useState<unknown>(currentValue);
	const [showHint, setShowHint] = useState(true);

	// Read hint-seen state on mount (localStorage isn't available during SSR).
	useEffect(() => {
		try {
			if (window.localStorage.getItem(HINT_KEY) === "1") setShowHint(false);
		} catch {
			/* private mode — ignore */
		}
	}, []);

	const dismissHint = () => {
		setShowHint(false);
		try {
			window.localStorage.setItem(HINT_KEY, "1");
		} catch {
			/* ignore */
		}
	};

	// Reset local value whenever the popover closes.
	useEffect(() => {
		if (!open) setValue(currentValue);
	}, [open, currentValue]);

	const setFieldValue = useMutation(api.crm.fields.fieldValues.mutations.set);
	// Centralized — these hooks carry the optimistic update so the
	// user sees the new value the moment they hit Save (no flash).
	const updateLead = useUpdateLead();
	const updateContact = useUpdateContact();
	const updateDeal = useUpdateDeal();
	const updateCompany = useUpdateCompany();

	const persistColumn = (val: unknown) => {
		const key = field.columnKey ?? field.name;
		switch (slot) {
			case "lead":
				return updateLead({
					orgId,
					leadId: entityId as Id<"leads">,
					[key]: val,
				} as Parameters<typeof updateLead>[0]);
			case "contact":
				return updateContact({
					orgId,
					contactId: entityId as Id<"contacts">,
					[key]: val,
				} as Parameters<typeof updateContact>[0]);
			case "deal":
				return updateDeal({
					orgId,
					dealId: entityId as Id<"deals">,
					[key]: val,
				} as Parameters<typeof updateDeal>[0]);
			case "company":
				return updateCompany({
					orgId,
					companyId: entityId as Id<"companies">,
					[key]: val,
				} as Parameters<typeof updateCompany>[0]);
			default:
				return Promise.reject(new Error(`Inline edit not supported for slot "${slot}"`));
		}
	};

	const persistFieldValue = (val: unknown) =>
		setFieldValue({
			orgId,
			entityType: slot,
			entityId,
			fieldId: field._id,
			value: val,
		});

	/**
	 * Save fires-and-forgets — close the popover immediately so the UI feels
	 * instant. The mutation runs in the background; the reactive query updates
	 * the cell on success. Failure surfaces a toast. This is the canonical
	 * "optimistic" inline-edit feel.
	 */
	const handleSave = () => {
		// No-op cancel for empty input.
		if (value === undefined || value === null || value === "") {
			setOpen(false);
			return;
		}
		const work = field.storage === "column" ? persistColumn(value) : persistFieldValue(value);

		// Close right away.
		setOpen(false);

		// Fire-and-forget with a passive toast on success / explicit on error.
		void work.catch((err: unknown) => {
			toast.error(err instanceof Error ? err.message : `Couldn't save ${field.label}`);
		});
	};

	const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		const target = e.target as HTMLElement | null;
		if (target?.tagName === "TEXTAREA") return;
		if (e.key === "Enter") {
			e.preventDefault();
			handleSave();
		} else if (e.key === "Escape") {
			e.preventDefault();
			setOpen(false);
		}
	};

	const isFileField = field.type === "file" || field.type === "files";
	const renderer = getInputRenderer(field);

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label={`Add ${field.label}`}
					className={cn(
						"size-5 text-muted-foreground hover:text-foreground",
						"opacity-60 transition-opacity hover:opacity-100",
						className,
					)}
				>
					<PlusIcon className="size-3" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				className="w-64 p-0"
				align="start"
				sideOffset={4}
				onPointerDown={(e) => e.stopPropagation()}
				onClick={(e) => e.stopPropagation()}
			>
				{showHint && <HintBanner onDismiss={dismissHint} isFileField={isFileField} />}

				{/* biome-ignore lint/a11y/noStaticElementInteractions: keyboard handler isolates Enter/Esc to the inline editor only */}
				<div className="flex flex-col gap-2 p-2" onKeyDown={handleKeyDown}>
					<label
						htmlFor={`inline-${field._id}`}
						className="text-[11px] font-medium text-foreground/90"
					>
						{field.label}
					</label>

					{isFileField ? (
						<InlineFileSlot
							orgId={orgId}
							slot={slot}
							entityId={entityId}
							fieldKey={field.name}
							multiple={field.type === "files"}
							onUploaded={() => setOpen(false)}
						/>
					) : (
						<>
							<div className="w-full min-w-0">
								{renderer({
									field,
									slot,
									value,
									onChange: setValue,
									orgId,
									entityId,
								})}
							</div>
							<div className="flex items-center justify-end gap-1.5">
								<Button
									type="button"
									variant="ghost"
									size="xs"
									onClick={() => setOpen(false)}
								>
									Cancel
								</Button>
								<Button type="button" size="xs" onClick={handleSave}>
									Save
								</Button>
							</div>
						</>
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

/**
 * One-time hint banner inside the popover. Compact, dismissible, persists in
 * localStorage so it never shows again after the user has acknowledged it.
 * Different copy for file fields (no Enter-to-save semantics).
 */
function HintBanner({ onDismiss, isFileField }: { onDismiss: () => void; isFileField: boolean }) {
	return (
		<div className="flex items-start gap-1.5 border-b bg-muted/40 px-2 py-1.5 text-[10px] text-muted-foreground">
			<span className="leading-snug">
				{isFileField
					? "Drop a file or click to browse — the field saves automatically."
					: "Quick edit. Press Enter to save, Esc to cancel."}
			</span>
			<button
				type="button"
				onClick={onDismiss}
				aria-label="Don't show again"
				className="ms-auto shrink-0 rounded-[calc(var(--radius)-2px)] p-0.5 hover:bg-muted hover:text-foreground"
			>
				<XIcon className="size-3" />
			</button>
		</div>
	);
}

/**
 * File-field branch — a small dropzone that uploads immediately to the
 * `(slot, entityId, fieldKey)` scope. Calls `onUploaded` after the first
 * file lands so the popover can close.
 */
function InlineFileSlot({
	orgId,
	slot,
	entityId,
	fieldKey,
	multiple,
	onUploaded,
}: {
	orgId: Id<"orgs">;
	slot: EntitySlot;
	entityId: string;
	fieldKey: string;
	multiple: boolean;
	onUploaded: () => void;
}) {
	const { upload, uploading } = useFileAttachments({
		orgId,
		scope: slot,
		scopeId: entityId,
		fieldKey,
	});
	const closedRef = useRef(false);

	const handleFiles = (files: File[]) => {
		if (files.length === 0) return;
		void upload(files).then(() => {
			if (!closedRef.current) {
				closedRef.current = true;
				onUploaded();
			}
		});
	};

	return (
		<>
			<FileDropzone
				onFiles={handleFiles}
				multiple={multiple}
				label={
					multiple ? "Drop files or click to browse" : "Drop a file or click to browse"
				}
				className="py-3 text-[11px]"
			/>
			{uploading.length > 0 && (
				<p className="text-[10px] text-muted-foreground">Uploading {uploading.length}…</p>
			)}
		</>
	);
}
