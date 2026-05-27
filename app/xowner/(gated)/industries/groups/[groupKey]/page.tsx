import { GroupEditorView } from "@/owner/views/industries/GroupEditorView";

export default async function OwnerIndustriesGroupPage({
	params,
}: {
	params: Promise<{ groupKey: string }>;
}) {
	const { groupKey } = await params;
	return <GroupEditorView groupKey={decodeURIComponent(groupKey)} />;
}
