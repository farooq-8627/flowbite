"use client";
/**
 * core/platform/settings/components/groups/ai/AIAutomationSection.tsx
 *
 * Stage 8 of /SPRINT-PLAN.md (Autonomous layer). Settings → AI →
 * Automation. Two cards:
 *
 *   1. **Autonomy toggles** — per-user opt-ins (default off). Drives the
 *      `users.preferences.aiAutonomy` map; gate at every trigger site
 *      (auto-followup on stage move, auto-enrich on contact create,
 *      etc.).
 *   2. **Standing orders editor** — list + create + delete + enable
 *      toggle. Permission-gated on `ai.automation.manage` (Owner+Admin).
 *      Members see a friendly "ask an Owner" empty state.
 *
 * Notes:
 *   - The schedule field supports `interval` directly via a number input
 *     in the editor; daily / weekly schedules are rendered read-only
 *     (the AI tool surface or a future expanded editor authors them).
 *   - All directional CSS uses `ms-/me-/ps-/pe-/start-/end-` per the
 *     RTL-safe rule in AGENTS.md.
 *   - `rounded-[var(--radius)]` is honoured so the workspace's chosen
 *     border radius applies.
 */
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useOrgPermissions } from "@/core/shell/shared/hooks/useCurrentOrg";
import { toast } from "@/lib/toast";
import { SettingsSection } from "../../shared/SettingsSection";

const MIN_INTERVAL_MINUTES = 5;
const DEFAULT_INTERVAL_MINUTES = 60;

// ─── Autonomy toggles ────────────────────────────────────────────────────

const AUTONOMY_FIELDS: Array<{
	key:
		| "autoTaskOnStageMove"
		| "autoEnrichOnContactCreate"
		| "autoTagOnNote"
		| "weeklyDigestEmail";
	label: string;
	description: string;
}> = [
	{
		key: "autoTaskOnStageMove",
		label: "Auto follow-up task on stage move",
		description:
			"When a deal moves to a stage that has a default follow-up template, automatically schedule a follow-up task.",
	},
	{
		key: "autoEnrichOnContactCreate",
		label: "Auto-enrich on contact create",
		description:
			"When a contact is created with an email or phone, auto-run the enrichment waterfall in the background.",
	},
	{
		key: "autoTagOnNote",
		label: "Auto-tag on note",
		description: "Auto-classify and tag a record when a new note is added (where confident).",
	},
	{
		key: "weeklyDigestEmail",
		label: "Weekly digest email",
		description:
			"Receive a Monday-morning email with deals at risk, wins, and anything stuck longer than expected.",
	},
];

function AutonomyTogglesCard({ orgId }: { orgId: Id<"orgs"> }) {
	void orgId; // present for future per-org overrides
	const me = useQuery(api.users.queries.me, {});
	const updateAutonomy = useMutation(api.users.mutations.updateAiAutonomy);
	const flags = me?.preferences?.aiAutonomy ?? {};

	async function toggle(
		key:
			| "autoTaskOnStageMove"
			| "autoEnrichOnContactCreate"
			| "autoTagOnNote"
			| "weeklyDigestEmail",
		value: boolean,
	) {
		try {
			await updateAutonomy({ [key]: value });
		} catch (err) {
			toast.mutationError(err, "Could not save preference.");
		}
	}

	return (
		<Card className="rounded-[var(--radius)]">
			<CardHeader>
				<CardTitle className="text-base">Autonomous actions</CardTitle>
				<CardDescription>
					Per-user opt-ins. When off, the AI never triggers these on its own — every key
					defaults to off.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-4">
				{AUTONOMY_FIELDS.map((f) => {
					const value = flags[f.key] === true;
					return (
						<div
							key={f.key}
							className="flex items-start justify-between gap-4 rounded-[var(--radius)] border border-border/60 p-3"
						>
							<div className="grid gap-1">
								<Label
									htmlFor={`autonomy-${f.key}`}
									className="text-sm font-medium"
								>
									{f.label}
								</Label>
								<p className="text-xs text-muted-foreground">{f.description}</p>
							</div>
							<Switch
								id={`autonomy-${f.key}`}
								checked={value}
								onCheckedChange={(v) => toggle(f.key, v)}
							/>
						</div>
					);
				})}
			</CardContent>
		</Card>
	);
}

