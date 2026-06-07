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
 *   1. Owner pastes a key. Provider is AUTO-DETECTED from the key prefix
 *      via `detectProvider(apiKey)` (same helper the per-org BYOK form
 *      uses — `core/platform/settings/components/groups/ai/ApiKeySection.tsx`).
 *      If detection lands on `custom` (ambiguous `sk-…` prefix shared by
 *      OpenAI legacy / Moonshot / fine-tuned providers) the form requires
 *      the owner to pick a provider explicitly so we don't tag a Moonshot
 *      key as OpenAI.
 *   2. Optional name + optional baseUrl (for `custom`, `nvidia`,
 *      `openrouter` self-hosted, `moonshot` .cn endpoint).
 *   3. Submit calls `_platform/aiKeys/actions:addPlatformKey` (Node action
 *      because encryption needs `node:crypto`).
 *   4. The action encrypts plaintext, writes via internal mutation,
 *      deactivates any existing active row for the same provider, and
 *      audit-logs the rotation.
 *
 * Remove flow: `_platform/aiKeys/mutations:remove` soft-deactivates the
 * row. The rotation history stays in `platformAuditLogs` for forensic
 * purposes.
 *
 * Auto-detect parity (locked 2026-06-06): the BYOK form already
 * auto-detects provider; the owner panel did not, forcing the operator
 * to pick from a long dropdown every rotation. This view now mirrors the
 * BYOK UX exactly so a rotated `sk-or-…` key is correctly tagged as
 * OpenRouter on first paste.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §5 (added 2026-05-27).
 */
