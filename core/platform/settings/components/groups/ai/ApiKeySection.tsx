"use client";
/**
 * core/platform/settings/components/groups/ai/ApiKeySection.tsx
 *
 * BYOK API key management UI.
 *
 * Resolution chain at runtime (see convex/ai/keys.ts::resolveKey + processChat):
 *   1. user-scope key for the requested provider (added via "Just me")
 *   2. org-scope key for the requested provider (added via "Whole workspace")
 *   3. platform env var (e.g. ANTHROPIC_API_KEY) — set by a platform admin
 *
 * Whichever is found first is used. A single key per provider unlocks every
 * model that provider hosts (e.g. one Anthropic key = Haiku + Sonnet + Opus).
 *
 * Security: encryptedKey is NEVER returned to the client. Server stores
 * only AES-GCM encrypted blob + last-4-char hint for display.
 */
import { useAction, useMutation, useQuery } from "convex/react";
import { anyApi } from "convex/server";
import { ExternalLink, Key, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { Id } from "@/convex/_generated/dataModel";
import { detectProvider, PROVIDER_IDS, type ProviderId } from "@/convex/ai/encryptionTypes";
import { useOrgPermissions } from "@/core/shell/shared/hooks/useCurrentOrg";
import { toast } from "@/lib/toast";
import { SettingsSection } from "../../shared/SettingsSection";

interface KeyRow {
	_id: Id<"orgAiKeys">;
	scope: "org" | "user";
	provider: string;
	keyHint: string;
	name?: string;
	defaultModel?: string;
	createdAt: number;
}

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
	custom: "Custom (other / self-hosted)",
};

