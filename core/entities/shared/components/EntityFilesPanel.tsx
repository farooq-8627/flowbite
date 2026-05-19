"use client";

/**
 * EntityFilesPanel — universal Files panel for any entity detail view.
 *
 * Reads files from BOTH:
 *   1. Direct scope: `(scope=<entityType>, scopeId=<entityCode>)`
 *      e.g. files uploaded straight to a deal D-001 → `scope=deal, scopeId=D-001`.
 *   2. Cross-entity attribution by tag: `(tags contains "<entityType>:<entityCode>")`
 *      e.g. a person-scope file tagged `deal:D-001` → surfaces here without
 *      duplication.
 *
 * Optional `personCode` prop tells the panel to ALSO read direct person-scope
 * files for that personCode. Use it on the deal/contact/lead detail views so
 * an attachment uploaded to "the contact" appears on the deal too.
 *
 * Renders ONE merged, deduped, date-sorted list (`<FileList>`) plus an inline
 * dropzone (`<FileDropzone>`) to attach new files. Upload destination defaults
 * to the entity's own scope; pass `uploadScope`/`uploadScopeId` to override
 * (e.g. attach to the person profile instead of the deal).
 *
 * Why we don't use `<FileUpload>` (the dropzone+list combo) here
 * ─────────────────────────────────────────────────────────────
 *   `<FileUpload>` ships its own internal `<FileList>` driven by
 *   `useFileAttachments(...).files` which only returns DIRECT-scope files.
 *   Pairing it with our merged `<FileList>` (driven by `listForEntity`)
 *   produced TWO list rows for every direct-scope file — one with a trash
 *   icon (the inner FileUpload list) and one without (the merged list).
 *   Reported by user 2026-05-19: "see one set with trash icon and another
 *   without trash icon can you please remove the duplicate which dont have
 *   trash icon".
 *
 *   Fix: render the dropzone alone + the merged list alone, wired to the
 *   same `useFileAttachments.remove` mutation so the trash icon shows on
 *   every row regardless of which scope it came from.
 *
 * Used by Lead/Contact/Deal/Company detail views, Profile detail, and any
 * future entity that wants a Files tab. Zero per-call configuration beyond
 * the link keys.
 */

import { useQuery } from "convex/react";
import { useCallback, useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
	type AttachedFile,
	FileDropzone,
	FileList,
	useFileAttachments,
} from "@/core/data-io/files/components/FileUpload";

type EntityType = "lead" | "contact" | "deal" | "company" | "user" | "org" | "person";

interface EntityFilesPanelProps {
	orgId: Id<"orgs"> | undefined;
	/** Logical scope of this entity in the files table — typically the slot. */
	entityType: EntityType;
	/** Entity-side identifier — most often the public code (D-001, P-007). */
	entityId: string;
	/** Optional: also surface person-scope files for this personCode. */
	personCode?: string;
	/** Upload destination scope. Defaults to entityType. */
	uploadScope?: string;
	/** Upload destination scopeId. Defaults to entityId. */
	uploadScopeId?: string;
	/** Optional title above the panel. Empty = no header. */
	title?: string;
	/** Optional description below the title. */
	description?: string;
	className?: string;
}

export function EntityFilesPanel({
	orgId,
	entityType,
	entityId,
	personCode,
	uploadScope,
	uploadScopeId,
	title,
	description,
	className,
}: EntityFilesPanelProps) {
	const resolvedScope = uploadScope ?? entityType;
	const resolvedScopeId = uploadScopeId ?? entityId;

	// Upload + remove handlers. We attach a `tags` marker so cross-entity
	// queries (`listForEntity`) can surface the file via the tag-bridge even
	// when uploaded to a different scope (e.g. `personCode`). The hook's
	// own `files` list (direct-scope only) is intentionally ignored here —
	// we render the merged `listForEntity` result instead.
	const { upload, remove, uploading } = useFileAttachments({
		orgId,
		scope: resolvedScope,
		scopeId: resolvedScopeId,
	});

	// One query replaces the previous 3 subscriptions (direct + tagged + person scope).
	// Dedup + sort are done server-side.
	const merged = useQuery(
		api.files.queries.listForEntity,
		orgId
			? { orgId, scope: entityType, scopeId: entityId, ...(personCode ? { personCode } : {}) }
			: "skip",
	) as AttachedFile[] | undefined;

	const tags = useMemo(() => [`${entityType}:${entityId}`], [entityType, entityId]);

	const handleUpload = useCallback(
		(list: File[]) => {
			void upload(list, { tags });
		},
		[upload, tags],
	);

	if (!orgId) return null;

	return (
		<section className={className}>
			{(title || description) && (
				<header className="mb-2">
					{title && <h3 className="text-sm font-semibold leading-tight">{title}</h3>}
					{description && <p className="text-xs text-muted-foreground">{description}</p>}
				</header>
			)}

			<div className="flex flex-col gap-3">
				<FileDropzone onFiles={handleUpload} multiple />
				<FileList
					files={merged ?? []}
					uploading={uploading}
					onRemove={remove}
					emptyText="No files attached yet. Drop one above to get started."
				/>
			</div>
		</section>
	);
}
