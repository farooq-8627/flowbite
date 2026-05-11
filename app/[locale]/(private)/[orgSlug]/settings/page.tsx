import { SettingsView } from "@/core/settings/views/SettingsView";

export default async function SettingsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
	const { orgSlug } = await params;
	return <SettingsView orgSlug={orgSlug} />;
}