/**
 * Free-tier hints + signup URLs for each provider. When the user picks a
 * provider in the "Add API key" dialog we surface the matching hint
 * underneath the input so first-time users know which providers offer
 * a free tier and where to grab a key.
 *
 * `freeTier` is rendered as a small green pill; `signupUrl` becomes the
 * "Get a key" link. Either field is optional — providers without a free
 * tier (Anthropic, OpenAI, xAI, Moonshot) just show the signup URL.
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

export function ApiKeySection({ orgId }: { orgId: Id<"orgs"> }) {
	const permissions = useOrgPermissions();
	const canManageOrgKeys = permissions.includes("ai.byokOrg");
	const canManageOwnKeys = permissions.includes("ai.byokUser");
	const canManageAny = canManageOrgKeys || canManageOwnKeys;

	const orgKeys = useQuery(anyApi.ai.keys.listKeys, canManageOrgKeys ? { orgId } : "skip") as
		| KeyRow[]
		| undefined;
	const userKeys = useQuery(anyApi.ai.keys.listOwnKeys, canManageOwnKeys ? { orgId } : "skip") as
		| KeyRow[]
		| undefined;

	const addOrgKey = useAction(anyApi.ai.keysActions.addOrgKey);
	const addUserKey = useAction(anyApi.ai.keysActions.addUserKey);
	const removeKey = useMutation(anyApi.ai.keys.removeKey);

	const [dialogOpen, setDialogOpen] = useState(false);
	const [scope, setScope] = useState<"org" | "user">(
		canManageOwnKeys ? "user" : canManageOrgKeys ? "org" : "user",
	);
	const [apiKey, setApiKey] = useState("");
	const [name, setName] = useState("");
	const [providerOverride, setProviderOverride] = useState<ProviderId | null>(null);
	const [busy, setBusy] = useState(false);

	const detected = apiKey ? detectProvider(apiKey) : null;
	// Effective provider: explicit override wins, otherwise auto-detected.
	// If detection returns "custom" (ambiguous prefix) we force the user to
	// pick — guarantees Kimi/Moonshot keys aren't accidentally tagged as OpenAI.
	const effectiveProvider: ProviderId | null =
		providerOverride ?? (detected && detected !== "custom" ? detected : null);
	const needsProviderPick = apiKey.length >= 10 && !effectiveProvider;

	function resetForm() {
		setApiKey("");
		setName("");
		setProviderOverride(null);
	}

	async function handleAdd() {
		if (apiKey.trim().length < 10) {
			toast.error("API key looks invalid", "Must be at least 10 characters.");
			return;
		}
		if (!effectiveProvider) {
			toast.error("Pick a provider", "We couldn't detect which provider this key is for.");
			return;
		}
		setBusy(true);
		try {
			const args = {
				orgId,
				apiKey: apiKey.trim(),
				name: name.trim() || undefined,
				provider: effectiveProvider,
			};
			if (scope === "org") {
				await addOrgKey(args);
			} else {
				await addUserKey(args);
			}
			toast.success("API key added", "Encrypted and stored securely.");
			resetForm();
			setDialogOpen(false);
		} catch (err) {
			toast.mutationError(err, "Could not add key.");
		} finally {
			setBusy(false);
		}
	}

	async function handleRemove(keyId: Id<"orgAiKeys">) {
		if (!confirm("Remove this API key? Future requests will fall back to the platform key."))
			return;
		try {
			await removeKey({ orgId, keyId });
			toast.success("API key removed");
		} catch (err) {
			toast.mutationError(err, "Could not remove key.");
		}
	}

	// Deduplicate by _id: listKeys returns ALL keys (org + user scope),
	// while listOwnKeys returns the viewer's user-scope keys — overlap is expected.
	const seenIds = new Set<string>();
	const allKeys = [...(orgKeys ?? []), ...(userKeys ?? [])].filter((key) => {
		if (seenIds.has(key._id)) return false;
		seenIds.add(key._id);
		return true;
	});

	return (
		<SettingsSection
			id="ai.keys"
			title="API Keys (BYOK)"
			description="Bring your own API key for any supported AI provider. With your own key, AI usage is unlimited — you pay your provider directly. One key per provider unlocks every model that provider offers."
			action={
				canManageAny ? (
					<Button
						variant="outline"
						size="sm"
						onClick={() => setDialogOpen(true)}
						className="gap-1.5"
					>
						<Plus className="size-3.5" />
						Add API key
					</Button>
				) : undefined
			}
		>
			<div className="flex flex-col gap-2">
				{allKeys.length === 0 ? (
					<div className="rounded-[var(--radius)] border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
						<Key className="mx-auto size-5 text-muted-foreground" />
						<p className="mt-2 text-sm font-medium">No API keys yet</p>
						<p className="mt-1 text-xs text-muted-foreground">
							{canManageAny
								? "Add a key to enable unlimited AI usage on your own provider."
								: "You don’t have permission to manage API keys. Ask an admin."}
						</p>
					</div>
				) : (
					allKeys.map((key) => (
						<div
							key={key._id}
							className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-muted/20 px-3 py-2"
						>
							<Key className="size-4 text-primary shrink-0" />
							<div className="flex-1 min-w-0">
								<div className="flex flex-wrap items-center gap-2">
									<span className="font-medium text-sm capitalize">
										{PROVIDER_LABEL[key.provider as ProviderId] ?? key.provider}
									</span>
									<span className="font-mono text-xs text-muted-foreground">
										{key.keyHint}
									</span>
									<span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
										{key.scope === "org" ? "Workspace" : "Just me"}
									</span>
								</div>
								{key.name && (
									<p className="mt-0.5 text-xs text-muted-foreground truncate">
										{key.name}
									</p>
								)}
							</div>
							<Button
								variant="ghost"
								size="icon"
								className="size-7"
								onClick={() => handleRemove(key._id)}
								aria-label="Remove API key"
							>
								<Trash2 className="size-3.5" />
							</Button>
						</div>
					))
				)}
			</div>

			<Dialog
				open={dialogOpen}
				onOpenChange={(open) => {
					setDialogOpen(open);
					if (!open) resetForm();
				}}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Add an API key</DialogTitle>
						<DialogDescription>
							Paste a key from any supported provider. The provider is auto-detected
							where possible; pick it explicitly when prompted. Keys are encrypted at
							rest with AES-GCM.
						</DialogDescription>
					</DialogHeader>

					<div className="flex flex-col gap-4 py-2">
						{canManageOrgKeys && canManageOwnKeys && (
							<div className="flex flex-col gap-1.5">
								<Label>Scope</Label>
								<div className="flex gap-2">
									<Button
										type="button"
										variant={scope === "user" ? "default" : "outline"}
										size="sm"
										onClick={() => setScope("user")}
										className="flex-1"
									>
										Just me
									</Button>
									<Button
										type="button"
										variant={scope === "org" ? "default" : "outline"}
										size="sm"
										onClick={() => setScope("org")}
										className="flex-1"
									>
										Whole workspace
									</Button>
								</div>
								<p className="text-xs text-muted-foreground">
									{scope === "user"
										? "Only you will use this key. Costs go to your provider account."
										: "Every member of this workspace will use this key as a shared default."}
								</p>
							</div>
						)}

						<div className="flex flex-col gap-1.5">
							<Label htmlFor="key-value">API key</Label>
							<Input
								id="key-value"
								type="password"
								value={apiKey}
								onChange={(e) => setApiKey(e.target.value)}
								placeholder="sk-ant-… / sk-proj-… / nvapi-… / sk-…"
								autoComplete="off"
								autoFocus
							/>
						</div>

						<div className="flex flex-col gap-1.5">
							<Label htmlFor="key-provider">
								Provider
								{detected && detected !== "custom" && !providerOverride && (
									<span className="ms-2 text-[10px] font-normal uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
										auto-detected
									</span>
								)}
							</Label>
							<Select
								value={effectiveProvider ?? ""}
								onValueChange={(v) => setProviderOverride(v as ProviderId)}
							>
								<SelectTrigger id="key-provider" className="w-full">
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
										<SelectItem value="custom">
											{PROVIDER_LABEL.custom}
										</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
							{needsProviderPick && (
								<p className="text-xs text-amber-600 dark:text-amber-400">
									This key’s prefix is ambiguous — please pick the provider it
									belongs to (e.g. Moonshot/Kimi keys look like generic{" "}
									<code>sk-…</code> keys).
								</p>
							)}

							{/* Free-tier hint + signup link for the chosen provider. */}
							{effectiveProvider &&
								(PROVIDER_HINTS[effectiveProvider]?.freeTier ||
									PROVIDER_HINTS[effectiveProvider]?.signupUrl) && (
									<div className="flex flex-col gap-1.5 rounded-[var(--radius)] border border-border bg-muted/40 px-2.5 py-2 text-xs">
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

						<div className="flex flex-col gap-1.5">
							<Label htmlFor="key-name">Nickname (optional)</Label>
							<Input
								id="key-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="e.g. Kimi personal"
							/>
						</div>
					</div>

					<DialogFooter className="gap-2 sm:gap-2">
						<Button variant="ghost" size="sm" onClick={() => setDialogOpen(false)}>
							Cancel
						</Button>
						<Button
							size="sm"
							onClick={handleAdd}
							disabled={busy || !apiKey.trim() || !effectiveProvider}
							className="gap-1.5"
						>
							{busy && <Loader2 className="size-3.5 animate-spin" />}
							Add key
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</SettingsSection>
	);
}
