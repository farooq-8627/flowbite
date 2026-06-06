"use client";

/**
 * Settings → AI → Autonomy. Replaces the deleted AIApprovalsSection.
 *
 * Surfaces the four `org.settings.aiAutonomy` knobs:
 *   • autoActFromConversations — whether the autonomous engine acts on
 *     inbound conversations without an agent prompt (S11).
 *   • destructiveRequires2FA — read-only `true`. Pinned by the V2 risk
 *     gate (`convex/ai/registry/gate.ts:needsStepUp`).
 *   • whatsappAgentEnabled — Mode C of the WhatsApp Agent Profile (S15).
 *     Off until the org has the `ai.whatsappAgent` permission.
 *   • perRoleAutonomyCap — optional per-role ceiling.
 */

import { useMutation, useQuery } from "convex/react";
import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useOrgPermissions } from "@/core/shell/shared/hooks/useCurrentOrg";
import { toast } from "@/lib/toast";
import { SettingsSection } from "../../shared/SettingsSection";

type AutonomyCap = "read" | "reversible" | "all";

const CAP_LABELS: Record<AutonomyCap | "none", string> = {
	none: "No cap (org default)",
	read: "Read-only",
	reversible: "Reversible writes",
	all: "All (irreversible still 2FA-fenced)",
};

const CAP_OPTIONS: AutonomyCap[] = ["read", "reversible", "all"];

function AutonomyTogglesCard({ orgId }: { orgId: Id<"orgs"> }) {
	const fullSettings = useQuery(api.orgs.queries.getFullSettings, { orgId });
	const update = useMutation(api.orgs.mutations.update);
	const permissions = useOrgPermissions();
	const canEdit = permissions.includes("org.editSettings");

	const autonomy = (fullSettings?.settings?.aiAutonomy ?? {}) as {
		autoActFromConversations?: boolean;
		whatsappAgentEnabled?: boolean;
	};
	const autoAct = autonomy.autoActFromConversations ?? true;
	const waEnabled = autonomy.whatsappAgentEnabled ?? false;

	async function patch(next: {
		autoActFromConversations?: boolean;
		whatsappAgentEnabled?: boolean;
	}) {
		try {
			await update({ orgId, settings: { aiAutonomy: next } });
		} catch (err) {
			toast.mutationError(err, "Could not save autonomy setting.");
		}
	}

	return (
		<Card className="rounded-[var(--radius)]">
			<CardHeader>
				<CardTitle className="text-base">Autonomy</CardTitle>
				<CardDescription>
					Decide when the AI may act without a human prompt. Org-wide policy — applies to
					every member. Destructive actions still require a 2FA confirm regardless.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-3">
				<div className="flex items-start justify-between gap-4 rounded-[var(--radius)] border border-border/60 p-3">
					<div className="grid gap-1">
						<Label className="text-sm font-medium">Auto-act on conversations</Label>
						<p className="text-xs text-muted-foreground">
							When the AI sees a customer message (WhatsApp, web), it dedups, creates
							leads, fills fields, and schedules follow-ups under the conversation
							owner's permissions — without an agent prompt. Turn off to require an
							explicit command for every action.
						</p>
					</div>
					<Switch
						checked={autoAct}
						disabled={!canEdit}
						onCheckedChange={(v) => patch({ autoActFromConversations: v })}
					/>
				</div>

				<div className="flex items-start justify-between gap-4 rounded-[var(--radius)] border border-border/60 p-3">
					<div className="grid gap-1">
						<div className="flex items-center gap-2">
							<Label className="text-sm font-medium">WhatsApp Agent Profile</Label>
							<Badge
								variant="outline"
								className="rounded-[var(--radius)] text-[10px]"
							>
								requires ai.whatsappAgent permission
							</Badge>
						</div>
						<p className="text-xs text-muted-foreground">
							Off by default. When on, an AI persona replies directly to customer
							WhatsApp messages with a constrained tool set (answer from CRM/FAQ,
							capture lead info, escalate to a human). Requires WhatsApp Business
							approval + a Twilio sender — see runbook before flipping on.
						</p>
					</div>
					<Switch
						checked={waEnabled}
						disabled={!canEdit}
						onCheckedChange={(v) => patch({ whatsappAgentEnabled: v })}
					/>
				</div>

				<div className="flex items-start justify-between gap-4 rounded-[var(--radius)] border border-dashed border-amber-300/50 p-3 bg-amber-50/40 dark:border-amber-700/40 dark:bg-amber-950/20">
					<div className="grid gap-1">
						<div className="flex items-center gap-2">
							<Lock className="size-4 text-amber-600 dark:text-amber-400" />
							<Label className="text-sm font-medium">
								Destructive actions require 2FA
							</Label>
						</div>
						<p className="text-xs text-muted-foreground">
							Every irreversible capability (bulk delete, settings/schema edits,
							member role changes) requires a 2FA confirm — and is never reachable
							over WhatsApp. Hard-locked policy; cannot be disabled.
						</p>
					</div>
					<Badge
						variant="outline"
						className="rounded-[var(--radius)] border-amber-300 text-amber-700 shrink-0 dark:border-amber-700 dark:text-amber-300"
					>
						Locked
					</Badge>
				</div>
			</CardContent>
		</Card>
	);
}

