"use client";
/**
 * core/ai/components/ChatHistoryDropdown.tsx
 *
 * Dropdown showing past conversations for the current user.
 * Accessible from the ChatHeader.
 */
import { useMutation } from "convex/react";
import { anyApi } from "convex/server";
import { Archive, MessageSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Id } from "@/convex/_generated/dataModel";
import type { AIConversation } from "../types";

interface Props {
	conversations: AIConversation[];
	activeConversationId: Id<"aiConversations"> | null;
	orgId: Id<"orgs">;
	onSelect: (id: Id<"aiConversations">) => void;
	onNew: () => void;
}

export function ChatHistoryDropdown({
	conversations,
	activeConversationId,
	orgId,
	onSelect,
	onNew,
}: Props) {
	const archive = useMutation(anyApi.ai.conversations.archive);

	const active = conversations.filter((c) => c.status === "active");

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="sm"
					className="gap-1 px-1.5 text-xs"
					title={
						active.length > 0
							? `${active.length} conversation${active.length === 1 ? "" : "s"}`
							: "No conversation history"
					}
				>
					<MessageSquare className="size-3.5" />
					{active.length > 0 ? (
						<span className="font-medium">{active.length}</span>
					) : null}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="start" className="w-72 max-h-96 overflow-y-auto">
				<DropdownMenuItem onClick={onNew} className="gap-2 font-medium">
					<Plus className="size-4" />
					New conversation
				</DropdownMenuItem>
				{active.length > 0 && <DropdownMenuSeparator />}
				{active.map((conv) => (
					<DropdownMenuItem
						key={conv._id}
						onClick={() => onSelect(conv._id)}
						className={`flex items-center gap-2 ${conv._id === activeConversationId ? "bg-muted" : ""}`}
					>
						<MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
						<span className="flex-1 truncate text-sm">
							{conv.title ?? "Untitled conversation"}
						</span>
						<button
							type="button"
							title="Archive"
							className="p-0.5 hover:text-foreground text-muted-foreground"
							onClick={(e) => {
								e.stopPropagation();
								archive({ orgId, conversationId: conv._id });
							}}
						>
							<Archive className="size-3" />
						</button>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
