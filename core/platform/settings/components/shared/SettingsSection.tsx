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
 *
 * Sizing rules (2026-05-22):
 *   - `min-w-0 max-w-full` on Card so it shrinks to fit narrow viewports
 *     instead of overflowing horizontally and silently clipping content.
 *   - `min-w-0` on CardContent so flex/grid descendants behave correctly
 *     and horizontal scroll containers (tables, button rows) can scroll
 *     within their bounds rather than blowing out the parent.
 *   - Header description has `text-balance break-words` so long sentences
 *     wrap cleanly on phones instead of running into the action button.
 */
export function SettingsSection({ id, title, description, action, children }: Props) {
	const { matchingIds } = useSearchFilter();
	if (matchingIds && id && !matchingIds.has(id)) return null;

	return (
		<Card id={id} className="min-w-0 max-w-full scroll-mt-6 gap-4 py-4 sm:gap-6 sm:py-6">
			<CardHeader className={cn("min-w-0 gap-0", action && "grid-cols-[1fr_auto]")}>
				<CardTitle className="min-w-0 text-sm sm:text-base">{title}</CardTitle>
				{description && (
					<CardDescription className="min-w-0 break-words text-balance text-xs sm:text-sm">
						{description}
					</CardDescription>
				)}
				{action && <CardAction className="min-w-0">{action}</CardAction>}
			</CardHeader>
			<CardContent className="flex min-w-0 flex-col">{children}</CardContent>
		</Card>
	);
}
