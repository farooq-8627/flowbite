"use client";

/**
 * core/ai/lib/uploadAttachments.ts
 *
 * Shared upload helper for AI chat attachments.
 *
 * Why this exists
 * ───────────────
 * Two surfaces upload files into the same conversation/file pipeline:
 *
 *   1. `ChatAttachButton` — click 📎 inside the chat composer.
 *   2. `AIQuickComposerCard` — drag-and-drop onto the dashboard composer.
 *
 * Both surfaces:
 *   - Lazily ensure a conversation exists before uploading (so a user can
 *     start a brand-new thread by attaching).
 *   - Call `files.generateUploadUrl` → POST file bytes → call
 *     `ai.chatAttachments.attach` → return a `fileId` per file.
 *   - Surface per-file failures via `sonner` toasts so a single failed
 *     file doesn't poison the whole batch.
 *
 * Lifting the logic into a hook keeps the upload behaviour identical
 * across surfaces and makes testing easier (the surfaces become thin
 * wrappers around the shared helper).
 *
 * Why a hook (not a plain function)
 * ─────────────────────────────────
 * `useMutation` must be called inside a React component / hook. Returning
 * a function from a hook keeps the mutation references stable across
 * renders (Convex reuses the same WS subscription).
 */

import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import { useCallback } from "react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";
import { normalizeErrorDescription } from "@/lib/normalizeError";

export type AttachmentInfo = {
	fileId: Id<"files">;
	name: string;
	mimeType: string;
	size: number;
};

type UploadOptions = {
	orgId: Id<"orgs">;
	/**
	 * Existing conversation; if `null` the caller's `onEnsureConversation`
	 * is invoked to lazy-create one.
	 */
	conversationId: Id<"aiConversations"> | null;
	/** Lazy-create a conversation when none exists. */
	onEnsureConversation: () => Promise<Id<"aiConversations">>;
};

export function useUploadAttachments() {
	const generateUploadUrl = useMutation(anyApi.files.mutations.generateUploadUrl);
	const attach = useMutation(anyApi.ai.chatAttachments.attach);

	/**
	 * Upload a list of files (FileList or File[]) into the given
	 * conversation. Returns successfully-uploaded attachments. Failed
	 * uploads surface a toast and are dropped from the result.
	 */
	const uploadFiles = useCallback(
		async (
			files: FileList | File[],
			{ orgId, conversationId, onEnsureConversation }: UploadOptions,
		): Promise<AttachmentInfo[]> => {
			const list = Array.from(files);
			if (list.length === 0) return [];

			const targetConversationId = conversationId ?? (await onEnsureConversation());
			const successful: AttachmentInfo[] = [];

			for (const file of list) {
				try {
					const uploadUrl = (await generateUploadUrl({})) as string;
					const res = await fetch(uploadUrl, {
						method: "POST",
						headers: { "Content-Type": file.type || "application/octet-stream" },
						body: file,
					});
					if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
					const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
					const result = (await attach({
						orgId,
						conversationId: targetConversationId,
						storageId,
						name: file.name,
						size: file.size,
						mimeType: file.type || "application/octet-stream",
					})) as { fileId: Id<"files"> };
					successful.push({
						fileId: result.fileId,
						name: file.name,
						mimeType: file.type || "application/octet-stream",
						size: file.size,
					});
				} catch (err) {
					toast.error(`Failed to attach ${file.name}`, {
						description: normalizeErrorDescription(err),
					});
				}
			}

			return successful;
		},
		[generateUploadUrl, attach],
	);

	return { uploadFiles };
}
