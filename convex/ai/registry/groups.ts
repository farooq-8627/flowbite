/**
 * Group registry. Each domain (leads, tasks, deals…) registers a `GroupDef`
 * carrying the per-domain playbook text — the "what to call when" body the
 * host emits for the ACTIVE group(s) only (not the whole catalog), keeping
 * tokens scoped to the user's current intent.
 *
 * Keep playbooks short (≤15 lines) — they ship in every turn that activates
 * the group, on top of the cached PROJECT drive + capability catalog.
 */
import { listCapabilities } from "./define";
import type { Capability } from "./types";

export type GroupDef = {
	name: string;
	playbook: string;
};

const GROUPS = new Map<string, GroupDef>();

/** Register a group. Throws on duplicate name to fail loud at import. */
export function defineGroup(def: GroupDef): GroupDef {
	if (GROUPS.has(def.name)) {
		throw new Error(`[ai/registry] Duplicate group name: "${def.name}".`);
	}
	GROUPS.set(def.name, def);
	return def;
}

export function getGroup(name: string): GroupDef | undefined {
	return GROUPS.get(name);
}

export function listGroups(): GroupDef[] {
	return Array.from(GROUPS.values());
}

/**
 * Render the playbook tail for the active groups. Skips groups that aren't
 * registered OR have no live capabilities — keeps the tail tight when a
 * router preload mentions a group whose port hasn't shipped yet.
 */
export function renderGroupPlaybooks(activeGroups: string[], caps?: Capability[]): string {
	const live = caps ?? listCapabilities();
	const liveGroupKeys = new Set(live.map((c) => c.group));
	const lines: string[] = [];
	for (const name of activeGroups) {
		const def = GROUPS.get(name);
		if (!def) continue;
		if (!liveGroupKeys.has(name)) continue;
		lines.push(`## ${def.name} playbook`, def.playbook.trim(), "");
	}
	return lines.join("\n").trim();
}
