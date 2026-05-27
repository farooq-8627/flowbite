"use client";

/**
 * Owner-panel AI Keys view.
 *
 * Renders the active platform AI keys + a form to add/rotate one. Owner
 * panel is the only place these keys can be managed — the regular
 * dashboard's Settings → AI surfaces BYOK (per-user/per-org) keys, NOT
 * platform-wide ones.
 *
 * Add flow:
 *   1. Owner selects a provider (auto-detected from the key prefix when
 *      possible) + optional name + optional baseUrl (for `custom`,
 *      `nvidia`, `openrouter` self-hosted).
 *   2. Submit calls `_platform/aiKeys/actions:addPlatformKey` (Node action
 *      because encryption needs `node:crypto`).
 *   3. The action encrypts plaintext, writes via internal mutation,
 *      deactivates any existing active row for the same provider, and
 *      audit-logs the rotation.
 *
 * Remove flow: `_platform/aiKeys/mutations:remove` soft-deactivates the
 * row. The rotation history stays in `platformAuditLogs` for forensic
 * purposes.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §5 (added 2026-05-27).
 */
import { useAction, useMutation, useQuery } from "convex/react";
import { Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { normalizeError } from "@/lib/normalizeError";
import { OwnerSettingsCard } from "../../components/OwnerSettingsCard";

const PROVIDERS = [
	{ id: "anthropic", label: "Anthropic (Claude)" },
	{ id: "openai", label: "OpenAI (GPT)" },
	{ id: "google", label: "Google (Gemini)" },
	{ id: "xai", label: "xAI (Grok)" },
	{ id: "groq", label: "Groq" },
	{ id: "mistral", label: "Mistral" },
	{ id: "openrouter", label: "OpenRouter" },
	{ id: "nvidia", label: "NVIDIA NIM" },
	{ id: "moonshot", label: "Moonshot (Kimi)" },
	{ id: "custom", label: "Custom OpenAI-compat" },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

export function AIKeysView() {
	const keys = useQuery(api._platform.aiKeys.queries.list, {});
	const add = useAction(api._platform.aiKeys.actions.addPlatformKey);
	const remove = useMutation(api._platform.aiKeys.mutations.remove);

	const [provider, setProvider] = useState<ProviderId>("anthropic");
	const [apiKey, setApiKey] = useState("");
	const [name, setName] = useState("");
	const [baseUrl, setBaseUrl] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [busyId, setBusyId] = useState<Id<"platformAiKeys"> | null>(null);

	async function handleAdd() {
		if (!apiKey || apiKey.length < 10) {
			toast.error("API key looks too short");
			return;
		}
		setSubmitting(true);
		try {
			await add({
				apiKey,
				provider,
				name: name.trim() || undefined,
				baseUrl: baseUrl.trim() || undefined,
			});
			toast.success("Platform key saved");
			setApiKey("");
			setName("");
			setBaseUrl("");
		} catch (err) {
			toast.error(normalizeError(err, "Could not save key"));
		} finally {
			setSubmitting(false);
		}
	}

	async function handleRemove(keyId: Id<"platformAiKeys">) {
		setBusyId(keyId);
		try {
			await remove({ keyId });
			toast.success("Key removed");
		} catch (err) {
			toast.error(normalizeError(err, "Could not remove key"));
		} finally {
			setBusyId(null);
		}
	}

	const showBaseUrl = provider === "custom" || provider === "openrouter" || provider === "nvidia";

	return (
		<div className="flex flex-col gap-4">
			<OwnerSettingsCard
				title="Add platform key"
				description="Platform keys cover every workspace that hasn't set its own. Used by Morning Briefing, chat-title generation, suggestion ranking, and any internal AI call. One active key per provider — adding a new one deactivates the previous."
			>
				<div className="grid gap-3">
					<label className="grid gap-1 text-xs">
						<span className="font-medium text-foreground">Provider</span>
						<select
							value={provider}
							onChange={(e) => setProvider(e.target.value as ProviderId)}
							className="h-9 rounded-[var(--radius)] border border-input bg-background px-3 text-sm outline-none focus:border-ring"
						>
							{PROVIDERS.map((p) => (
								<option key={p.id} value={p.id}>
									{p.label}
								</option>
							))}
						</select>
					</label>
					<label className="grid gap-1 text-xs">
						<span className="font-medium text-foreground">API key</span>
						<input
							type="password"
							value={apiKey}
							onChange={(e) => setApiKey(e.target.value)}
							placeholder="sk-..."
							autoComplete="off"
							className="h-9 rounded-[var(--radius)] border border-input bg-background px-3 font-mono text-sm outline-none focus:border-ring"
						/>
						<span className="text-[11px] text-muted-foreground">
							The key is encrypted with AES-GCM before storage. We never log
							plaintext.
						</span>
					</label>
					<label className="grid gap-1 text-xs">
						<span className="font-medium text-foreground">Name (optional)</span>
						<input
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g. Production Anthropic"
							className="h-9 rounded-[var(--radius)] border border-input bg-background px-3 text-sm outline-none focus:border-ring"
						/>
					</label>
					{showBaseUrl && (
						<label className="grid gap-1 text-xs">
							<span className="font-medium text-foreground">Base URL (optional)</span>
							<input
								type="url"
								value={baseUrl}
								onChange={(e) => setBaseUrl(e.target.value)}
								placeholder="https://api.example.com/v1"
								className="h-9 rounded-[var(--radius)] border border-input bg-background px-3 font-mono text-sm outline-none focus:border-ring"
							/>
						</label>
					)}
					<div>
						<Button
							type="button"
							onClick={handleAdd}
							disabled={submitting || !apiKey}
							className="gap-1.5"
						>
							{submitting ? (
								<Loader2 className="size-4 animate-spin" />
							) : (
								<Plus className="size-4" />
							)}
							Save key
						</Button>
					</div>
				</div>
			</OwnerSettingsCard>

			<OwnerSettingsCard
				title="Active platform keys"
				description="Active keys are read after BYOK fallback (per-user → per-org → platform DB → env)."
			>
				{keys === undefined ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
						Loading…
					</div>
				) : keys.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No platform keys yet. Add one above — it'll start serving every workspace
						that doesn't have its own.
					</p>
				) : (
					<ul className="space-y-2 text-xs">
						{keys.map((k) => (
							<li
								key={k._id}
								className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border/60 px-3 py-2"
							>
								<div className="flex min-w-0 items-center gap-2">
									<ShieldCheck className="size-4 shrink-0 text-emerald-500" />
									<div className="min-w-0">
										<p className="text-xs font-medium">
											{k.name ??
												PROVIDERS.find((p) => p.id === k.provider)?.label ??
												k.provider}
										</p>
										<p className="truncate text-[11px] text-muted-foreground">
											<span className="font-mono">{k.provider}</span>
											{" · "}
											<span className="font-mono">{k.keyHint}</span>
											{k.baseUrl ? (
												<>
													{" · "}
													<span className="font-mono">{k.baseUrl}</span>
												</>
											) : null}
										</p>
									</div>
								</div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={busyId === k._id}
									onClick={() => handleRemove(k._id as Id<"platformAiKeys">)}
									className="gap-1"
								>
									{busyId === k._id ? (
										<Loader2 className="size-3.5 animate-spin" />
									) : (
										<Trash2 className="size-3.5" />
									)}
									Remove
								</Button>
							</li>
						))}
					</ul>
				)}
			</OwnerSettingsCard>
		</div>
	);
}
