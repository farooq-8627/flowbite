import { MembersSettingsView } from "@/core/settings/views/GeneralSettingsView";

export default async function MembersSettingsPage({
	params,
}: {
	params: Promise<{ orgSlug: string; locale: string }>;
}) {
	const { orgSlug } = await params;
	return <MembersSettingsView orgSlug={orgSlug} />;
}
