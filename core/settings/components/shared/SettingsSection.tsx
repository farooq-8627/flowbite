import { cn } from "@/lib/utils";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	CardAction,
} from "@/components/ui/card";
import { useSearchFilter } from "../../context/search-filter";

type Props = {
	id?: string;
	title: string;
	description?: string;
	/** Optional button/link rendered in the top-right of the card header */
	action?: React.ReactNode;
	/** Hide the divider lines between rows in the content (default: false, show dividers). */
	noDividers?: boolean;
	children: React.ReactNode;
};

/**
 * Settings section card.
 *
 * If a search-filter context is active and this section's id isn't in the
 * matching set, the card returns null — inline search filtering without a
 * separate results screen.
 */
export function SettingsSection({
	id,
	title,
	description,
	action,
	noDividers = false,
	children,
}: Props) {
	const { matchingIds } = useSearchFilter();
	if (matchingIds && id && !matchingIds.has(id)) return null;

	return (
		<Card id={id} className="scroll-mt-6 gap-4 py-4 sm:gap-6 sm:py-6">
			<CardHeader className="gap-0">
				<CardTitle className="text-sm sm:text-base">{title}</CardTitle>
				{description && (
					<CardDescription className="text-xs sm:text-sm">
						{description}
					</CardDescription>
				)}
				{action && <CardAction>{action}</CardAction>}
			</CardHeader>
			<CardContent
				className={cn(
					"flex flex-col",
					// !noDividers && "divide-y divide-border",
				)}
			>
				{children}
			</CardContent>
		</Card>
	);
}
