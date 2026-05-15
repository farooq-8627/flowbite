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
 * Renders a unified, deduped, date-sorted list with the standard `<FileList>`
 * + an inline `<FileUpload>` to attach new files. Upload destination defaults
 * to the entity's own scope; pass `uploadScope`/`uploadScopeId` to override
 * (e.g. attach to the person profile instead of the deal).
 *
 * Used by Lead/Contact/Deal/Company detail views, Profile detail, and any
 * future entity that wants a Files tab. Zero per-call configuration beyond
 * the link keys.
 */

import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
	type AttachedFile,
	FileList,
	FileUpload,
} from "@/core/data-io/files/components/FileUpload";

type EntityType = "lead" | "contact" | "deal" | "company" | "user" | "org";

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
	// 1. Direct entity-scope files (uploaded to this exact record).
	const directFiles = useQuery(
		api.files.queries.listByScope,
		orgId ? { orgId, scope: entityType, scopeId: entityId } : "skip",
	);

	// 2. Cross-entity attribution: any file tagged "<entityType>:<entityId>".
	const tagged = useQuery(
		api.files.queries.listByTag,
		orgId ? { orgId, tag: `${entityType}:${entityId}` } : "skip",
	);

	// 3. (Optional) person-scope files for this person — surfaces lead/contact
	// attachments on the deal page when the deal references a personCode.
	const personFiles = useQuery(
		api.files.queries.listByScope,
		orgId && personCode ? { orgId, scope: "person", scopeId: personCode } : "skip",
	);

	const merged = useMemo<AttachedFile[]>(() => {
		const seen = new Set<string>();
		const out: AttachedFile[] = [];
		for (const list of [directFiles, tagged, personFiles]) {
			if (!list) continue;
			for (const f of list as AttachedFile[]) {
				const id = f._id as unknown as string;
				if (seen.has(id)) continue;
				seen.add(id);
				out.push(f);
			}
		}
		return out.sort((a, b) => b.createdAt - a.createdAt);
	}, [directFiles, tagged, personFiles]);

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
				<FileUpload
					orgId={orgId}
					scope={uploadScope ?? entityType}
					scopeId={uploadScopeId ?? entityId}
					multiple
					tags={[`${entityType}:${entityId}`]}
				/>
				<FileList
					files={merged}
					emptyText="No files attached yet. Drop one above to get started."
				/>
			</div>
		</section>
	);
}
