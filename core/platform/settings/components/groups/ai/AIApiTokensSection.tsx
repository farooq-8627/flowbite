"use client";

/**
 * core/platform/settings/components/groups/ai/AIApiTokensSection.tsx
 *
 * B.42 follow-up to S16 (`/SHIPPED.md` 2026-06-05) — UI for the personal
 * access tokens that power the MCP + REST projectors. Mounted as the
 * `tokens` tab inside `<AIGroup>`; gated on the `ai.apiTokens.manage`
 * permission (Owner + Admin defaults).
 *
 * Surface contract — identical to the corresponding owner-panel page:
 *   • List view shows every token in the org (own + others) with name,
 *     prefix, scopes, last-used, expiry. The actor's own tokens are
 *     marked "Yours"; tokens issued by other members are surfaced too
 *     because the permission is org-scoped.
 *   • "New token" dialog asks for a name, scope picker (wildcard "*"
 *     by default — mints a token with the full RBAC of the issuing
 *     member; advanced users tick specific capability names), and
 *     optional expiry. On submit the plaintext is shown ONCE in a
 *     copy-once dialog the user dismisses with an explicit "I've
 *     copied this — close" button (matches the "shown once and never
 *     again" backend invariant — `convex/ai/aiApiTokens.ts:issueToken`).
 *   • Revoke is a confirm-dialog wrapper around `revokeToken`. Revoked
 *     tokens stay in the list with a strike-through + "Revoked" badge
 *     so the audit trail is preserved.
 *
 * Capability list for the scope picker is bootstrapped from a hand-
 * curated catalog of the high-level groups (CRM, comms, schema, AI
 * read-only, settings, members). The wildcard "*" path stays the
 * default because that's how external agents typically run; scope
 * tightening is a power-user flow.
 *
 * RTL-safe: every directional spacing uses `ms-*` / `me-*`. Border
 * radius reads `var(--radius)` everywhere.
 */

import { useMutation, useQuery } from "convex/react";
import {
	AlertTriangle,
	Check,
	Copy,
	KeyRound,
	Loader2,
	Plus,
	ShieldCheck,
	Trash2,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useCurrentOrg, useOrgPermissions } from "@/core/shell/shared/hooks/useCurrentOrg";
import { toast } from "@/lib/toast";
import { SettingsSection } from "../../shared/SettingsSection";

// ─── Curated capability scope hints ────────────────────────────────────────
//
// The full capability registry lives server-side at
// `convex/ai/registry/define.ts:listCapabilities()`. Exposing the entire
// list to the client would mean shipping a query that walks the
// registry on every render — overkill for a power-user feature. Instead
// we ship a hand-curated catalog of the most useful scope shapes:
// wildcard, plus a list of common capability names grouped by domain.
// Power users who need a specific cap not in the catalog can type it
// in the free-form input — the backend's validator (`normaliseScopes`)
// is the authority.

type ScopeChoice = { value: string; label: string; group: string };

const SCOPE_CHOICES: ReadonlyArray<ScopeChoice> = [
	// CRM reads
	{ value: "search_crm", label: "search_crm", group: "CRM (read)" },
	{ value: "describe_entity", label: "describe_entity", group: "CRM (read)" },
	{ value: "describe_workspace", label: "describe_workspace", group: "CRM (read)" },
	{ value: "list_files", label: "list_files", group: "CRM (read)" },
	// CRM writes
	{ value: "create_lead", label: "create_lead", group: "CRM (write)" },
	{ value: "create_contact", label: "create_contact", group: "CRM (write)" },
	{ value: "create_deal", label: "create_deal", group: "CRM (write)" },
	{ value: "create_company", label: "create_company", group: "CRM (write)" },
	{ value: "update_entity", label: "update_entity", group: "CRM (write)" },
	{ value: "move_deal_stage", label: "move_deal_stage", group: "CRM (write)" },
	// Tasks + notes
	{ value: "create_task", label: "create_task", group: "Tasks & notes" },
	{ value: "update_task", label: "update_task", group: "Tasks & notes" },
	{ value: "add_note", label: "add_note", group: "Tasks & notes" },
	// Messaging
	{ value: "send_message", label: "send_message", group: "Messaging" },
	{ value: "send_whatsapp", label: "send_whatsapp", group: "Messaging" },
	{ value: "list_messages", label: "list_messages", group: "Messaging" },
	{ value: "draft_message", label: "draft_message", group: "Messaging" },
] as const;

const SCOPE_GROUPS = Array.from(new Set(SCOPE_CHOICES.map((c) => c.group)));

// ─── Pure helpers ──────────────────────────────────────────────────────────

