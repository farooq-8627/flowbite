import { BillingSettingsView } from "@/core/settings/views/GeneralSettingsView";

export default async function BillingSettingsPage({
	params,
}: {
	params: Promise<{ orgSlug: string; locale: string }>;
}) {
	const { orgSlug } = await params;
	return <BillingSettingsView orgSlug={orgSlug} />;
}
