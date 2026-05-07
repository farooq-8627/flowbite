import { GeneralSettingsView } from "@/core/settings/views/GeneralSettingsView";
export default async function GeneralSettingsPage({
	params,
}: {
	params: Promise<{ orgSlug: string; locale: string }>;
}) {
	const { orgSlug } = await params;
	return <GeneralSettingsView orgSlug={orgSlug} />;
}