// ─── Standing orders editor ──────────────────────────────────────────────

function describeScheduleClient(schedule: {
	kind: "interval" | "daily" | "weekly";
	intervalMinutes?: number;
	utcHour?: number;
	utcMinute?: number;
	dayOfWeek?: number;
}): string {
	if (schedule.kind === "interval") {
		return `Every ${schedule.intervalMinutes ?? "?"} minute(s)`;
	}
	const hh = String(schedule.utcHour ?? 0).padStart(2, "0");
	const mm = String(schedule.utcMinute ?? 0).padStart(2, "0");
	if (schedule.kind === "daily") return `Daily at ${hh}:${mm} UTC`;
	const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	return `Weekly on ${days[schedule.dayOfWeek ?? 0] ?? "?"} at ${hh}:${mm} UTC`;
}

function StandingOrderRow({
	row,
	orgId,
}: {
	row: {
		id: Id<"aiStandingOrders">;
		name: string;
		prompt: string;
		allowedTools: string[];
		schedule: {
			kind: "interval" | "daily" | "weekly";
			intervalMinutes?: number;
			utcHour?: number;
			utcMinute?: number;
			dayOfWeek?: number;
		};
		scheduleLabel: string;
		enabled: boolean;
		lastRunAt?: number;
		lastRunSummary?: string;
		lastRunStatus?: string;
	};
	orgId: Id<"orgs">;
}) {
	const update = useMutation(api.ai.standingOrders.mutations.update);
	const remove = useMutation(api.ai.standingOrders.mutations.remove);

	async function toggle(value: boolean) {
		try {
			await update({ orgId, standingOrderId: row.id, enabled: value });
		} catch (err) {
			toast.mutationError(err, "Could not toggle standing order.");
		}
	}

	async function deleteRow() {
		try {
			await remove({ orgId, standingOrderId: row.id });
			toast.success(`"${row.name}" removed.`);
		} catch (err) {
			toast.mutationError(err, "Could not remove standing order.");
		}
	}

	return (
		<div className="rounded-[var(--radius)] border border-border/60 p-3">
			<div className="flex items-start justify-between gap-3">
				<div className="grid gap-1">
					<div className="flex items-center gap-2">
						<span className="text-sm font-medium">{row.name}</span>
						<span className="text-xs text-muted-foreground">{row.scheduleLabel}</span>
					</div>
					<p className="text-xs text-muted-foreground line-clamp-2">{row.prompt}</p>
					<div className="text-xs text-muted-foreground">
						<span className="font-medium">Allowed tools:</span>{" "}
						{row.allowedTools.length === 0
							? "(none — read-only)"
							: row.allowedTools.join(", ")}
					</div>
					{row.lastRunAt && (
						<div className="text-xs text-muted-foreground">
							<span className="font-medium">
								Last run {row.lastRunStatus ?? "ok"} at{" "}
								{new Date(row.lastRunAt).toLocaleString()}:
							</span>{" "}
							{row.lastRunSummary ?? "—"}
						</div>
					)}
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<Switch checked={row.enabled} onCheckedChange={toggle} />
					<Button size="sm" variant="ghost" onClick={deleteRow}>
						Delete
					</Button>
				</div>
			</div>
		</div>
	);
}

