"use client";

import { InboxIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
	icon?: React.ReactNode;
	title: string;
	description?: string;
	action?: React.ReactNode;
	className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center gap-4 py-16 text-center",
				className,
			)}
		>
			<div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
				{icon ?? <InboxIcon className="size-6" />}
			</div>
			<div className="space-y-1">
				<p className="text-sm font-medium">{title}</p>
				{description && <p className="text-sm text-muted-foreground">{description}</p>}
			</div>
			{action}
		</div>
	);
}