function PerRoleAutonomyCapCard({ orgId }: { orgId: Id<"orgs"> }) {
	const fullSettings = useQuery(api.orgs.queries.getFullSettings, { orgId });
	const roles = useQuery(api.orgRoles.queries.list, { orgId });
	const update = useMutation(api.orgs.mutations.update);
	const permissions = useOrgPermissions();
	const canEdit = permissions.includes("org.editSettings");

	const caps =
		(
			(fullSettings?.settings?.aiAutonomy ?? {}) as {
				perRoleAutonomyCap?: Record<string, AutonomyCap>;
			}
		).perRoleAutonomyCap ?? {};

	async function setCap(roleName: string, value: AutonomyCap | "none") {
		const next: Record<string, AutonomyCap> = { ...caps };
		if (value === "none") delete next[roleName];
		else next[roleName] = value;
		try {
			await update({ orgId, settings: { aiAutonomy: { perRoleAutonomyCap: next } } });
		} catch (err) {
			toast.mutationError(err, "Could not save role cap.");
		}
	}

	return (
		<Card className="rounded-[var(--radius)]">
			<CardHeader>
				<CardTitle className="text-base">Per-role autonomy cap (optional)</CardTitle>
				<CardDescription>
					Tighten what the AI may auto-execute as members of a role. Leave at "No cap" to
					inherit the org-wide policy. Irreversible actions still require 2FA regardless.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-2">
				{(roles ?? []).map((role) => {
					const value: AutonomyCap | "none" = caps[role.name] ?? "none";
					return (
						<div
							key={role._id}
							className="flex items-center justify-between gap-4 rounded-[var(--radius)] border border-border/60 p-3"
						>
							<div className="grid gap-0.5">
								<Label className="text-sm font-medium">{role.name}</Label>
								<p className="text-xs text-muted-foreground">
									{role.description ?? ""}
								</p>
							</div>
							<Select
								value={value}
								disabled={!canEdit}
								onValueChange={(v) => setCap(role.name, v as AutonomyCap | "none")}
							>
								<SelectTrigger className="w-[220px] rounded-[var(--radius)]">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">{CAP_LABELS.none}</SelectItem>
									{CAP_OPTIONS.map((opt) => (
										<SelectItem key={opt} value={opt}>
											{CAP_LABELS[opt]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					);
				})}
				{(!roles || roles.length === 0) && (
					<p className="text-xs text-muted-foreground">Loading roles…</p>
				)}
			</CardContent>
		</Card>
	);
}

export function AIAutonomySection({ orgId }: { orgId: Id<"orgs"> }) {
	return (
		<SettingsSection
			id="ai.autonomy"
			title="Autonomy & Safety"
			description="Org-wide policy for what the AI may do without asking. Applies to every member; destructive actions are always fenced by 2FA."
		>
			<div className="grid gap-4">
				<AutonomyTogglesCard orgId={orgId} />
				<PerRoleAutonomyCapCard orgId={orgId} />
			</div>
		</SettingsSection>
	);
}
