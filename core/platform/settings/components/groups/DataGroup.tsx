"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { AlertTriangle, Download, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { normalizeError } from "@/lib/normalizeError";
import type { OrgSettings } from "../../types";
import { resolveEntityLabels } from "../../types";
import { DangerZone } from "../shared/DangerZone";
import { SettingsRow } from "../shared/SettingsRow";
import { SettingsSection } from "../shared/SettingsSection";

// ────────────────────────────────────────────────────────────────────────────
// Export (placeholder — real export job is coming)
// ────────────────────────────────────────────────────────────────────────────

function ExportSection({ orgId, canExport }: { orgId: Id<"orgs">; canExport: boolean }) {
	const exportData = useAction(api.gdpr.actions.exportOrgData);
	const [busy, setBusy] = useState(false);

	const handleExport = async () => {
		if (busy) return;
		setBusy(true);
		try {
			const r = await exportData({ orgId });
			toast.success(`Export ready (${(r.bytes / 1024).toFixed(1)} KB). Opening download…`);
			window.location.href = r.downloadUrl;
		} catch (err) {
			toast.error(normalizeError(err, "Export failed"));
		} finally {
			setBusy(false);
		}
	};

	return (
		<SettingsSection
			id="data.export"
			title="Export data"
			description="Download a curated bundle (CSV per table + metadata.json, zipped) of every record in this workspace. Personal data only — system tables are excluded."
		>
			<div className="flex items-center justify-between gap-4">
				<p className="text-sm text-muted-foreground">
					The bundle includes leads, contacts, companies, deals, notes, reminders,
					messages, tags, custom fields, pipelines, saved views, activity logs, and member
					metadata.
				</p>
				<Button
					size="sm"
					onClick={handleExport}
					disabled={!canExport || busy}
					title={canExport ? undefined : "You need data.export permission."}
				>
					<Download className="size-4" />
					{busy ? "Building bundle…" : "Download GDPR bundle"}
				</Button>
			</div>
		</SettingsSection>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Delete workspace dialog
// ────────────────────────────────────────────────────────────────────────────

function DeleteWorkspaceDialog({ org, orgId }: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const [open, setOpen] = useState(false);
	const [confirm, setConfirm] = useState("");
	const [deleting, setDeleting] = useState(false);
	const deleteOrg = useMutation(api.orgs.mutations.deleteOrg);
	const router = useRouter();

	// Labels come from the resolved entityLabels so the warning copy matches
	// what the admin actually calls these records (e.g. "inquiries, clients,
	// opportunities, venues") — no hardcoded CRM terminology.
	const labels = resolveEntityLabels(org.entityLabels);
	const entityList = [
		labels.lead.plural,
		labels.contact.plural,
		labels.deal.plural,
		labels.company.plural,
	]
		.map((s) => s.toLowerCase())
		.join(", ");

	const canDelete = confirm === org.name && !deleting;

	const handleDelete = async () => {
		setDeleting(true);
		try {
			await deleteOrg({ orgId });
			toast.success(`Workspace "${org.name}" scheduled for deletion.`);
			setOpen(false);
			router.push("/");
		} catch (err) {
			toast.error(normalizeError(err, "Failed to delete workspace"));
			setDeleting(false);
		}
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				setOpen(v);
				if (!v) setConfirm("");
			}}
		>
			<DialogTrigger asChild>
				<Button variant="destructive" size="sm">
					<Trash2 className="size-4" /> Delete workspace
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-destructive">
						<AlertTriangle className="size-5" />
						Delete this workspace?
					</DialogTitle>
					<DialogDescription>
						This will schedule <b>{org.name}</b> and all of its data ({entityList},
						members, files) for permanent deletion. This cannot be undone.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-2 py-2">
					<Label htmlFor="confirm-org-name">
						Type <b className="font-mono">{org.name}</b> to confirm
					</Label>
					<Input
						id="confirm-org-name"
						value={confirm}
						onChange={(e) => setConfirm(e.target.value)}
						placeholder={org.name}
						autoComplete="off"
					/>
				</div>
				<DialogFooter>
					<Button variant="outline" size="sm" onClick={() => setOpen(false)}>
						Cancel
					</Button>
					<Button
						variant="destructive"
						size="sm"
						disabled={!canDelete}
						onClick={handleDelete}
					>
						{deleting ? "Deleting…" : "Permanently delete"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Trash — soft-deleted records pending purge
// ────────────────────────────────────────────────────────────────────────────

function relativeTime(ts: number): string {
	const diff = Date.now() - ts;
	if (diff < 60_000) return "just now";
	if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
	if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
	return `${Math.floor(diff / 86_400_000)}d ago`;
}

function daysFromNow(ts: number): string {
	const diff = ts - Date.now();
	if (diff <= 0) return "purging soon";
	const days = Math.ceil(diff / 86_400_000);
	return `in ${days}d`;
}

function TrashSection({ orgId, canRestore }: { orgId: Id<"orgs">; canRestore: boolean }) {
	const items = useQuery(api.trash.queries.list, { orgId });
	const restore = useMutation(api.trash.mutations.restore);
	const [pending, setPending] = useState<string | null>(null);

	const handleRestore = async (id: string, type: "lead" | "contact" | "company" | "deal") => {
		setPending(id);
		try {
			await restore({ orgId, entityType: type, entityId: id });
			toast.success("Restored");
		} catch (err) {
			toast.error(normalizeError(err, "Could not restore record"));
		} finally {
			setPending(null);
		}
	};

	return (
		<SettingsSection
			id="data.trash"
			title="Trash"
			description="Soft-deleted records are kept for the configured retention period before being permanently removed. Restore anything you deleted by mistake."
		>
			{items === undefined ? (
				<p className="text-sm text-muted-foreground">Loading…</p>
			) : items.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					Trash is empty. Deleted records will appear here for the configured retention
					window.
				</p>
			) : (
				<div className="overflow-x-auto rounded-[var(--radius)] border">
					<table className="w-full text-sm">
						<thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
							<tr>
								<th className="px-3 py-2 text-start">Title</th>
								<th className="px-3 py-2 text-start">Type</th>
								<th className="px-3 py-2 text-start">Deleted</th>
								<th className="px-3 py-2 text-start">Purges</th>
								<th className="px-3 py-2" />
							</tr>
						</thead>
						<tbody className="divide-y">
							{items.map((it) => (
								<tr key={it.id} className="hover:bg-muted/30">
									<td className="px-3 py-2 font-medium">{it.title}</td>
									<td className="px-3 py-2 capitalize text-muted-foreground">
										{it.entityType}
									</td>
									<td className="px-3 py-2 text-muted-foreground">
										{relativeTime(it.deletedAt)}
									</td>
									<td className="px-3 py-2 text-muted-foreground">
										{daysFromNow(it.purgeAt)}
									</td>
									<td className="px-3 py-2 text-end">
										{canRestore && (
											<Button
												variant="outline"
												size="sm"
												onClick={() => handleRestore(it.id, it.entityType)}
												disabled={pending !== null}
											>
												<RotateCcw className="size-3.5" />
												{pending === it.id ? "Restoring…" : "Restore"}
											</Button>
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</SettingsSection>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Export
// ────────────────────────────────────────────────────────────────────────────

export function DataGroup({
	org,
	orgId,
	permissions,
}: {
	org: OrgSettings;
	orgId: Id<"orgs">;
	permissions: string[];
}) {
	const _labels = resolveEntityLabels(org.entityLabels);
	const canExport = permissions.includes("data.export");
	const canViewTrash = permissions.includes("data.viewTrash");
	const canRestore = permissions.includes("data.restore");
	const isOwner = permissions.includes("org.delete");

	const cancelDeletion = useMutation(api.orgs.mutations.cancelOrgDeletion);
	const deletionScheduledAt = (org as unknown as { settings?: { deletionScheduledAt?: number } })
		.settings?.deletionScheduledAt;
	const [cancelling, setCancelling] = useState(false);

	const handleCancelDeletion = async () => {
		setCancelling(true);
		try {
			await cancelDeletion({ orgId });
			toast.success("Deletion cancelled.");
		} catch (err) {
			toast.error(normalizeError(err, "Could not cancel deletion."));
		} finally {
			setCancelling(false);
		}
	};

	return (
		<div className="grid gap-6">
			{deletionScheduledAt && (
				<div className="flex items-start gap-3 rounded-[var(--radius)] border border-destructive/40 bg-destructive/5 p-3 text-sm">
					<AlertTriangle className="mt-0.5 size-4 flex-none text-destructive" />
					<div className="flex-1">
						<p className="font-medium">This workspace is scheduled for deletion</p>
						<p className="mt-0.5 text-muted-foreground">
							All data will be permanently removed at{" "}
							{new Date(deletionScheduledAt).toLocaleString()}. Cancel within the
							grace window to keep the workspace.
						</p>
					</div>
					{isOwner && (
						<Button
							variant="outline"
							size="sm"
							onClick={handleCancelDeletion}
							disabled={cancelling}
						>
							{cancelling ? "Cancelling…" : "Cancel deletion"}
						</Button>
					)}
				</div>
			)}

			{canExport && <ExportSection orgId={orgId} canExport={canExport} />}

			{canViewTrash && <TrashSection orgId={orgId} canRestore={canRestore} />}

			{isOwner && (
				<DangerZone id="data.danger">
					<SettingsRow
						label="Transfer ownership"
						description="Transfer this workspace to another owner. You will lose owner privileges."
						controlClassName="sm:min-w-auto"
					>
						<Button variant="outline" size="sm" disabled>
							Coming soon
						</Button>
					</SettingsRow>
					<SettingsRow
						label="Delete workspace"
						description={
							<span>
								Permanently remove <b>{org.name}</b> and all associated data after a
								24-hour grace window. You can cancel from this page anytime before
								then.
							</span>
						}
						controlClassName="sm:min-w-auto"
					>
						<DeleteWorkspaceDialog org={org} orgId={orgId} />
					</SettingsRow>
				</DangerZone>
			)}

			{!canExport && !canViewTrash && !isOwner && (
				<div className="rounded-[var(--radius)] border border-dashed py-12 text-center text-sm text-muted-foreground">
					<Badge variant="secondary" className="mb-2">
						Restricted
					</Badge>
					<p>You don't have access to data exports or workspace management.</p>
				</div>
			)}
		</div>
	);
}
