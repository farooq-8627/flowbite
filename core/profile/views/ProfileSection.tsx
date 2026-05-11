import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useSearchFilter } from "@/core/shared/layouts";
import { cn } from "@/lib/utils";

type Props = {
	id?: string;
	title: string;
	description?: string;
	/** Optional button/link rendered in the top-right of the card header. */
	action?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
};

/**
 * ProfileSection — one card inside the profile shell's content area.
 *
 * Behavior mirrors `SettingsSection` exactly:
 *   - Every card has a stable `id` that MUST match a row in `PROFILE_SECTIONS`
 *     (so it shows up as a pill in the toolbar + is indexed for search).
 *   - When the shell's search input has a query, this component reads the
 *     shared `useSearchFilter()` context and returns null if its id is not a
 *     match — inline filtering without a separate "results screen".
 */
export function ProfileSection({ id, title, description, action, children, className }: Props) {
	const { matchingIds } = useSearchFilter();
	if (matchingIds && id && !matchingIds.has(id)) return null;

	return (
		<Card id={id} className={cn("scroll-mt-6 gap-4 py-4 sm:gap-6 sm:py-6", className)}>
			<CardHeader className={cn("gap-0", action && "grid-cols-[1fr_auto]")}>
				<CardTitle className="text-sm sm:text-base">{title}</CardTitle>
				{description && (
					<CardDescription className="text-xs sm:text-sm">{description}</CardDescription>
				)}
				{action && <CardAction>{action}</CardAction>}
			</CardHeader>
			<CardContent className="flex flex-col">{children}</CardContent>
		</Card>
	);
}
