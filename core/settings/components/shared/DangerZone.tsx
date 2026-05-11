import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
	id?: string;
	title?: string;
	description?: string;
	children: React.ReactNode;
};

/**
 * Destructive-actions card with a red border.
 * Used inside the Data & Security group for org-deletion, ownership transfer, etc.
 */
export function DangerZone({
	id,
	title = "Danger Zone",
	description = "These actions are permanent and cannot be undone.",
	children,
}: Props) {
	return (
		<Card id={id} className="border-destructive/40">
			<CardHeader>
				<CardTitle className="text-base text-destructive">{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col ">{children}</CardContent>
		</Card>
	);
}
