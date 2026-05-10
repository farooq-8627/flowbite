"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Trash2, AlertTriangle } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { OrgSettings } from "../../types";
import { resolveEntityLabels } from "../../types";

import { SettingsSection } from "../shared/SettingsSection";
import { SettingsRow } from "../shared/SettingsRow";
import { DangerZone } from "../shared/DangerZone";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";

// ────────────────────────────────────────────────────────────────────────────
// Export (placeholder — real export job is coming)
// ────────────────────────────────────────────────────────────────────────────

function ExportSection({
	labels,
}: { labels: ReturnType<typeof resolveEntityLabels> }) {
	const [entity, setEntity] = useState<"leads" | "contacts" | "deals" | "companies">("leads");
	const [format, setFormat] = useState<"csv" | "json">("csv");

	return (
		<SettingsSection
			id="data.export"
			title="Export data"
			description="Download your CRM records. Large exports run as a background job."
		>
			<SettingsRow
				label="Entity"
				description="Which records to include in the export."
			>
				<Select value={entity} onValueChange={(v) => setEntity(v as typeof entity)}>
					<SelectTrigger className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="leads">{labels.lead.plural}</SelectItem>
						<SelectItem value="contacts">{labels.contact.plural}</SelectItem>
						<SelectItem value="deals">{labels.deal.plural}</SelectItem>
						<SelectItem value="companies">{labels.company.plural}</SelectItem>
					</SelectContent>
				</Select>
			</SettingsRow>
			<SettingsRow
				label="Format"
				description="File format of the exported data."
			>
				<Select value={format} onValueChange={(v) => setFormat(v as typeof format)}>
					<SelectTrigger className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="csv">CSV (Excel-friendly)</SelectItem>
						<SelectItem value="json">JSON (developer-friendly)</SelectItem>
					</SelectContent>
				</Select>
			</SettingsRow>
			<div className="flex justify-end pt-4">
				<Button
					size="sm"
					disabled
					onClick={() => toast.info("Export job will ship in the next release.")}
				>
					<Download className="size-4" /> Request export
				</Button>
			</div>
		</SettingsSection>
	);
}

// ────────────────────────────────────────────────────────────────────────────
// Delete workspace dialog
// ────────────────────────────────────────────────────────────────────────────

function DeleteWorkspaceDialog({
	org,
	orgId,
}: { org: OrgSettings; orgId: Id<"orgs"> }) {
	const [open, setOpen] = useState(false);
	const [confirm, setConfirm] = useState("");
	const [deleting, setDeleting] = useState(false);
	const deleteOrg = useMutation(api.orgs.mutations.deleteOrg);
	const router = useRouter();

	const canDelete = confirm === org.name && !deleting;

	const handleDelete = async () => {
		setDeleting(true);
		try {
			await deleteOrg({ orgId });
			toast.success(`Workspace "${org.name}" scheduled for deletion.`);
			setOpen(false);
			router.push("/");
		} catch (err) {
			toast.error(err instanceof Error ? err.message : "Failed to delete workspace");
			setDeleting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirm(""); }}>
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
						This will schedule <b>{org.name}</b> and all of its data
						(leads, contacts, deals, members, files) for permanent deletion.
						This cannot be undone.
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
	const labels = resolveEntityLabels(org.entityLabels);
	const canExport = permissions.includes("org.settings") || permissions.includes("org.editSettings");
	const isOwner = permissions.includes("org.delete");

	return (
		<div className="grid gap-6">
			{canExport && <ExportSection labels={labels} />}

			{isOwner && (
				<DangerZone id="data.danger">
					<SettingsRow
						label="Transfer ownership"
						description="Transfer this workspace to another owner. You will lose owner privileges."
					>
						<Button variant="outline" size="sm" disabled>
							Coming soon
						</Button>
					</SettingsRow>
					<SettingsRow
						label="Delete workspace"
						description={
							<span>
								Permanently remove <b>{org.name}</b> and all associated data. This cannot be undone.
							</span>
						}
					>
						<DeleteWorkspaceDialog org={org} orgId={orgId} />
					</SettingsRow>
				</DangerZone>
			)}

			{!canExport && !isOwner && (
				<div className="rounded-[var(--radius)] border border-dashed py-12 text-center text-sm text-muted-foreground">
					<Badge variant="secondary" className="mb-2">Restricted</Badge>
					<p>You don't have access to data exports or workspace management.</p>
				</div>
			)}
		</div>
	);
}
