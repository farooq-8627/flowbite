"use client";
/**
 * core/ai/components/composer/ChatAttachButton.tsx
 *
 * Phase 4 Part 2 — File attach affordance for the AI chat composer.
 *
 * Renders a paperclip button that:
 *   1. Opens a hidden file picker (multi-select).
 *   2. Delegates to `useUploadAttachments()` (see
 *      `core/ai/lib/uploadAttachments.ts`) which handles the
 *      upload-URL → POST → attach round-trip and surfaces per-file
 *      failures via sonner toasts.
 *   3. Reports each successful upload via `onAttached(...)` so the
 *      composer can render a chip and inject `[Attached
 *      file:fileId "name"]` into the body on send.
 *
 * Both this button AND the dashboard's drag-drop affordance share
 * `useUploadAttachments()`, so the upload behaviour is identical.
 *
 * The composer caller is responsible for ensuring a conversation
 * exists before files can be attached — when it doesn't yet, the
 * helper invokes `onEnsureConversation` to lazy-create one.
 */
import { Loader2Icon, PaperclipIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Id } from "@/convex/_generated/dataModel";
import { type AttachmentInfo, useUploadAttachments } from "@/core/ai/lib/uploadAttachments";

type Props = {
	orgId: Id<"orgs"> | undefined;
	conversationId: Id<"aiConversations"> | null;
	disabled?: boolean;
	onAttached: (info: AttachmentInfo) => void;
	onEnsureConversation: () => Promise<Id<"aiConversations">>;
};

export function ChatAttachButton({
	orgId,
	conversationId,
	disabled,
	onAttached,
	onEnsureConversation,
}: Props) {
	const fileInputRef = useRef<HTMLInputElement>(null);
	const [busy, setBusy] = useState(false);
	const { uploadFiles } = useUploadAttachments();

	async function handleFiles(files: FileList | null) {
		if (!files || files.length === 0 || !orgId) return;
		setBusy(true);
		try {
			const uploaded = await uploadFiles(files, {
				orgId,
				conversationId,
				onEnsureConversation,
			});
			for (const att of uploaded) onAttached(att);
		} finally {
			setBusy(false);
			if (fileInputRef.current) fileInputRef.current.value = "";
		}
	}

	return (
		<>
			<input
				ref={fileInputRef}
				type="file"
				multiple
				className="sr-only"
				onChange={(e) => void handleFiles(e.target.files)}
			/>
			<Button
				type="button"
				size="icon"
				variant="ghost"
				className="size-8 shrink-0"
				disabled={busy || disabled}
				onClick={() => fileInputRef.current?.click()}
				aria-label="Attach files"
				title="Attach files"
			>
				{busy ? (
					<Loader2Icon className="size-4 animate-spin" />
				) : (
					<PaperclipIcon className="size-4" />
				)}
			</Button>
		</>
	);
}
