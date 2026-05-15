import { NotesView } from "@/core/comms/notes/views/NotesView";

/**
 * Notes page — `/{locale}/{orgSlug}/notes`. Thin wrapper.
 */
export default async function NotesPage({ params }: { params: Promise<{ orgSlug: string }> }) {
	await params;
	return <NotesView />;
}
