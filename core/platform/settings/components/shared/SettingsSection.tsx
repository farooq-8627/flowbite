import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useSearchFilter } from "@/core/shell/shared/layouts";
import { cn } from "@/lib/utils";

type Props = {
	id?: string;
	title: string;
	description?: string;
	/** Optional button/link rendered in the top-right of the card header */
	action?: React.ReactNode;
	children: React.ReactNode;
};

/**
 * Settings section card.
 *
 * If a search-filter context is active and this section's id isn't in the
 * matching set, the card returns null — inline search filtering without a
 * separate results screen.
 */
export function SettingsSection({ id, title, description, action, children }: Props) {
	const { matchingIds } = useSearchFilter();
	if (matchingIds && id && !matchingIds.has(id)) return null;

	return (
		<Card id={id} className="scroll-mt-6 gap-4 py-4 sm:gap-6 sm:py-6">
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
