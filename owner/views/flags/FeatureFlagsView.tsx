"use client";

/**
 * Owner-panel feature-flags view (Stage 6 — real implementation).
 *
 * Lists every `featureFlags` row. Each row shows the global toggle,
 * description, and current per-org overrides. The owner can toggle the
 * global default, and remove individual per-org overrides. Adding new
 * overrides requires an org id paste — keeping the UX simple; a richer
 * org picker is a future enhancement once the panel has an org-search
 * surface (currently scoped out per L7 — no org list).
 *
 * Spec: PLATFORM-OWNER-PANEL.md §5 row 5, §10 stage 6.
 */
import { useMutation, useQuery } from "convex/react";
import { Loader2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { normalizeError } from "@/lib/normalizeError";
import { OwnerSettingsCard } from "../../components/OwnerSettingsCard";

export function FeatureFlagsView() {
	const flags = useQuery(api._platform.flags.queries.listFlags, {});
	const setFlagEnabled = useMutation(api._platform.flags.mutations.setFlagEnabled);

	if (flags === undefined) {
		return (
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Loader2 className="h-4 w-4 animate-spin" /> Loading flags…
			</div>
		);
	}

	if (flags.length === 0) {
		return (
			<OwnerSettingsCard
				title="Feature flags"
				description="No flags exist yet. The first toggle creates the row automatically."
			>
				<NewFlagRow
					onCreate={async (key, enabled, description) => {
						try {
							await setFlagEnabled({ key, enabled, description });
							toast.success(`Created flag "${key}"`);
						} catch (err) {
							toast.error(normalizeError(err, "Failed to create flag"));
						}
					}}
				/>
			</OwnerSettingsCard>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			{flags.map((flag) => (
				<FlagCard key={flag._id} flag={flag} />
			))}
			<OwnerSettingsCard
				title="Add a new flag"
				description="Toggle a brand-new key. Overrides can be added once the row exists."
			>
				<NewFlagRow
					onCreate={async (key, enabled, description) => {
						try {
							await setFlagEnabled({ key, enabled, description });
							toast.success(`Created flag "${key}"`);
						} catch (err) {
							toast.error(normalizeError(err, "Failed to create flag"));
						}
					}}
				/>
			</OwnerSettingsCard>
		</div>
	);
}

type Flag = NonNullable<
	ReturnType<typeof useQuery<typeof api._platform.flags.queries.listFlags>>
>[number];

function FlagCard({ flag }: { flag: Flag }) {
	const setFlagEnabled = useMutation(api._platform.flags.mutations.setFlagEnabled);
	const setOrgOverride = useMutation(api._platform.flags.mutations.setOrgOverride);

	const [busy, setBusy] = useState(false);
	const overrides = Object.entries(flag.orgOverrides);

	return (
		<OwnerSettingsCard title={flag.key} description={flag.description ?? "No description set."}>
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
				<div className="space-y-1">
					<p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
						Global default
					</p>
					<p className="text-sm">
						{flag.enabled ? (
							<span className="text-green-600 dark:text-green-400">Enabled</span>
						) : (
							<span className="text-muted-foreground">Disabled</span>
						)}
					</p>
				</div>
				<Switch
					checked={flag.enabled}
					disabled={busy}
					onCheckedChange={async (v) => {
						setBusy(true);
						try {
							await setFlagEnabled({ key: flag.key, enabled: v });
							toast.success(`${flag.key} ${v ? "enabled" : "disabled"}`);
						} catch (err) {
							toast.error(normalizeError(err, "Failed to toggle flag"));
						} finally {
							setBusy(false);
						}
					}}
				/>
			</div>

			<div className="pt-3">
				<p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
					Per-org overrides
				</p>
				{overrides.length === 0 ? (
					<p className="text-xs text-muted-foreground">
						No overrides — every org follows the global default.
					</p>
				) : (
					<ul className="space-y-1">
						{overrides.map(([orgId, enabled]) => (
							<li
								key={orgId}
								className="flex items-center justify-between gap-2 rounded-[var(--radius)] border border-border/60 px-2 py-1 text-xs"
							>
								<span className="truncate font-mono">{orgId}</span>
								<span className="flex items-center gap-2">
									<span
										className={
											enabled
												? "text-green-600 dark:text-green-400"
												: "text-muted-foreground"
										}
									>
										{enabled ? "ON" : "OFF"}
									</span>
									<Button
										type="button"
										size="sm"
										variant="ghost"
										onClick={async () => {
											try {
												await setOrgOverride({
													key: flag.key,
													orgId: orgId as Id<"orgs">,
													enabled: null,
												});
												toast.success("Override removed");
											} catch (err) {
												toast.error(
													normalizeError(
														err,
														"Failed to remove override",
													),
												);
											}
										}}
									>
										<X className="h-3 w-3" />
										<span className="sr-only">Remove override</span>
									</Button>
								</span>
							</li>
						))}
					</ul>
				)}

				<NewOverrideRow
					onSet={async (orgIdRaw, enabled) => {
						try {
							await setOrgOverride({
								key: flag.key,
								orgId: orgIdRaw as Id<"orgs">,
								enabled,
							});
							toast.success("Override saved");
						} catch (err) {
							toast.error(normalizeError(err, "Failed to set override"));
						}
					}}
				/>
			</div>
		</OwnerSettingsCard>
	);
}

function NewFlagRow({
	onCreate,
}: {
	onCreate: (key: string, enabled: boolean, description: string | undefined) => Promise<void>;
}) {
	const [key, setKey] = useState("");
	const [description, setDescription] = useState("");
	const [enabled, setEnabled] = useState(false);
	const [busy, setBusy] = useState(false);

	return (
		<div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto_auto]">
			<Input
				placeholder="flag.key"
				value={key}
				onChange={(e) => setKey(e.target.value)}
				autoComplete="off"
			/>
			<Input
				placeholder="Description (optional)"
				value={description}
				onChange={(e) => setDescription(e.target.value)}
				autoComplete="off"
			/>
			<span className="flex items-center gap-2 text-xs">
				<Switch checked={enabled} onCheckedChange={setEnabled} />
				Enabled
			</span>
			<Button
				type="button"
				size="sm"
				disabled={busy || !key.trim()}
				onClick={async () => {
					setBusy(true);
					try {
						await onCreate(key.trim(), enabled, description.trim() || undefined);
						setKey("");
						setDescription("");
						setEnabled(false);
					} finally {
						setBusy(false);
					}
				}}
			>
				{busy ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
				Create
			</Button>
		</div>
	);
}

function NewOverrideRow({ onSet }: { onSet: (orgId: string, enabled: boolean) => Promise<void> }) {
	const [orgId, setOrgId] = useState("");
	const [enabled, setEnabled] = useState(true);
	const [busy, setBusy] = useState(false);

	return (
		<div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
			<Input
				placeholder="orgId (paste from Convex dashboard)"
				value={orgId}
				onChange={(e) => setOrgId(e.target.value)}
				autoComplete="off"
				className="flex-1 font-mono text-xs"
			/>
			<span className="flex items-center gap-2 text-xs">
				<Switch checked={enabled} onCheckedChange={setEnabled} />
				{enabled ? "ON" : "OFF"}
			</span>
			<Button
				type="button"
				size="sm"
				variant="outline"
				disabled={busy || !orgId.trim()}
				onClick={async () => {
					setBusy(true);
					try {
						await onSet(orgId.trim(), enabled);
						setOrgId("");
					} finally {
						setBusy(false);
					}
				}}
			>
				Add override
			</Button>
		</div>
	);
}
