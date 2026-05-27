import { TemplateEditorView } from "@/owner/views/industries/TemplateEditorView";

export default async function OwnerIndustriesTemplatePage({
	params,
}: {
	params: Promise<{ templateKey: string }>;
}) {
	const { templateKey } = await params;
	return <TemplateEditorView templateKey={decodeURIComponent(templateKey)} />;
}
