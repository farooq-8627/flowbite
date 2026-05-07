import { RolesSettingsView } from "@/core/settings/views/GeneralSettingsView";

export default async function RolesSettingsPage({
	params,
}: {
	params: Promise<{ orgSlug: string; locale: string }>;
}) {
	const { orgSlug } = await params;
	return <RolesSettingsView orgSlug={orgSlug} />;
}
