import { PipelineSettingsView } from "@/core/settings/views/GeneralSettingsView";

export default async function PipelineSettingsPage({
	params,
}: {
	params: Promise<{ orgSlug: string; locale: string }>;
}) {
	const { orgSlug } = await params;
	return <PipelineSettingsView orgSlug={orgSlug} />;
}
