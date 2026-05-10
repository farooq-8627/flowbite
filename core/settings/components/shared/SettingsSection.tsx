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
		<Card id={id} className="scroll-mt-6">
			<CardHeader>
				<CardTitle className="text-base">{title}</CardTitle>
				{description && <CardDescription>{description}</CardDescription>}
				{action && <CardAction>{action}</CardAction>}
			</CardHeader>
			<CardContent className="flex flex-col divide-y divide-border">
				{children}
			</CardContent>
		</Card>
	);
}
