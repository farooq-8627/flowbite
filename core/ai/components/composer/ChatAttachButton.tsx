"use client";
/**
 * core/ai/components/composer/ChatAttachButton.tsx
 *
 * Phase 4 Part 2 — File attach affordance for the AI chat composer.
 *
 * Renders a paperclip button that:
 *   1. Opens a hidden file picker (multi-select).
 *   2. Generates an upload URL via `files.generateUploadUrl`.
 *   3. POSTs each file to that URL → receives a `storageId`.
 *   4. Calls `ai/chatAttachments:attach` to record the file row scoped
 *      to the active conversation. Returns `{ fileId }`.
 *   5. Reports each successful upload via `onAttached(fileId, name, mimeType, size)`
 *      so the composer can render a chip and inject `[Attached
 *      file:fileId "name"]` into the body on send.
 *
 * The composer caller is responsible for ensuring a conversation
 * exists before files can be attached — when it doesn't yet, the
 * caller should create one eagerly (see ChatComposer for the wiring).
 */
import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import { Loader2Icon, PaperclipIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Id } from "@/convex/_generated/dataModel";
import { normalizeErrorDescription } from "@/lib/normalizeError";

type Props = {
	orgId: Id<"orgs"> | undefined;
	conversationId: Id<"aiConversations"> | null;
	disabled?: boolean;
	onAttached: (info: {
		fileId: Id<"files">;
		name: string;
		mimeType: string;
		size: number;
	}) => void;
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

	const generateUploadUrl = useMutation(anyApi.files.mutations.generateUploadUrl);
	const attach = useMutation(anyApi.ai.chatAttachments.attach);

	async function handleFiles(files: FileList | null) {
		if (!files || files.length === 0 || !orgId) return;
		setBusy(true);
		try {
			const targetConversationId = conversationId ?? (await onEnsureConversation());
			for (const file of Array.from(files)) {
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
					onAttached({
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
