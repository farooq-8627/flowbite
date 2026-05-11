"use client";

import { GripVertical } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { KanbanItem, KanbanItemHandle } from "@/components/ui/kanban";
import { cn } from "@/lib/utils";
import { KanbanCardActions } from "./KanbanCardActions";

// ─── KanbanCard ───────────────────────────────────────────────────────────────

interface KanbanCardProps {
	itemId: string;
	isDragging?: boolean;
	onClick?: () => void;
	children: React.ReactNode;
	className?: string;
}

/**
 * Base card wrapper — wraps shadboard Card structure inside dnd-kit KanbanItem.
 * Entity modules (DealCard, LeadCard) render this with their own children.
 */
export function KanbanCard({ itemId, isDragging, onClick, children, className }: KanbanCardProps) {
	return (
		<KanbanItem value={itemId} asChild>
			<Card
				className={cn(
					"my-2 w-64 md:w-72 cursor-pointer transition-shadow hover:shadow-md",
					isDragging && "opacity-50 rotate-1 shadow-lg",
					className,
				)}
				onClick={onClick}
			>
				{children}
			</Card>
		</KanbanItem>
	);
}

// ─── KanbanCardHeader ─────────────────────────────────────────────────────────

interface KanbanCardHeaderProps {
	itemId: string;
	badge?: string;
	badgeColor?: string;
	onEdit?: (itemId: string) => void;
	onDelete?: (itemId: string) => void;
}

export function KanbanCardHeader({
	itemId,
	badge,
	badgeColor,
	onEdit,
	onDelete,
}: KanbanCardHeaderProps) {
	return (
		<CardHeader className="flex-row items-center space-y-0 gap-x-1.5 px-3 py-3.5">
			{/* Drag handle — wired to KanbanItemHandle from dnd-kit primitive */}
			<KanbanItemHandle asChild>
				<button
					type="button"
					aria-label="Move card"
					className="flex h-8 w-8 items-center justify-center rounded-[var(--radius)] text-secondary-foreground/50 cursor-grab hover:bg-accent"
				>
					<GripVertical className="size-4" />
				</button>
			</KanbanItemHandle>

			{badge && (
				<Badge
					className="text-xs"
					style={badgeColor ? { backgroundColor: badgeColor } : undefined}
				>
					{badge}
				</Badge>
			)}

			{(onEdit || onDelete) && (
				<KanbanCardActions itemId={itemId} onEdit={onEdit} onDelete={onDelete} />
			)}
		</CardHeader>
	);
}

// ─── KanbanCardContent ────────────────────────────────────────────────────────

interface KanbanCardContentProps {
	title: string;
	description?: string;
	/** Entity-specific content (deal value, lead source badge, etc.) */
	children?: React.ReactNode;
}

export function KanbanCardContent({ title, description, children }: KanbanCardContentProps) {
	return (
		<CardContent className="px-3 pb-2">
			<p className="text-sm font-medium leading-snug line-clamp-2">{title}</p>
			{description && (
				<p className="text-xs text-muted-foreground mt-1 line-clamp-2">{description}</p>
			)}
			{children}
		</CardContent>
	);
}

// ─── KanbanCardFooter ─────────────────────────────────────────────────────────

interface Assignee {
	name: string;
	avatarUrl?: string;
}

interface KanbanCardFooterProps {
	assignees?: Assignee[];
	/** Extra metadata (comments count, attachments count, etc.) */
	children?: React.ReactNode;
}

export function KanbanCardFooter({ assignees, children }: KanbanCardFooterProps) {
	return (
		<CardFooter className="justify-between gap-2 pe-3 ps-3 pb-3">
			{/* Avatar stack — up to 3 assignees */}
			<div className="flex -space-x-2">
				{assignees?.slice(0, 3).map((a) => (
					// Assignee names are unique per card in practice; if duplicates
					// appear we fall back to avatarUrl for uniqueness.
					<Avatar
						key={`${a.name}:${a.avatarUrl ?? ""}`}
						className="size-6 border-2 border-background"
					>
						<AvatarImage src={a.avatarUrl} alt={a.name} />
						<AvatarFallback className="text-[9px]">
							{a.name.slice(0, 2).toUpperCase()}
						</AvatarFallback>
					</Avatar>
				))}
			</div>
			{children && <div className="flex items-center gap-1">{children}</div>}
		</CardFooter>
	);
}
