"use client";

/**
 * core/platform/settings/components/groups/ai/AIApprovalsSection.tsx
 *
 * Post-sprint addition (2026-05-26). Per-user "auto-approve" toggles for
 * AI tool calls. Each row maps to one `approvalCategory` declared by the
 * tool registry (`convex/ai/toolRegistry.ts`).
 *
 * Two cards:
 *
 *   1. **Auto-approve toggles** — 8 user-toggleable categories. When ON,
 *      the AI runs the tool atomically (no propose/commit card). When OFF,
 *      the propose card shows up in chat for explicit approval.
 *
 *   2. **Always-asks (workspace policy)** — 3 read-only rows for the
 *      hard-locked categories: bulk, settings, members. These ALWAYS
 *      show the propose card regardless of any preference and cannot be
 *      bypassed by the user (defence-in-depth).
 *
 * Defaults: see `AUTO_APPROVE_DEFAULTS` in `convex/_shared/aiApprovals.ts`.
 *   - Default ON  → update_record, convert_record, send_message,
 *                   manage_participants, schedule, files
 *   - Default OFF → create_record, delete_record (preserve preview card)
 *
 * Notes:
 *   - All directional CSS uses `ms-/me-/ps-/pe-/start-/end-` per the
 *     RTL-safe rule in AGENTS.md.
 *   - `rounded-[var(--radius)]` is honoured so the workspace's chosen
 *     border radius applies.
 */
import { useMutation, useQuery } from "convex/react";
import { Lock, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import {
	AUTO_APPROVE_DEFAULTS,
	CATEGORY_DISPLAY,
	HARD_LOCKED_CATEGORIES,
	USER_TOGGLEABLE_CATEGORIES,
	type UserToggleableCategory,
} from "@/convex/_shared/aiApprovals";
import { toast } from "@/lib/toast";
import { SettingsSection } from "../../shared/SettingsSection";

// ─── Auto-approve toggles ────────────────────────────────────────────────

function AutoApproveTogglesCard() {
	const me = useQuery(api.users.queries.me, {});
	const updateApprovals = useMutation(api.users.mutations.updateAiApprovals);
	const resetApprovals = useMutation(api.users.mutations.resetAiApprovals);

	const stored = (me?.preferences?.aiApprovals ?? {}) as Partial<
		Record<UserToggleableCategory, boolean>
	>;

	function effectiveValue(key: UserToggleableCategory): boolean {
		const v = stored[key];
		if (typeof v === "boolean") return v;
		return AUTO_APPROVE_DEFAULTS[key];
	}

	async function toggle(key: UserToggleableCategory, value: boolean) {
		try {
			await updateApprovals({ [key]: value });
		} catch (err) {
			toast.mutationError(err, "Could not save preference.");
		}
	}

	async function handleReset() {
		try {
			await resetApprovals({});
			toast.success("Reset to defaults.");
		} catch (err) {
			toast.mutationError(err, "Could not reset preferences.");
		}
	}

	const hasOverrides = Object.keys(stored).length > 0;

	return (
		<Card className="rounded-[var(--radius)]">
			<CardHeader className="flex-row items-start justify-between gap-4">
				<div className="grid gap-1">
					<CardTitle className="text-base">Auto-approve actions</CardTitle>
					<CardDescription>
						Pick which categories the AI can run without showing you a confirmation
						card. When auto-approved, the action runs atomically and the AI moves on
						faster. Defaults are conservative — deletes and single-record creates still
						ask by default.
					</CardDescription>
				</div>
				<Button
					variant="outline"
					size="sm"
					onClick={handleReset}
					disabled={!hasOverrides}
					className="rounded-[var(--radius)]"
				>
					<RotateCcw className="size-3.5 me-1.5" />
					Reset defaults
				</Button>
			</CardHeader>
			<CardContent className="grid gap-3">
				{USER_TOGGLEABLE_CATEGORIES.map((key) => {
					const def = AUTO_APPROVE_DEFAULTS[key];
					const value = effectiveValue(key);
					const overridden = typeof stored[key] === "boolean" && stored[key] !== def;
					const display = CATEGORY_DISPLAY[key];
					return (
						<div
							key={key}
							className="flex items-start justify-between gap-4 rounded-[var(--radius)] border border-border/60 p-3"
						>
							<div className="grid gap-1">
								<div className="flex items-center gap-2">
									<Label
										htmlFor={`approval-${key}`}
										className="text-sm font-medium"
									>
										{display.label}
									</Label>
									{overridden ? (
										<Badge
											variant="secondary"
											className="rounded-[var(--radius)] text-[10px]"
										>
											Custom
										</Badge>
									) : (
										<span className="text-[10px] text-muted-foreground">
											Default {def ? "ON" : "OFF"}
										</span>
									)}
								</div>
								<p className="text-xs text-muted-foreground">
									{display.description}
								</p>
							</div>
							<Switch
								id={`approval-${key}`}
								checked={value}
								onCheckedChange={(v) => toggle(key, v)}
							/>
						</div>
					);
				})}
			</CardContent>
		</Card>
	);
}

// ─── Hard-locked rows (read-only) ────────────────────────────────────────

function AlwaysAsksCard() {
	return (
		<Card className="rounded-[var(--radius)] border-amber-200/50 dark:border-amber-900/30">
			<CardHeader>
				<CardTitle className="text-base flex items-center gap-2">
					<Lock className="size-4 text-amber-600 dark:text-amber-400" />
					Always asks for approval
				</CardTitle>
				<CardDescription>
					These categories always show the confirmation card regardless of any preference
					above. The lock is workspace policy — broad-impact actions deserve a deliberate
					human step.
				</CardDescription>
			</CardHeader>
			<CardContent className="grid gap-3">
				{HARD_LOCKED_CATEGORIES.map((key) => {
					const display = CATEGORY_DISPLAY[key];
					return (
						<div
							key={key}
							className="flex items-start justify-between gap-4 rounded-[var(--radius)] border border-dashed border-amber-300/50 dark:border-amber-700/40 p-3 bg-amber-50/40 dark:bg-amber-950/20"
						>
							<div className="grid gap-1">
								<Label className="text-sm font-medium">{display.label}</Label>
								<p className="text-xs text-muted-foreground">
									{display.description}
								</p>
							</div>
							<Badge
								variant="outline"
								className="rounded-[var(--radius)] border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 shrink-0"
							>
								Locked
							</Badge>
						</div>
					);
				})}
			</CardContent>
		</Card>
	);
}

// ─── Public export ───────────────────────────────────────────────────────

export function AIApprovalsSection() {
	return (
		<SettingsSection
			id="ai.approvals"
			title="Approvals"
			description="Decide which actions the AI can run without asking — and which always require a confirmation card."
		>
			<div className="grid gap-4">
				<AutoApproveTogglesCard />
				<AlwaysAsksCard />
			</div>
		</SettingsSection>
	);
}
