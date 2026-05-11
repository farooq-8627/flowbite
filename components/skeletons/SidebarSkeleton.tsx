/**
 * Sidebar Skeleton Component
 * STATUS: IMPLEMENTED
 *
 * Loading state for AppSidebar while data is being fetched.
 * Matches the structure of the actual sidebar for smooth transition.
 *
 * Features:
 * - Skeleton placeholders for all sidebar sections
 * - Matches actual sidebar layout
 * - Smooth transition to loaded state
 * - No layout shift
 *
 * @see core/shell/components/sidebar/app-sidebar.tsx for actual sidebar
 * @see components/ui/skeleton.tsx for skeleton primitive
 *
 * @example
 * {isLoading ? <SidebarSkeleton /> : <AppSidebar />}
 */

import { Skeleton } from "@/components/ui/skeleton";

export function SidebarSkeleton() {
	return (
		<div className="flex h-full flex-col gap-4 p-4">
			{/* Header */}
			<div className="flex items-center gap-2">
				<Skeleton className="h-8 w-8 rounded-[var(--radius)]" />
				<Skeleton className="h-4 w-32" />
			</div>

			{/* Account Switcher */}
			<Skeleton className="h-10 w-full rounded-[var(--radius)]" />

			{/* Nav Items */}
			<div className="flex flex-col gap-2">
				<Skeleton className="h-8 w-full rounded-[var(--radius)]" />
				<Skeleton className="h-8 w-3/4 rounded-[var(--radius)]" />
				<Skeleton className="h-8 w-2/3 rounded-[var(--radius)]" />
				<Skeleton className="h-8 w-full rounded-[var(--radius)]" />
				<Skeleton className="h-8 w-4/5 rounded-[var(--radius)]" />
			</div>

			{/* Spacer */}
			<div className="flex-1" />

			{/* Footer */}
			<div className="flex flex-col gap-2">
				<Skeleton className="h-20 w-full rounded-[var(--radius)]" />
				<Skeleton className="h-10 w-full rounded-[var(--radius)]" />
			</div>
		</div>
	);
}
