/**
 * Grouped capability catalog — second half of the cacheable stable prefix.
 * One line per capability (`name + whenToCall`) keeps the §2.2 token
 * target reachable. Sort order is alphabetical (group, then name) for
 * deterministic cache stability — NOT insertion order.
 */
import type { Capability } from "./types";

/** A grouped, ordered view of capabilities for catalog rendering. */
export type CapabilityGroup = {
	group: string;
	capabilities: Array<{ name: string; whenToCall: string }>;
};

/**
 * Group + sort capabilities by `cap.group` (alphabetical), and by `cap.name`
 * within each group. Returns the structured form used by both the rendered
 * catalog and the {@link router} (which picks groups by name).
 */
export function groupCapabilities(caps: Capability[]): CapabilityGroup[] {
	const byGroup = new Map<string, Capability[]>();
	for (const cap of caps) {
		const arr = byGroup.get(cap.group) ?? [];
		arr.push(cap);
		byGroup.set(cap.group, arr);
	}
	return Array.from(byGroup.keys())
		.sort((a, b) => a.localeCompare(b))
		.map((group) => ({
			group,
			capabilities: (byGroup.get(group) ?? [])
				.slice()
				.sort((a, b) => a.name.localeCompare(b.name))
				.map((c) => ({
					name: c.name,
					whenToCall: c.spec.whenToCall.trim().replace(/\s+/g, " "),
				})),
		}));
}

/**
 * Render the catalog as plain text — the format the system prompt embeds.
 * Each group becomes a `## <Group>` block; each capability is one line:
 *   `- <name> — <one-liner>`.
 *
 * The `## Capabilities` heading is included so the model can locate the
 * section reliably. `whenToCall` is collapsed to a single line of
 * whitespace so multi-line spec text doesn't bloat the catalog.
 */
export function renderCatalog(caps: Capability[]): string {
	const groups = groupCapabilities(caps);
	const lines: string[] = ["## Capabilities", ""];
	if (groups.length === 0) {
		lines.push("(none registered)");
		return lines.join("\n");
	}
	for (const g of groups) {
		lines.push(`### ${formatGroupHeading(g.group)}`);
		for (const c of g.capabilities) {
			lines.push(`- \`${c.name}\` — ${c.whenToCall}`);
		}
		lines.push("");
	}
	return lines.join("\n").trimEnd();
}

/**
 * The list of registered group keys, alphabetised. Used by the router to
 * resolve a deterministic keyword → group(s) mapping against what's
 * actually live in the registry (so a typo in the router fails loudly).
 */
export function listGroupKeys(caps: Capability[]): string[] {
	return groupCapabilities(caps).map((g) => g.group);
}

/**
 * Filter capabilities by a set of group keys — used by the host to load
 * the in-scope tools for a turn (router-preloaded + core).
 */
export function capabilitiesInGroups(
	caps: Capability[],
	groupKeys: Iterable<string>,
): Capability[] {
	const wanted = new Set(groupKeys);
	return caps.filter((c) => wanted.has(c.group));
}

function formatGroupHeading(key: string): string {
	if (key.length === 0) return "(misc)";
	// `leads` → "Leads", `pipelines` → "Pipelines", etc. Group keys are
	// snake_case identifiers; the heading is just title-cased.
	return key
		.split(/[\s_-]+/)
		.map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
		.join(" ");
}
