"use client";

/**
 * Owner-panel settings view (Stage 7 — full implementation).
 *
 * Three cards:
 *   1. **My profile** — read-only display of the authenticated owner.
 *      Editing happens in the regular user settings — the panel never
 *      re-implements profile editing.
 *   2. **Active OTP sessions** — every consumed-but-unexpired OTP row
 *      surfaces here with IP + UA. The owner can revoke any of their
 *      own sessions (force-expires the row + emits `owner.session.revoke`).
 *   3. **Recent logins** — last 10 `owner.session.{start,revoke}` rows
 *      from `platformAuditLogs`. The trail survives even after the
 *      underlying OTP row is GC'd.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §5 row 8, §10 stage 7.
 */
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { normalizeError } from "@/lib/normalizeError";
import { useOwnerProfile } from "../../components/OwnerProvider";
import { OwnerSettingsCard } from "../../components/OwnerSettingsCard";

export function OwnerSettingsView() {
	const profile = useOwnerProfile();
	const sessions = useQuery(api._platform.otp.queries.listActiveSessions, {});
	const recentLogins = useQuery(api._platform.otp.queries.getRecentLogins, { limit: 10 });
	const revoke = useMutation(api._platform.otp.mutations.revoke);

	const [busyId, setBusyId] = useState<Id<"platformOwnerOtps"> | null>(null);

	async function handleRevoke(otpId: Id<"platformOwnerOtps">) {
		setBusyId(otpId);
		try {
			await revoke({ otpId });
			toast.success("Session revoked");
		} catch (err) {
			toast.error(normalizeError(err, "Could not revoke session"));
		} finally {
			setBusyId(null);
		}
	}

	return (
		<div className="flex flex-col gap-4">
			<OwnerSettingsCard
				title="My profile"
				description="Identity surfaced to the owner panel. Edit your name + avatar in the regular user settings."
			>
				<dl className="grid grid-cols-3 gap-2 text-xs">
					<dt className="text-muted-foreground">Email</dt>
					<dd className="col-span-2 font-mono">{profile.email}</dd>
					<dt className="text-muted-foreground">Display name</dt>
					<dd className="col-span-2">{profile.name ?? "—"}</dd>
					<dt className="text-muted-foreground">User id</dt>
					<dd className="col-span-2 font-mono break-all">{profile.userId}</dd>
				</dl>
			</OwnerSettingsCard>

			<OwnerSettingsCard
				title="Active OTP sessions"
				description="Every verified OTP credential still inside its 15-minute TTL. Revoke any session you don't recognise."
			>
				{sessions === undefined ? (
					<Spinner label="Loading…" />
				) : sessions.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No active sessions. Verifying a code creates a row here.
					</p>
				) : (
					<ul className="space-y-2 text-xs">
						{sessions.map((s) => (
							<li
								key={s._id}
								className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border/60 px-3 py-2"
							>
								<div className="min-w-0">
									<p className="text-xs">
										Verified{" "}
										<time dateTime={new Date(s.consumedAt).toISOString()}>
											{new Date(s.consumedAt).toLocaleString()}
										</time>{" "}
										·{" "}
										<span className="text-muted-foreground">
											expires {formatRelative(s.expiresAt)}
										</span>
									</p>
									<p className="truncate text-[11px] text-muted-foreground">
										<span className="font-mono">{s.ip ?? "(IP unknown)"}</span>
										{s.userAgent ? ` · ${s.userAgent}` : ""}
									</p>
								</div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									disabled={busyId === s._id}
									onClick={() => handleRevoke(s._id as Id<"platformOwnerOtps">)}
								>
									{busyId === s._id ? (
										<>
											<Loader2 className="me-2 h-4 w-4 animate-spin" />
											Revoking…
										</>
									) : (
										"Revoke"
									)}
								</Button>
							</li>
						))}
					</ul>
				)}
			</OwnerSettingsCard>

			<OwnerSettingsCard
				title="Recent logins"
				description="Last 10 owner-session events. Sourced from the audit log so the trail survives row GC."
			>
				{recentLogins === undefined ? (
					<Spinner label="Loading…" />
				) : recentLogins.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No login history yet. Verifying a code (or revoking a session) records a row
						here.
					</p>
				) : (
					<ul className="space-y-2 text-xs">
						{recentLogins.map((row) => (
							<li
								key={row._id}
								className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border/60 px-3 py-2"
							>
								<div className="min-w-0">
									<p className="text-xs font-mono">{row.action}</p>
									<p className="truncate text-[11px] text-muted-foreground">
										{row.actorEmail} ·{" "}
										<span className="font-mono">
											{row.ip ?? "(IP unknown)"}
										</span>
										{row.userAgent ? ` · ${row.userAgent}` : ""}
									</p>
								</div>
								<time
									className="shrink-0 text-[11px] text-muted-foreground"
									dateTime={new Date(row.createdAt).toISOString()}
								>
									{new Date(row.createdAt).toLocaleString()}
								</time>
							</li>
						))}
					</ul>
				)}
			</OwnerSettingsCard>
		</div>
	);
}

function Spinner({ label }: { label: string }) {
	return (
		<div className="flex items-center gap-2 text-sm text-muted-foreground">
			<Loader2 className="h-4 w-4 animate-spin" /> {label}
		</div>
	);
}

function formatRelative(at: number): string {
	const diff = at - Date.now();
	if (diff <= 0) return "now";
	const mins = Math.floor(diff / 60_000);
	if (mins < 1) return "in <1m";
	if (mins === 1) return "in 1m";
	return `in ${mins}m`;
}