function NewStandingOrderForm({ orgId }: { orgId: Id<"orgs"> }) {
	const create = useMutation(api.ai.standingOrders.mutations.create);
	const [name, setName] = useState("");
	const [prompt, setPrompt] = useState("");
	const [tools, setTools] = useState("search_crm,list_stale_records,create_followup");
	const [interval, setInterval] = useState<number>(DEFAULT_INTERVAL_MINUTES);
	const [busy, setBusy] = useState(false);

	async function submit(e: React.FormEvent) {
		e.preventDefault();
		if (busy) return;
		const cleanTools = tools
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean);
		if (cleanTools.length === 0) {
			toast.error("Add at least one allowed tool.");
			return;
		}
		const intervalMinutes = Math.max(MIN_INTERVAL_MINUTES, Math.floor(interval || 0));
		setBusy(true);
		try {
			await create({
				orgId,
				name,
				prompt,
				allowedTools: cleanTools,
				schedule: { kind: "interval", intervalMinutes },
			});
			toast.success(`"${name}" created.`);
			setName("");
			setPrompt("");
			setTools("search_crm,list_stale_records,create_followup");
			setInterval(DEFAULT_INTERVAL_MINUTES);
		} catch (err) {
			toast.mutationError(err, "Could not create standing order.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<form
			onSubmit={submit}
			className="grid gap-3 rounded-[var(--radius)] border border-dashed border-border/60 p-3"
		>
			<div className="grid gap-1">
				<Label htmlFor="so-name" className="text-xs font-medium">
					Name
				</Label>
				<Input
					id="so-name"
					value={name}
					onChange={(e) => setName(e.target.value)}
					placeholder="Daily stale-leads scan"
					maxLength={80}
					required
				/>
			</div>
			<div className="grid gap-1">
				<Label htmlFor="so-prompt" className="text-xs font-medium">
					Prompt
				</Label>
				<Textarea
					id="so-prompt"
					value={prompt}
					onChange={(e) => setPrompt(e.target.value)}
					placeholder="Find leads with no activity in 14 days, create a follow-up reminder for each, and reply with a 3-sentence summary."
					rows={3}
					maxLength={2000}
					required
				/>
			</div>
			<div className="grid gap-1 sm:grid-cols-2 sm:gap-3">
				<div className="grid gap-1">
					<Label htmlFor="so-tools" className="text-xs font-medium">
						Allowed tools (comma-separated)
					</Label>
					<Input
						id="so-tools"
						value={tools}
						onChange={(e) => setTools(e.target.value)}
						placeholder="search_crm,list_stale_records,create_followup"
					/>
				</div>
				<div className="grid gap-1">
					<Label htmlFor="so-interval" className="text-xs font-medium">
						Run every (minutes, ≥ {MIN_INTERVAL_MINUTES})
					</Label>
					<Input
						id="so-interval"
						type="number"
						min={MIN_INTERVAL_MINUTES}
						value={interval}
						onChange={(e) => setInterval(Number(e.target.value))}
					/>
				</div>
			</div>
			<div className="flex justify-end">
				<Button type="submit" disabled={busy}>
					{busy ? "Creating…" : "Create standing order"}
				</Button>
			</div>
		</form>
	);
}

function StandingOrdersCard({ orgId }: { orgId: Id<"orgs"> }) {
	const rows = useQuery(api.ai.standingOrders.queries.listForUser, { orgId });

	return (
		<Card className="rounded-[var(--radius)]">
			<CardHeader>
				<CardTitle className="text-base">Standing orders</CardTitle>
				<CardDescription>
					Cron-driven prompts that run autonomously. Each order runs as you, with a tool
					whitelist you choose. Audit rows are written to the AI changelog every run.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-3">
				{rows === undefined ? (
					<p className="text-sm text-muted-foreground">Loading…</p>
				) : rows.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No standing orders yet. Create one below.
					</p>
				) : (
					<div className="grid gap-2">
						{rows.map((row) => (
							<StandingOrderRow
								key={row.id}
								row={{
									...row,
									scheduleLabel: describeScheduleClient(row.schedule),
								}}
								orgId={orgId}
							/>
						))}
					</div>
				)}
				<NewStandingOrderForm orgId={orgId} />
			</CardContent>
		</Card>
	);
}

// ─── Public surface ──────────────────────────────────────────────────────

export function AIAutomationSection({ orgId }: { orgId: Id<"orgs"> }) {
	const permissions = useOrgPermissions();
	const canManage = permissions.includes("ai.automation.manage");
	return (
		<SettingsSection
			id="ai.automation"
			title="AI Automation"
			description="Standing orders + per-user autonomy preferences. The AI never fires an autonomous action without an explicit opt-in."
		>
			<div className="grid gap-4">
				<AutonomyTogglesCard orgId={orgId} />
				{canManage ? (
					<StandingOrdersCard orgId={orgId} />
				) : (
					<Card className="rounded-[var(--radius)] border-dashed">
						<CardContent className="py-6 text-sm text-muted-foreground">
							Ask an Owner or Admin to set up workspace-wide standing orders. You can
							still configure your own autonomy preferences above.
						</CardContent>
					</Card>
				)}
			</div>
		</SettingsSection>
	);
}
