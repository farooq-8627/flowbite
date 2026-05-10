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
 * Settings section card.
 * Structure:
 *   Card (shadcn default: rounded-xl border py-6 shadow-sm)
 *   ├─ CardHeader (title + description + optional action)
 *   └─ CardContent (divided rows via <SettingsRow>)
 *
 * Each row inside uses horizontal layout (label + description on the left,
 * form control on the right) — matches shadboard settings pattern.
 */
export function SettingsSection({ id, title, description, action, children }: Props) {
	return (
		<Card id={id}>
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
