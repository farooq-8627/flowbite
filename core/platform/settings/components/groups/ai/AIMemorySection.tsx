"use client";
/**
 * core/platform/settings/components/groups/ai/AIMemorySection.tsx
 *
 * Surfaces the AI's dynamic memory: the summary + keyFacts the agent
 * has built up about this organisation and the current user during
 * past chats.
 *
 * - Org-level memory is shared across the workspace and editable only
 *   by `org.manage` holders (via "Forget all (workspace)").
 * - User memory is always self-scoped — every member can wipe their
 *   own memory at any time.
 *
 * The static `identity` blob (Business Context above) is NEVER
 * affected by these forget mutations.
 */

import { useMutation, useQuery } from "convex/react";
import { Brain, Trash2, User } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentOrg } from "@/core/shell/shared/hooks/useCurrentOrg";
import { toast } from "@/lib/toast";
import { SettingsSection } from "../../shared/SettingsSection";

type MemoryRow = {
	summary: string;
	keyFacts: string[];
	lastUpdatedAt: number;
	byteCount: number;
} | null;

const SCOPE_LABEL = {
	org: "Workspace memory",
	user: "Your memory",
} as const;

function formatBytes(b: number): string {
	if (b < 1024) return `${b} B`;
	return `${(b / 1024).toFixed(1)} KB`;
}

function relativeTime(ts: number): string {
	const diff = Date.now() - ts;
	if (diff < 60_000) return "just now";
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
	if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
	return `${Math.floor(diff / 86_400_000)}d ago`;
}

function MemoryCard({
	scope,
	row,
	canForget,
	onForget,
}: {
	scope: "org" | "user";
	row: MemoryRow;
	canForget: boolean;
	onForget: () => void;
}) {
	const Icon = scope === "org" ? Brain : User;
	const empty = !row || (!row.summary && row.keyFacts.length === 0);

	return (
		<div className="flex flex-col gap-3 rounded-[var(--radius)] border bg-background p-4">
			<div className="flex items-center justify-between">
				<div className="flex items-center gap-2">
					<Icon className="size-4 text-muted-foreground" />
					<span className="text-sm font-medium">{SCOPE_LABEL[scope]}</span>
				</div>
				<div className="flex items-center gap-2">
					{row && (
						<Badge variant="outline" className="font-mono text-[10px]">
							{formatBytes(row.byteCount)}
						</Badge>
					)}
					{!empty && canForget && (
						<Button
							variant="ghost"
							size="sm"
							className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-destructive"
							onClick={onForget}
						>
							<Trash2 className="size-3" />
							Forget
						</Button>
					)}
				</div>
			</div>

			{empty ? (
				<p className="py-3 text-center text-xs text-muted-foreground">
					{scope === "org"
						? "The AI hasn't recorded any workspace-level facts yet. As people chat, it will remember things like preferred terminology, default deal sizes, or common follow-up patterns."
						: "The AI hasn't recorded any personal facts about you yet. As you chat, it will remember things like your typical schedule, name preferences, and your custom defaults."}
				</p>
			) : (
				<>
					{row?.summary && (
						<p className="rounded-[calc(var(--radius)-2px)] bg-muted/40 p-2.5 text-xs leading-relaxed">
							{row.summary}
						</p>
					)}
					{row && row.keyFacts.length > 0 && (
						<ul className="grid gap-1 text-xs">
							{row.keyFacts.map((fact) => (
								<li
									key={fact}
									className="flex items-start gap-1.5 text-muted-foreground"
								>
									<span className="select-none text-muted-foreground/50">•</span>
									<span className="flex-1">{fact}</span>
								</li>
							))}
						</ul>
					)}
					{row && (
						<div className="text-[11px] text-muted-foreground">
							Last updated {relativeTime(row.lastUpdatedAt)}
						</div>
					)}
				</>
			)}
		</div>
	);
}

export function AIMemorySection({ orgId }: { orgId: Id<"orgs"> }) {
	const memory = useQuery(api.ai.personaContext.getMemoryForSettings, { orgId });
	const forgetOrg = useMutation(api.ai.personaContext.forgetOrgMemory);
	const forgetUser = useMutation(api.ai.personaContext.forgetUserMemory);

	const [confirmingScope, setConfirmingScope] = useState<"org" | "user" | null>(null);
	const [busy, setBusy] = useState(false);

	const { membership } = useCurrentOrg();
	const canManageOrg = membership?.permissions?.includes("org.manage") ?? false;

	async function handleForget() {
		if (!confirmingScope) return;
		setBusy(true);
		try {
			if (confirmingScope === "org") {
				await forgetOrg({ orgId });
				toast.success("Workspace memory cleared.");
			} else {
				await forgetUser({ orgId });
				toast.success("Your memory cleared.");
			}
			setConfirmingScope(null);
		} catch (err) {
			toast.mutationError(err, "Could not clear memory.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<>
			<SettingsSection
				id="ai.memory"
				title="AI Memory"
				description="What the AI has learned and remembers across conversations. The Business Context blob above is unaffected by these controls."
			>
				{memory === undefined ? (
					<div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
				) : (
					<div className="grid gap-3 sm:grid-cols-2">
						<MemoryCard
							scope="org"
							row={memory.org}
							canForget={canManageOrg}
							onForget={() => setConfirmingScope("org")}
						/>
						<MemoryCard
							scope="user"
							row={memory.user}
							canForget
							onForget={() => setConfirmingScope("user")}
						/>
					</div>
				)}
			</SettingsSection>

			<Dialog
				open={confirmingScope !== null}
				onOpenChange={(o) => !o && setConfirmingScope(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{confirmingScope === "org"
								? "Clear workspace memory?"
								: "Clear your memory?"}
						</DialogTitle>
						<DialogDescription>
							{confirmingScope === "org"
								? "Removes the AI-managed summary + key facts that the assistant has learned about this workspace. The static Business Context above is preserved. This cannot be undone."
								: "Removes the AI-managed summary + key facts about you. The AI will start fresh on your next chat. This cannot be undone."}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="ghost"
							onClick={() => setConfirmingScope(null)}
							disabled={busy}
						>
							Cancel
						</Button>
						<Button variant="destructive" onClick={handleForget} disabled={busy}>
							{busy ? "Clearing…" : "Forget all"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
