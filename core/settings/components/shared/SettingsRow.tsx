type Props = {
	label: string;
	description?: string;
	children: React.ReactNode;
};

export function SettingsRow({ label, description, children }: Props) {
	return (
		<div className="flex items-center justify-between gap-4 py-2">
			<div className="space-y-0.5">
				<p className="text-sm font-medium">{label}</p>
				{description && <p className="text-xs text-muted-foreground">{description}</p>}
			</div>
			<div className="shrink-0">{children}</div>
		</div>
	);
}
