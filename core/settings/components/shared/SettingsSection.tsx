import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = {
	id?: string;
	title: string;
	description?: string;
	children: React.ReactNode;
};

export function SettingsSection({ id, title, description, children }: Props) {
	return (
		<Card id={id} className="rounded-[var(--radius)]">
			<CardHeader>
				<CardTitle className="text-lg">{title}</CardTitle>
				{description && <CardDescription>{description}</CardDescription>}
			</CardHeader>
			<CardContent className="space-y-4">{children}</CardContent>
		</Card>
	);
}