import { useAction, useMutation, useQuery } from "convex/react";
import { ExternalLink, Loader2, Plus, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { detectProvider, PROVIDER_IDS, type ProviderId } from "@/convex/ai/encryptionTypes";
import { normalizeError } from "@/lib/normalizeError";
import { OwnerSettingsCard } from "../../components/OwnerSettingsCard";

const PROVIDER_LABEL: Record<ProviderId, string> = {
	anthropic: "Anthropic (Claude)",
	openai: "OpenAI (GPT)",
	google: "Google (Gemini)",
	xai: "xAI (Grok)",
	groq: "Groq (Llama)",
	mistral: "Mistral",
	openrouter: "OpenRouter",
	nvidia: "NVIDIA NIM",
	moonshot: "Moonshot / Kimi",
	custom: "Custom OpenAI-compat",
};

/**
 * Free-tier hints + signup URLs per provider — mirrors the BYOK form so
 * an owner pasting a fresh key gets the same orientation. Drives the
 * small badge + "Get a key" link below the provider control.
 */
const PROVIDER_HINTS: Record<ProviderId, { freeTier?: string; signupUrl?: string }> = {
	anthropic: { signupUrl: "https://console.anthropic.com/settings/keys" },
	openai: { signupUrl: "https://platform.openai.com/api-keys" },
	google: {
		freeTier: "Generous AI Studio free tier",
		signupUrl: "https://aistudio.google.com/apikey",
	},
	xai: { signupUrl: "https://console.x.ai/" },
	groq: { freeTier: "30 req/min free", signupUrl: "https://console.groq.com/keys" },
	mistral: {
		freeTier: "Limited free trial",
		signupUrl: "https://console.mistral.ai/api-keys",
	},
	openrouter: {
		freeTier: "~200 req/day on `:free` models",
		signupUrl: "https://openrouter.ai/keys",
	},
	nvidia: {
		freeTier: "5,000 req/month free (build.nvidia.com)",
		signupUrl: "https://build.nvidia.com",
	},
	moonshot: { signupUrl: "https://platform.moonshot.ai/console/api-keys" },
	custom: {},
};

export function AIKeysView() {
	const keys = useQuery(api._platform.aiKeys.queries.list, {});
	const add = useAction(api._platform.aiKeys.actions.addPlatformKey);
	const remove = useMutation(api._platform.aiKeys.mutations.remove);

	const [apiKey, setApiKey] = useState("");
	const [providerOverride, setProviderOverride] = useState<ProviderId | null>(null);
	const [name, setName] = useState("");
	const [baseUrl, setBaseUrl] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [busyId, setBusyId] = useState<Id<"platformAiKeys"> | null>(null);

	// Same detect/effective logic as the BYOK form. `detectProvider` returns
	// "custom" for ambiguous `sk-…` prefixes; we treat that as "no detection"
	// and force a manual pick so a Moonshot/Kimi key isn't accidentally tagged
	// as OpenAI legacy.
	const detected = apiKey ? detectProvider(apiKey) : null;
	const effectiveProvider: ProviderId | null =
		providerOverride ?? (detected && detected !== "custom" ? detected : null);
	const needsProviderPick = apiKey.length >= 10 && !effectiveProvider;
	const showBaseUrl =
		effectiveProvider === "custom" ||
		effectiveProvider === "openrouter" ||
		effectiveProvider === "nvidia" ||
		effectiveProvider === "moonshot";

	function resetForm() {
		setApiKey("");
		setProviderOverride(null);
		setName("");
		setBaseUrl("");
	}

	async function handleAdd() {
		if (!apiKey || apiKey.length < 10) {
			toast.error("API key looks too short");
			return;
		}
		if (!effectiveProvider) {
			toast.error("Pick a provider — this key's prefix is ambiguous.");
			return;
		}
		setSubmitting(true);
		try {
			await add({
				apiKey,
				provider: effectiveProvider,
				name: name.trim() || undefined,
				baseUrl: baseUrl.trim() || undefined,
			});
			toast.success("Platform key saved");
			resetForm();
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

	return (
		<div className="flex flex-col gap-4">
			<OwnerSettingsCard
				title="Add platform key"
				description="Platform keys cover every workspace that hasn't set its own. Used by Morning Briefing, chat-title generation, suggestion ranking, and any internal AI call. Provider is auto-detected from the key's prefix where possible. One active key per provider — adding a new one deactivates the previous."
			>
				<div className="grid gap-3">
					<label className="grid gap-1 text-xs">
						<span className="font-medium text-foreground">API key</span>
						<input
							type="password"
							value={apiKey}
							onChange={(e) => setApiKey(e.target.value)}
							placeholder="sk-ant-… / sk-or-… / sk-proj-… / nvapi-… / sk-…"
							autoComplete="off"
							className="h-9 rounded-[var(--radius)] border border-input bg-background px-3 font-mono text-sm outline-none focus:border-ring"
						/>
						<span className="text-[11px] text-muted-foreground">
							The key is encrypted with AES-GCM before storage. We never log
							plaintext.
						</span>
					</label>

					<div className="grid gap-1 text-xs">
						<span className="font-medium text-foreground">
							Provider
							{detected && detected !== "custom" && !providerOverride && (
								<span className="ms-2 text-[10px] font-normal uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
									auto-detected
								</span>
							)}
						</span>
						<Select
							value={effectiveProvider ?? ""}
							onValueChange={(v) => setProviderOverride(v as ProviderId)}
						>
							<SelectTrigger className="h-9 w-full text-sm">
								<SelectValue
									placeholder={
										needsProviderPick ? "Pick a provider…" : "Provider"
									}
								/>
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{PROVIDER_IDS.filter((p) => p !== "custom").map((p) => (
										<SelectItem key={p} value={p}>
											{PROVIDER_LABEL[p]}
										</SelectItem>
									))}
									<SelectItem value="custom">{PROVIDER_LABEL.custom}</SelectItem>
								</SelectGroup>
							</SelectContent>
						</Select>
						{needsProviderPick && (
							<span className="text-[11px] text-amber-600 dark:text-amber-400">
								This key's prefix is ambiguous — please pick the provider it belongs
								to (e.g. Moonshot/Kimi keys look like generic <code>sk-…</code>{" "}
								keys).
							</span>
						)}
						{effectiveProvider &&
							(PROVIDER_HINTS[effectiveProvider]?.freeTier ||
								PROVIDER_HINTS[effectiveProvider]?.signupUrl) && (
								<div className="flex flex-col gap-1 rounded-[var(--radius)] border border-border bg-muted/40 px-2.5 py-2 text-[11px]">
									{PROVIDER_HINTS[effectiveProvider]?.freeTier && (
										<div className="flex items-center gap-1.5">
											<Sparkles className="size-3 text-emerald-600 dark:text-emerald-400" />
											<span className="font-medium text-emerald-700 dark:text-emerald-300">
												Free tier:
											</span>
											<span className="text-muted-foreground">
												{PROVIDER_HINTS[effectiveProvider]?.freeTier}
											</span>
										</div>
									)}
									{PROVIDER_HINTS[effectiveProvider]?.signupUrl && (
										<a
											href={PROVIDER_HINTS[effectiveProvider]?.signupUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="flex items-center gap-1.5 text-primary hover:underline"
										>
											<ExternalLink className="size-3" />
											Get a key from {PROVIDER_LABEL[effectiveProvider]}
										</a>
									)}
								</div>
							)}
					</div>

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
							<span className="text-[11px] text-muted-foreground">
								Override only when self-hosting. Leave blank to use the provider's
								default endpoint.
							</span>
						</label>
					)}

					<div>
						<Button
							type="button"
							onClick={handleAdd}
							disabled={submitting || !apiKey || !effectiveProvider}
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
												PROVIDER_LABEL[k.provider as ProviderId] ??
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
