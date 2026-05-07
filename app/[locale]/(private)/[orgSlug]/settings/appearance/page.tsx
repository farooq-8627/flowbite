import { AppearanceSettingsView } from "@/core/settings/views/GeneralSettingsView";

export default async function AppearanceSettingsPage({
	params,
}: {
	params: Promise<{ orgSlug: string; locale: string }>;
}) {
	const { orgSlug } = await params;
	return <AppearanceSettingsView orgSlug={orgSlug} />;
}
