/**
 * Autonomy / safety gate (§1.6). Three pure predicates the wrapper composes:
 * RBAC (`canRun`), channel allow-list (`channelAllows` — irreversible NEVER
 * over WhatsApp regardless of declaration), and 2FA step-up (`needsStepUp`).
 * Replaces the per-user approval model + locked decision #26.
 */
import type { Capability, CapabilityCtx, Channel, Principal } from "./types";

/**
 * RBAC: may this principal run this capability? A `null` permission means the
 * capability is unguarded (reads/utility). Permissions come from the
 * server-side RBAC record on the principal — the request never supplies them.
 */
export function canRun(principal: Principal, cap: Capability): boolean {
	if (cap.permission === null) return true;
	return principal.permissions.includes(cap.permission);
}

/**
 * Channel allow-list: is this capability reachable from this channel? Beyond
 * the capability's declared `channels`, an irreversible capability is NEVER
 * allowed over WhatsApp regardless of what it declares — a hard fence so a
 * mis-tagged `channels` list can't expose a destructive op to the bot surface.
 */
export function channelAllows(channel: Channel, cap: Capability): boolean {
	if (cap.risk === "irreversible" && channel === "whatsapp") return false;
	return cap.channels.includes(channel);
}

/**
 * Does this call require a 2FA step-up before it can run? True only for an
 * irreversible capability when no step-up token has been completed yet.
 */
export function needsStepUp(cap: Capability, ctx: CapabilityCtx): boolean {
	return cap.risk === "irreversible" && !ctx.stepUpToken;
}
