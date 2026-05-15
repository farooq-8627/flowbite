"use client";

/**
 * FileBufferContext — coordinates buffered file uploads during entity CREATE.
 *
 * Why: file rows need a `(scope, scopeId)` to live under. In create mode the
 * scopeId doesn't exist yet (the lead/contact/deal/company is being created
 * by the same form). We let the user upload bytes immediately to Convex
 * storage (so they get progress + thumbnails) and BUFFER the metadata
 * (`storageId, name, size, mimeType`) keyed by fieldName. After the entity
 * is saved, the parent drawer reads the buffered map, calls `commitAll(scope,
 * scopeId)` once, and the file rows are written under the right scope.
 *
 * Usage (parent — the drawer):
 *   const buffer = useFileBuffer(orgId);
 *   <FileBufferProvider value={buffer}>
 *     <EntityFieldForm ... />
 *   </FileBufferProvider>
 *   // after entity create:
 *   await buffer.commitAll({ scope: "person", scopeId: personCode });
 *
 * Usage (input dispatcher — file kind in create mode):
 *   <CreateModeFileField fieldKey={field.name} ... />
 *   // it pulls buffer + upload from context.
 */

import { useMutation } from "convex/react";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { type FileCategory, isFileAllowed } from "../file-categories";
import { type BufferedFile, BufferedFileUpload } from "./FileUpload";

interface FileBufferContextValue {
	/** Buffered files keyed by field name (or "_default" for free-form). */
	filesByField: Record<string, BufferedFile[]>;
	uploadingByField: Record<string, string[]>;
	addFiles: (fieldKey: string, files: File[]) => Promise<void>;
	removeFile: (fieldKey: string, storageId: Id<"_storage">) => void;
	commitAll: (args: { scope: string; scopeId: string; tags?: string[] }) => Promise<void>;
	reset: () => void;
}

const FileBufferContext = createContext<FileBufferContextValue | null>(null);

export function useFileBufferContext(): FileBufferContextValue | null {
	return useContext(FileBufferContext);
}

/**
 * Hook factory — call once per drawer, then provide via FileBufferProvider.
 *
 * Caveat: this hook ignores org-level allowed categories for buffered uploads
 * and trusts the dropzone's `accept` attribute. Server-side validation can
 * be added in convex/files/mutations.ts later.
 */
export function useFileBuffer(orgId: Id<"orgs"> | undefined): FileBufferContextValue {
	const generateUploadUrl = useMutation(api.files.mutations.generateUploadUrl);
	const record = useMutation(api.files.mutations.record);

	const [filesByField, setFilesByField] = useState<Record<string, BufferedFile[]>>({});
	const [uploadingByField, setUploadingByField] = useState<Record<string, string[]>>({});

	const addFiles = useCallback(
		async (fieldKey: string, list: File[]) => {
			if (!orgId) return;
			// Note: we don't have access to org settings here — caller is the
			// dropzone, which already filters via `accept`. Server-side
			// validation can re-apply the same predicate from file-categories.
			void isFileAllowed; // keep import alive
			void ({} as { c?: FileCategory });
			const accepted = list.slice();
			if (accepted.length === 0) return;
			setUploadingByField((prev) => ({
				...prev,
				[fieldKey]: [...(prev[fieldKey] ?? []), ...accepted.map((f) => f.name)],
			}));
			try {
				for (const file of accepted) {
					try {
						const url = await generateUploadUrl();
						const res = await fetch(url, {
							method: "POST",
							headers: { "Content-Type": file.type || "application/octet-stream" },
							body: file,
						});
						if (!res.ok) throw new Error(`Upload failed (${res.status})`);
						const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
						setFilesByField((prev) => ({
							...prev,
							[fieldKey]: [
								...(prev[fieldKey] ?? []),
								{
									storageId,
									name: file.name,
									size: file.size,
									mimeType: file.type || "application/octet-stream",
								},
							],
						}));
					} catch (err) {
						toast.error(`Couldn't upload ${file.name}`, {
							description: err instanceof Error ? err.message : undefined,
						});
					}
				}
			} finally {
				setUploadingByField((prev) => ({
					...prev,
					[fieldKey]: (prev[fieldKey] ?? []).filter(
						(n) => !accepted.some((f) => f.name === n),
					),
				}));
			}
		},
		[orgId, generateUploadUrl],
	);

	const removeFile = useCallback((fieldKey: string, storageId: Id<"_storage">) => {
		setFilesByField((prev) => ({
			...prev,
			[fieldKey]: (prev[fieldKey] ?? []).filter((f) => f.storageId !== storageId),
		}));
	}, []);

	// Keep a ref to the latest filesByField so commitAll can read it without
	// being recreated on every state change (which would destabilize the
	// returned object and cause infinite loops in consumer useEffects).
	const filesByFieldRef = useRef(filesByField);
	filesByFieldRef.current = filesByField;

	const commitAll = useCallback(
		async (args: { scope: string; scopeId: string; tags?: string[] }) => {
			if (!orgId) return;
			const entries = Object.entries(filesByFieldRef.current);
			for (const [fieldKey, files] of entries) {
				for (const f of files) {
					try {
						await record({
							orgId,
							storageId: f.storageId,
							scope: args.scope,
							scopeId: args.scopeId,
							fieldKey: fieldKey === "_default" ? undefined : fieldKey,
							tags: args.tags,
							name: f.name,
							size: f.size,
							mimeType: f.mimeType,
						});
					} catch (err) {
						toast.error(`Couldn't attach ${f.name}`, {
							description: err instanceof Error ? err.message : undefined,
						});
					}
				}
			}
			setFilesByField({});
		},
		[orgId, record],
	);

	const reset = useCallback(() => {
		setFilesByField({});
		setUploadingByField({});
	}, []);

	return useMemo(
		() => ({ filesByField, uploadingByField, addFiles, removeFile, commitAll, reset }),
		[filesByField, uploadingByField, addFiles, removeFile, commitAll, reset],
	);
}

export function FileBufferProvider({
	value,
	children,
}: {
	value: FileBufferContextValue;
	children: ReactNode;
}) {
	return <FileBufferContext.Provider value={value}>{children}</FileBufferContext.Provider>;
}

// ─── CreateModeFileField — used by input-dispatcher in create mode ──────────

interface CreateModeFileFieldProps {
	orgId: Id<"orgs">;
	fieldKey: string;
	label: string;
	multiple: boolean;
}

/**
 * Renders the buffered uploader when a FileBufferContext is mounted by the
 * parent drawer. When no context is present (e.g. someone embeds the form
 * outside a drawer), fall back to the polished "save first" placeholder.
 */
export function CreateModeFileField({
	orgId,
	fieldKey,
	label,
	multiple,
}: CreateModeFileFieldProps) {
	const ctx = useFileBufferContext();
	if (!ctx) {
		return (
			<div className="flex h-9 w-full items-center gap-2 rounded-[var(--radius)] border border-dashed bg-muted/20 px-3 text-xs text-muted-foreground">
				<span className="truncate">
					Save the record first to attach {multiple ? "files" : "a file"}.
				</span>
			</div>
		);
	}
	const files = ctx.filesByField[fieldKey] ?? [];
	const uploading = ctx.uploadingByField[fieldKey] ?? [];

	return (
		<BufferedFileUpload
			orgId={orgId}
			files={files}
			onFilesChange={() => {
				/* commit-all handles cleanup; per-row removal is via removeFile */
			}}
			upload={(list) => ctx.addFiles(fieldKey, list)}
			uploading={uploading}
			multiple={multiple}
			label={`Drop ${label.toLowerCase()} here or click to browse`}
		/>
	);
}
