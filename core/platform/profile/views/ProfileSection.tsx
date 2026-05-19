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
	/** Optional button/link rendered in the top-right of the card header. */
	action?: React.ReactNode;
	children: React.ReactNode;
	className?: string;
	/**
	 * Render WITHOUT the surrounding `<Card>` chrome.
	 *
	 * When `true`, the section keeps participating in the shell's
	 * search-filter system (so the topnav pill still highlights and
	 * Fuse search still finds it) but the children are rendered as a
	 * plain block — no border, no padding, no header.
	 *
	 * Use this for tabs where the inner content is itself a full-screen
	 * working surface (Messages, Timeline, Notes-list, Reminders,
	 * Calendar). Adding a wrapper Card around those just stacks two
	 * cards visually and steals vertical space the panel needs to scroll.
	 *
	 * Keep `chromeless={false}` (the default) for tabs that need a
	 * traditional card frame — Files, AI Briefing, Overview rows.
	 */
	chromeless?: boolean;
	/**
	 * When `chromeless`, the section often wants to fill the available
	 * height (e.g. Messages, Timeline). This adds `h-full min-h-0` to the
	 * outer wrapper so the inner panel can flex. No-op when chrome is on.
	 */
	fillHeight?: boolean;
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
 *
 * Chromeless mode (`chromeless={true}`):
 *   The wrapper Card is dropped — children render as a plain block scoped
 *   to the section id (so search still finds it). Used by working surfaces
 *   like Messages, Timeline, Notes, Reminders, Calendar where a second
 *   surrounding card would just visually nest two boxes.
 */
export function ProfileSection({
	id,
	title,
	description,
	action,
	children,
	className,
	chromeless,
	fillHeight,
}: Props) {
	const { matchingIds } = useSearchFilter();
	if (matchingIds && id && !matchingIds.has(id)) return null;

	if (chromeless) {
		return (
			<section
				id={id}
				aria-label={title}
				data-description={description}
				className={cn(
					"scroll-mt-6",
					// `fillHeight` claims a tall viewport-relative height so
					// the inner panel (Messages, Timeline, Calendar) can run
					// its own internal flex/scroll layout. We don't ask the
					// shell `<main>` for `100%` because that main is itself
					// vertically scrollable — the section would collapse to
					// zero height. Subtracting the topnav + a little padding
					// keeps the panel just inside the viewport.
					fillHeight && "flex h-[calc(100vh-7rem)] min-h-[26rem] flex-col",
					className,
				)}
			>
				{children}
			</section>
		);
	}

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