function formatTimestamp(ts: number | undefined): string {
	if (typeof ts !== "number") return "—";
	try {
		return new Date(ts).toLocaleString(undefined, {
			month: "short",
			day: "numeric",
			year: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
	} catch {
		return String(ts);
	}
}

function formatRelative(ts: number | undefined): string {
	if (typeof ts !== "number") return "Never";
	const diff = Date.now() - ts;
	if (diff < 60_000) return "Just now";
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(diff / 3_600_000);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(diff / 86_400_000);
	if (days < 30) return `${days}d ago`;
	return formatTimestamp(ts);
}

async function copyToClipboard(value: string): Promise<boolean> {
	try {
		if (navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(value);
			return true;
		}
		const el = document.createElement("textarea");
		el.value = value;
		el.setAttribute("readonly", "");
		el.style.position = "absolute";
		el.style.left = "-9999px";
		document.body.appendChild(el);
		el.select();
		document.execCommand("copy");
		document.body.removeChild(el);
		return true;
	} catch {
		return false;
	}
}

// ─── Section ───────────────────────────────────────────────────────────────

type TokenRow = {
	id: Id<"aiApiTokens">;
	name: string;
	prefix: string;
	scopes: string[];
	userId: Id<"users">;
	createdAt: number;
	expiresAt?: number;
	lastUsedAt?: number;
	revokedAt?: number;
};

export function AIApiTokensSection({ orgId }: { orgId: Id<"orgs"> }) {
	const permissions = useOrgPermissions();
	const canManage = permissions.includes("ai.apiTokens.manage");
	const { me } = useCurrentOrg();
	const myUserId = me?._id;

	const tokens = useQuery(api.ai.aiApiTokens.listTokens, canManage ? { orgId } : "skip") as
		| TokenRow[]
		| undefined;
	const issueToken = useMutation(api.ai.aiApiTokens.issueToken);
	const revokeToken = useMutation(api.ai.aiApiTokens.revokeToken);

	const [issueOpen, setIssueOpen] = useState(false);
	const [revealedPlaintext, setRevealedPlaintext] = useState<string | null>(null);
	const [revokingId, setRevokingId] = useState<Id<"aiApiTokens"> | null>(null);

	const sortedTokens = useMemo(() => {
		if (!tokens) return [] as TokenRow[];
		// Active first (sorted by createdAt desc), then revoked tail.
		const active = tokens.filter((t) => t.revokedAt === undefined);
		const revoked = tokens.filter((t) => t.revokedAt !== undefined);
		return [...active, ...revoked];
	}, [tokens]);

	const hasTokens = sortedTokens.length > 0;
	const isLoading = canManage && tokens === undefined;

	const handleRevoke = useCallback(
		async (tokenId: Id<"aiApiTokens">) => {
			try {
				await revokeToken({ orgId, tokenId });
				toast.success("Token revoked", "Future requests with this token will fail.");
			} catch (err) {
				toast.mutationError(err, "Could not revoke token.");
			} finally {
				setRevokingId(null);
			}
		},
		[orgId, revokeToken],
	);

	return (
		<SettingsSection
			id="ai.apiTokens"
			title="API Tokens (MCP + REST)"
			description="Personal access tokens for external agents using the MCP or REST projectors. Each token executes under YOUR RBAC — anyone holding a token can do exactly what you can do in this workspace. Plaintext is shown once at creation and never again."
			action={
				canManage ? (
					<Button
						variant="outline"
						size="sm"
						onClick={() => setIssueOpen(true)}
						className="gap-1.5"
					>
						<Plus className="size-3.5" />
						New token
					</Button>
				) : undefined
			}
		>
			{!canManage ? (
				<div className="rounded-[var(--radius)] border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
					<KeyRound className="mx-auto size-5 text-muted-foreground" />
					<p className="mt-2 text-sm font-medium">No permission</p>
					<p className="mt-1 text-xs text-muted-foreground">
						The{" "}
						<code className="rounded bg-muted px-1 py-0.5 text-[11px]">
							ai.apiTokens.manage
						</code>{" "}
						permission is required. Owners + admins see this by default — ask an owner
						to grant the permission to your role.
					</p>
				</div>
			) : isLoading ? (
				<div className="flex items-center justify-center rounded-[var(--radius)] border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
					<Loader2 className="me-2 size-4 animate-spin" />
					Loading tokens…
				</div>
			) : !hasTokens ? (
				<div className="rounded-[var(--radius)] border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
					<KeyRound className="mx-auto size-5 text-muted-foreground" />
					<p className="mt-2 text-sm font-medium">No API tokens yet</p>
					<p className="mt-1 text-xs text-muted-foreground">
						Create a token to authenticate an external MCP or REST agent against this
						workspace. Tokens execute under the issuing member's RBAC.
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-2">
					{sortedTokens.map((token) => (
						<TokenRowView
							key={token.id}
							token={token}
							isMine={myUserId === token.userId}
							onRevoke={() => setRevokingId(token.id)}
						/>
					))}
				</div>
			)}

			<IssueTokenDialog
				open={issueOpen}
				onOpenChange={setIssueOpen}
				onIssued={(plaintext) => setRevealedPlaintext(plaintext)}
				issueToken={async (args) => {
					const result = await issueToken({ orgId, ...args });
					return result.plaintext;
				}}
			/>

			<RevealedPlaintextDialog
				plaintext={revealedPlaintext}
				onClose={() => setRevealedPlaintext(null)}
			/>

			<AlertDialog
				open={revokingId !== null}
				onOpenChange={(open) => {
					if (!open) setRevokingId(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Revoke this token?</AlertDialogTitle>
						<AlertDialogDescription>
							The token will stop working immediately. Any external agent or
							integration using it will get a 401 on the next request. This cannot be
							undone — you'll need to issue a new token to resume access.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => {
								if (revokingId) void handleRevoke(revokingId);
							}}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							Revoke
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</SettingsSection>
	);
}

// ─── Token row ─────────────────────────────────────────────────────────────

function TokenRowView({
	token,
	isMine,
	onRevoke,
}: {
	token: TokenRow;
	isMine: boolean;
	onRevoke: () => void;
}) {
	const isRevoked = token.revokedAt !== undefined;
	const isExpired = typeof token.expiresAt === "number" && token.expiresAt < Date.now();
	const wildcard = token.scopes.length === 1 && token.scopes[0] === "*";

	return (
		<div
			className={
				"flex flex-col gap-2 rounded-[var(--radius)] border border-border bg-muted/20 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3"
			}
		>
			<KeyRound
				className={
					isRevoked
						? "size-4 shrink-0 text-muted-foreground"
						: "size-4 shrink-0 text-primary"
				}
			/>
			<div className="flex-1 min-w-0">
				<div className="flex flex-wrap items-center gap-2">
					<span
						className={
							isRevoked
								? "text-sm font-medium line-through text-muted-foreground"
								: "text-sm font-medium"
						}
					>
						{token.name}
					</span>
					<span className="rounded font-mono text-[11px] text-muted-foreground">
						{token.prefix}…
					</span>
					{isMine && (
						<Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
							Yours
						</Badge>
					)}
					{isRevoked ? (
						<Badge
							variant="outline"
							className="h-4 border-rose-200 px-1.5 text-[10px] text-rose-700 dark:border-rose-900 dark:text-rose-300"
						>
							Revoked
						</Badge>
					) : isExpired ? (
						<Badge
							variant="outline"
							className="h-4 border-amber-200 px-1.5 text-[10px] text-amber-700 dark:border-amber-900 dark:text-amber-300"
						>
							Expired
						</Badge>
					) : null}
					{wildcard ? (
						<Badge variant="outline" className="h-4 px-1.5 text-[10px]">
							Full access (*)
						</Badge>
					) : (
						<Badge variant="outline" className="h-4 px-1.5 text-[10px]">
							{token.scopes.length} scope{token.scopes.length === 1 ? "" : "s"}
						</Badge>
					)}
				</div>
				<div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
					<span>Last used {formatRelative(token.lastUsedAt)}</span>
					<span>Created {formatTimestamp(token.createdAt)}</span>
					{typeof token.expiresAt === "number" && (
						<span>Expires {formatTimestamp(token.expiresAt)}</span>
					)}
				</div>
				{!wildcard && token.scopes.length > 0 && (
					<div className="mt-1.5 flex flex-wrap gap-1">
						{token.scopes.map((scope) => (
							<span
								key={scope}
								className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground ring-1 ring-border"
							>
								{scope}
							</span>
						))}
					</div>
				)}
			</div>
			{!isRevoked && (
				<Button
					variant="ghost"
					size="sm"
					onClick={onRevoke}
					className="ms-auto h-7 gap-1 text-xs text-muted-foreground hover:text-destructive"
				>
					<Trash2 className="size-3.5" />
					Revoke
				</Button>
			)}
		</div>
	);
}

// ─── Issue dialog ──────────────────────────────────────────────────────────

const NAME_MAX = 60;
const EXPIRY_PRESETS = [
	{ label: "30 days", days: 30 },
	{ label: "90 days", days: 90 },
	{ label: "180 days", days: 180 },
	{ label: "1 year", days: 365 },
] as const;

function IssueTokenDialog({
	open,
	onOpenChange,
	issueToken,
	onIssued,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	issueToken: (args: { name: string; scopes?: string[]; expiresAt?: number }) => Promise<string>;
	onIssued: (plaintext: string) => void;
}) {
	const [name, setName] = useState("");
	const [wildcard, setWildcard] = useState(true);
	const [pickedScopes, setPickedScopes] = useState<Set<string>>(new Set());
	const [extraScopesText, setExtraScopesText] = useState("");
	const [expiryDays, setExpiryDays] = useState<number | null>(null);
	const [busy, setBusy] = useState(false);

	const reset = useCallback(() => {
		setName("");
		setWildcard(true);
		setPickedScopes(new Set());
		setExtraScopesText("");
		setExpiryDays(null);
	}, []);

	const handleSubmit = useCallback(async () => {
		if (name.trim().length === 0) {
			toast.error(
				"Name required",
				"Give the token a short name so you can identify it later.",
			);
			return;
		}
		if (name.trim().length > NAME_MAX) {
			toast.error(`Name too long`, `Keep it under ${NAME_MAX} characters.`);
			return;
		}

		const scopes: string[] | undefined = wildcard
			? undefined
			: (() => {
					const fromExtras = extraScopesText
						.split(/[,\s]+/)
						.map((s) => s.trim())
						.filter((s) => s.length > 0);
					return Array.from(new Set([...pickedScopes, ...fromExtras]));
				})();
		if (scopes && scopes.length === 0) {
			toast.error(
				"Pick at least one scope",
				"Switch to “Full access (*)” to mint a wildcard token, or tick at least one capability.",
			);
			return;
		}

		const expiresAt = expiryDays !== null ? Date.now() + expiryDays * 86_400_000 : undefined;

		setBusy(true);
		try {
			const plaintext = await issueToken({
				name: name.trim(),
				...(scopes ? { scopes } : {}),
				...(expiresAt !== undefined ? { expiresAt } : {}),
			});
			onIssued(plaintext);
			onOpenChange(false);
			reset();
		} catch (err) {
			toast.mutationError(err, "Could not issue token.");
		} finally {
			setBusy(false);
		}
	}, [
		name,
		wildcard,
		pickedScopes,
		extraScopesText,
		expiryDays,
		issueToken,
		onIssued,
		onOpenChange,
		reset,
	]);

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				onOpenChange(next);
				if (!next) reset();
			}}
		>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Issue a new API token</DialogTitle>
					<DialogDescription>
						Tokens authenticate external MCP or REST agents against this workspace. The
						plaintext is shown once on the next screen — copy it to your secrets manager
						immediately.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4 py-2">
					{/* Name */}
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="token-name">Name</Label>
						<Input
							id="token-name"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g. Zapier integration"
							maxLength={NAME_MAX}
							autoFocus
						/>
						<p className="text-xs text-muted-foreground">
							Shown in the list. Pick something you'll recognise — e.g. the agent or
							workflow name.
						</p>
					</div>

					{/* Scopes */}
					<div className="flex flex-col gap-1.5">
						<div className="flex items-center justify-between">
							<Label>Scope</Label>
							<div className="flex items-center gap-2">
								<span className="text-xs text-muted-foreground">
									Full access (*)
								</span>
								<Switch
									checked={wildcard}
									onCheckedChange={setWildcard}
									aria-label="Wildcard scope"
								/>
							</div>
						</div>
						<p className="text-xs text-muted-foreground">
							{wildcard
								? "Wildcard tokens can call every capability you have RBAC for. The server-side gate is still your role — the token never escalates beyond what you can do."
								: "Pick the capabilities the holder can call. Anything you don't tick will return a 403 from the projectors."}
						</p>
						{!wildcard && (
							<div className="mt-1 flex flex-col gap-2">
								{SCOPE_GROUPS.map((groupName) => (
									<div key={groupName} className="flex flex-col gap-1">
										<span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
											{groupName}
										</span>
										<div className="flex flex-wrap gap-1.5">
											{SCOPE_CHOICES.filter((c) => c.group === groupName).map(
												(choice) => {
													const checked = pickedScopes.has(choice.value);
													return (
														<button
															key={choice.value}
															type="button"
															onClick={() =>
																setPickedScopes((prev) => {
																	const next = new Set(prev);
																	if (next.has(choice.value)) {
																		next.delete(choice.value);
																	} else {
																		next.add(choice.value);
																	}
																	return next;
																})
															}
															aria-pressed={checked}
															className={
																checked
																	? "rounded-[calc(var(--radius)-2px)] bg-primary px-2 py-0.5 font-mono text-[11px] text-primary-foreground"
																	: "rounded-[calc(var(--radius)-2px)] bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-accent hover:text-accent-foreground"
															}
														>
															{choice.label}
														</button>
													);
												},
											)}
										</div>
									</div>
								))}
								<div className="mt-1 flex flex-col gap-1.5">
									<Label htmlFor="extra-scopes" className="text-xs font-medium">
										Other capabilities (comma-separated)
									</Label>
									<Input
										id="extra-scopes"
										value={extraScopesText}
										onChange={(e) => setExtraScopesText(e.target.value)}
										placeholder="e.g. analyze_metric, list_anomalies"
										className="font-mono text-xs"
									/>
									<p className="text-xs text-muted-foreground">
										Type any capability name — the server validates them. See
										the AI registry for the full list.
									</p>
								</div>
							</div>
						)}
					</div>

					{/* Expiry */}
					<div className="flex flex-col gap-1.5">
						<Label>Expires</Label>
						<div className="flex flex-wrap gap-1.5">
							<button
								type="button"
								onClick={() => setExpiryDays(null)}
								aria-pressed={expiryDays === null}
								className={
									expiryDays === null
										? "rounded-[calc(var(--radius)-2px)] bg-primary px-2 py-1 text-xs text-primary-foreground"
										: "rounded-[calc(var(--radius)-2px)] bg-muted px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
								}
							>
								Never
							</button>
							{EXPIRY_PRESETS.map((preset) => (
								<button
									key={preset.days}
									type="button"
									onClick={() => setExpiryDays(preset.days)}
									aria-pressed={expiryDays === preset.days}
									className={
										expiryDays === preset.days
											? "rounded-[calc(var(--radius)-2px)] bg-primary px-2 py-1 text-xs text-primary-foreground"
											: "rounded-[calc(var(--radius)-2px)] bg-muted px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
									}
								>
									{preset.label}
								</button>
							))}
						</div>
						<p className="text-xs text-muted-foreground">
							Long-lived tokens are convenient but a leaked token has the same
							lifetime — set an expiry when you can.
						</p>
					</div>
				</div>

				<DialogFooter className="gap-2 sm:gap-2">
					<Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
						Cancel
					</Button>
					<Button size="sm" onClick={handleSubmit} disabled={busy} className="gap-1.5">
						{busy && <Loader2 className="size-3.5 animate-spin" />}
						Issue token
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

// ─── Reveal-once dialog ────────────────────────────────────────────────────

function RevealedPlaintextDialog({
	plaintext,
	onClose,
}: {
	plaintext: string | null;
	onClose: () => void;
}) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(async () => {
		if (!plaintext) return;
		const ok = await copyToClipboard(plaintext);
		if (ok) {
			setCopied(true);
			toast.success("Token copied", "Paste it into your secrets manager now.");
			window.setTimeout(() => setCopied(false), 1800);
		} else {
			toast.error("Copy failed", "Select the value manually and copy it.");
		}
	}, [plaintext]);

	return (
		<Dialog
			open={plaintext !== null}
			onOpenChange={(next) => {
				if (!next) onClose();
			}}
		>
			<DialogContent
				className="sm:max-w-lg"
				onInteractOutside={(e) => {
					// Force the explicit "I've copied this" exit — clicking the
					// backdrop while the plaintext is still on screen is the
					// classic "lost the token, can't get it back" footgun.
					e.preventDefault();
				}}
			>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<ShieldCheck className="size-4 text-emerald-600 dark:text-emerald-400" />
						Token created — copy it now
					</DialogTitle>
					<DialogDescription>
						This is the only time the plaintext will be shown. Paste it into your
						secrets manager or the agent's config; once you close this dialog the value
						is gone for good.
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-2 py-2">
					<div className="flex items-stretch gap-2">
						<code className="flex-1 select-all break-all rounded-[var(--radius)] border border-border bg-muted px-2.5 py-2 font-mono text-xs">
							{plaintext}
						</code>
						<Button
							variant="outline"
							size="sm"
							onClick={handleCopy}
							className="shrink-0 gap-1.5"
						>
							{copied ? (
								<Check className="size-3.5" />
							) : (
								<Copy className="size-3.5" />
							)}
							{copied ? "Copied" : "Copy"}
						</Button>
					</div>
					<div className="flex items-start gap-2 rounded-[var(--radius)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
						<AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
						<p>
							Treat this like a password. Anyone with this token can act as you in
							this workspace until you revoke it.
						</p>
					</div>
				</div>

				<DialogFooter>
					<Button size="sm" onClick={onClose}>
						I've saved this — close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
