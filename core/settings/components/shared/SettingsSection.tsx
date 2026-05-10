import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
	CardAction,
} from "@/components/ui/card";

type Props = {
	id?: string;
	title: string;
	description?: string;
	/** Optional button/link rendered in the top-right of the card header */
	action?: React.ReactNode;
	children: React.ReactNode;
};

/**
 * Shadboard-style settings card.
 * Structure: Card > CardHeader (title + description + optional action) > CardContent
 * Save button goes INSIDE CardContent, w-fit, left-aligned — same as shadboard ButtonLoading pattern.
 */
export function SettingsSection({ id, title, description, action, children }: Props) {
	return (
		<Card id={id}>
			<CardHeader>
				<CardTitle>{title}</CardTitle>
				{description && <CardDescription>{description}</CardDescription>}
				{action && <CardAction>{action}</CardAction>}
			</CardHeader>
			<CardContent>{children}</CardContent>
		</Card>
	);
}
