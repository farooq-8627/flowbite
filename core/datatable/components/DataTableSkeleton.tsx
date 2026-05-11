import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface DataTableSkeletonProps extends React.ComponentProps<"div"> {
	columnCount: number;
	rowCount?: number;
	filterCount?: number;
	cellWidths?: string[];
	withViewOptions?: boolean;
	withPagination?: boolean;
	shrinkZero?: boolean;
}

export function DataTableSkeleton({
	columnCount,
	rowCount = 10,
	filterCount = 0,
	cellWidths = ["auto"],
	withViewOptions = true,
	withPagination = true,
	shrinkZero = false,
	className,
	...props
}: DataTableSkeletonProps) {
	const widths = Array.from(
		{ length: columnCount },
		(_, i) => cellWidths[i % cellWidths.length] ?? "auto",
	);
	// Precomputed stable keys for each loop so we don't key on array index —
	// skeletons don't need reactivity but Biome's React rules still prefer it.
	const filterKeys = Array.from({ length: filterCount }, (_, i) => `filter-${i}`);
	const columnKeys = Array.from({ length: columnCount }, (_, i) => `col-${i}`);
	const rowKeys = Array.from({ length: rowCount }, (_, i) => `row-${i}`);

	return (
		<div className={cn("flex flex-1 flex-col space-y-4", className)} {...props}>
			<div className="flex w-full items-center justify-between gap-2 overflow-auto p-1">
				<div className="flex flex-1 items-center gap-2">
					{filterCount > 0 &&
						filterKeys.map((k) => (
							<Skeleton key={k} className="h-7 w-[4.5rem] border-dashed" />
						))}
				</div>
				{/* ms-auto is RTL-safe equivalent of ml-auto */}
				{withViewOptions && <Skeleton className="ms-auto hidden h-7 w-[4.5rem] lg:flex" />}
			</div>
			<div className="flex-1 rounded-[var(--radius)] border">
				<Table>
					<TableHeader>
						<TableRow className="hover:bg-transparent">
							{columnKeys.map((k, j) => (
								<TableHead
									key={k}
									style={{
										width: widths[j],
										minWidth: shrinkZero ? widths[j] : "auto",
									}}
								>
									<Skeleton className="h-6 w-full" />
								</TableHead>
							))}
						</TableRow>
					</TableHeader>
					<TableBody>
						{rowKeys.map((rowKey) => (
							<TableRow key={rowKey} className="hover:bg-transparent">
								{columnKeys.map((colKey, j) => (
									<TableCell
										key={colKey}
										style={{
											width: widths[j],
											minWidth: shrinkZero ? widths[j] : "auto",
										}}
									>
										<Skeleton className="h-6 w-full" />
									</TableCell>
								))}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
			{withPagination && (
				<div className="flex w-full items-center justify-between gap-4 overflow-auto p-1 sm:gap-8">
					<Skeleton className="h-7 w-40 shrink-0" />
					<div className="flex items-center gap-4 sm:gap-6 lg:gap-8">
						<div className="flex items-center gap-2">
							<Skeleton className="h-7 w-24" />
							<Skeleton className="h-7 w-[4.5rem]" />
						</div>
						<Skeleton className="h-7 w-20" />
						<div className="flex items-center gap-2">
							<Skeleton className="hidden size-7 lg:block" />
							<Skeleton className="size-7" />
							<Skeleton className="size-7" />
							<Skeleton className="hidden size-7 lg:block" />
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
