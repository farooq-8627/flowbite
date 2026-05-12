"use client";

/**
 * File storage UI — reusable dropzone, list, and upload hook.
 *
 * Paired with the generic `convex/files/*` module. Drop these anywhere in the
 * app — they work for leads, contacts, deals, companies, user profiles, the
 * org itself, or any custom dynamic file field.
 *
 * Usage (typical):
 *   const { files, upload, remove } = useFileAttachments({ orgId, scope:"lead", scopeId: leadId });
 *   <FileDropzone onFiles={upload} />
 *   <FileList files={files} onRemove={remove} />
 *
 * No bespoke code per entity — scope + scopeId fully define the bucket.
 */

import { useMutation, useQuery } from "convex/react";
import { ImageIcon, Loader2Icon, PaperclipIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AttachedFile = {
	_id: Id<"files">;
	orgId: Id<"orgs">;
	storageId: Id<"_storage">;
	name: string;
	size: number;
	mimeType: string;
	createdAt: number;
	url: string | null;
};

export interface UseFileAttachmentsArgs {
	orgId: Id<"orgs"> | undefined;
	scope: string;
	scopeId: string;
	fieldKey?: string;
}

// ─── Hook: one-stop upload/list/remove ────────────────────────────────────────

export function useFileAttachments({ orgId, scope, scopeId, fieldKey }: UseFileAttachmentsArgs) {
	const byScope = useQuery(
		api.files.queries.listByScope,
		orgId && scopeId && !fieldKey ? { orgId, scope, scopeId } : "skip",
	);
	const byField = useQuery(
		api.files.queries.listByField,
		orgId && scopeId && fieldKey ? { orgId, scope, scopeId, fieldKey } : "skip",
	);
	const files = (fieldKey ? byField : byScope) as AttachedFile[] | undefined;

	const generateUploadUrl = useMutation(api.files.mutations.generateUploadUrl);
	const record = useMutation(api.files.mutations.record);
	const removeMutation = useMutation(api.files.mutations.remove);

	const [uploading, setUploading] = useState<string[]>([]);

	const upload = useCallback(
		async (list: File[]) => {
			if (!orgId) return;
			setUploading((prev) => [...prev, ...list.map((f) => f.name)]);
			try {
				for (const file of list) {
					try {
						const url = await generateUploadUrl();
						const res = await fetch(url, {
							method: "POST",
							headers: { "Content-Type": file.type || "application/octet-stream" },
							body: file,
						});
						if (!res.ok) throw new Error(`Upload failed (${res.status})`);
						const { storageId } = (await res.json()) as {
							storageId: Id<"_storage">;
						};
						await record({
							orgId,
							storageId,
							scope,
							scopeId,
							fieldKey,
							name: file.name,
							size: file.size,
							mimeType: file.type || "application/octet-stream",
						});
					} catch (err) {
						toast.error(`Couldn't upload ${file.name}`, {
							description: err instanceof Error ? err.message : undefined,
						});
					}
				}
			} finally {
				setUploading((prev) => prev.filter((n) => !list.some((f) => f.name === n)));
			}
		},
		[orgId, generateUploadUrl, record, scope, scopeId, fieldKey],
	);

	const remove = useCallback(
		async (fileId: Id<"files">) => {
			if (!orgId) return;
			try {
				await removeMutation({ orgId, fileId });
			} catch (err) {
				toast.error("Couldn't delete file", {
					description: err instanceof Error ? err.message : undefined,
				});
			}
		},
		[orgId, removeMutation],
	);

	return { files: files ?? [], upload, remove, uploading };
}

// ─── FileDropzone ─────────────────────────────────────────────────────────────

interface FileDropzoneProps {
	onFiles: (files: File[]) => void;
	/** MIME type filter (e.g. ["image/*","application/pdf"]). Omit for anything. */
	accept?: string;
	multiple?: boolean;
	disabled?: boolean;
	label?: string;
	className?: string;
}

export function FileDropzone({
	onFiles,
	accept,
	multiple = true,
	disabled,
	label = "Drop files here or click to browse",
	className,
}: FileDropzoneProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [dragOver, setDragOver] = useState(false);

	const handle = (list: FileList | null) => {
		if (!list || list.length === 0) return;
		onFiles(Array.from(list));
	};

	return (
		<button
			type="button"
			disabled={disabled}
			onClick={() => inputRef.current?.click()}
			onDragOver={(e) => {
				e.preventDefault();
				if (!disabled) setDragOver(true);
			}}
			onDragLeave={() => setDragOver(false)}
			onDrop={(e) => {
				e.preventDefault();
				setDragOver(false);
				if (disabled) return;
				handle(e.dataTransfer.files);
			}}
			className={cn(
				"flex w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-dashed px-4 py-6 text-xs text-muted-foreground transition-colors",
				"hover:border-ring/40 hover:text-foreground",
				dragOver && "border-ring bg-accent/30 text-foreground",
				disabled && "pointer-events-none opacity-50",
				className,
			)}
		>
			<UploadIcon className="size-4" />
			<span>{label}</span>
			<input
				ref={inputRef}
				type="file"
				accept={accept}
				multiple={multiple}
				className="hidden"
				onChange={(e) => {
					handle(e.target.files);
					if (inputRef.current) inputRef.current.value = "";
				}}
			/>
		</button>
	);
}

// ─── FileList ─────────────────────────────────────────────────────────────────

interface FileListProps {
	files: AttachedFile[];
	uploading?: string[];
	onRemove?: (fileId: Id<"files">) => void;
	className?: string;
	emptyText?: string;
}

export function FileList({
	files,
	uploading = [],
	onRemove,
	className,
	emptyText = "No files yet.",
}: FileListProps) {
	if (files.length === 0 && uploading.length === 0) {
		return <p className={cn("text-xs text-muted-foreground", className)}>{emptyText}</p>;
	}

	return (
		<ul className={cn("flex flex-col gap-1.5", className)}>
			{uploading.map((name) => (
				<li
					key={`upl-${name}`}
					className="flex items-center gap-2 rounded-[var(--radius)] border bg-muted/30 px-2 py-1.5 text-xs"
				>
					<Loader2Icon className="size-3.5 animate-spin text-muted-foreground" />
					<span className="flex-1 truncate">{name}</span>
					<span className="text-[10px] text-muted-foreground">Uploading…</span>
				</li>
			))}
			{files.map((f) => (
				<li
					key={f._id}
					className="group/file flex items-center gap-2 rounded-[var(--radius)] border bg-card px-2 py-1.5 text-xs"
				>
					<FileIconForType mimeType={f.mimeType} />
					<a
						href={f.url ?? "#"}
						target="_blank"
						rel="noopener noreferrer"
						className="flex-1 truncate hover:underline"
					>
						{f.name}
					</a>
					<span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
						{formatSize(f.size)}
					</span>
					{onRemove && (
						<Button
							size="icon"
							variant="ghost"
							className="size-5 opacity-0 transition-opacity group-hover/file:opacity-100"
							onClick={() => onRemove(f._id)}
							aria-label={`Remove ${f.name}`}
						>
							<Trash2Icon className="size-3 text-destructive" />
						</Button>
					)}
				</li>
			))}
		</ul>
	);
}

// ─── FileUpload — dropzone + list together ────────────────────────────────────

interface FileUploadProps extends UseFileAttachmentsArgs {
	accept?: string;
	multiple?: boolean;
	label?: string;
	emptyText?: string;
	className?: string;
}

export function FileUpload(props: FileUploadProps) {
	const { files, upload, remove, uploading } = useFileAttachments(props);
	return (
		<div className={cn("flex flex-col gap-2", props.className)}>
			<FileDropzone
				onFiles={upload}
				accept={props.accept}
				multiple={props.multiple}
				label={props.label}
			/>
			<FileList
				files={files}
				uploading={uploading}
				onRemove={remove}
				emptyText={props.emptyText}
			/>
		</div>
	);
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function FileIconForType({ mimeType }: { mimeType: string }) {
	if (mimeType.startsWith("image/")) {
		return <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" />;
	}
	return <PaperclipIcon className="size-3.5 shrink-0 text-muted-foreground" />;
}

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
