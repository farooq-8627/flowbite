/**
 * Vertical profile registry — PERSONA ONLY (PART 1 §1.7 / §2.4).
 *
 * A vertical contributes a small optional drive addendum (tone + domain
 * vocabulary) injected into the per-turn TAIL — never the cached prefix,
 * never the capability schema. Field/pipeline data is always read live via
 * `describe_entity` / `describe_workspace`. Capabilities NEVER fork per
 * vertical — that's the whole point of the thin adapter.
 *
 * `convex/_platform/industries/**` stays seed-only; it builds the org's
 * initial fieldDefinitions / pipelines at onboarding and is NEVER read at
 * AI runtime.
 */

export type VerticalProfile = {
	/** Stable key — matches `org.industry`. Lower-kebab. */
	industryKey: string;
	/** Markdown drive addendum injected into the tail. Optional. ≤ 12 lines. */
	driveAddendum?: string;
};

const VERTICALS = new Map<string, VerticalProfile>();

export function defineVertical(profile: VerticalProfile): VerticalProfile {
	if (VERTICALS.has(profile.industryKey)) {
		throw new Error(`[ai/registry] Duplicate vertical key: "${profile.industryKey}".`);
	}
	VERTICALS.set(profile.industryKey, profile);
	return profile;
}

export function getVertical(industryKey: string): VerticalProfile | undefined {
	return VERTICALS.get(industryKey);
}

export function listVerticals(): VerticalProfile[] {
	return Array.from(VERTICALS.values());
}

/** TEST ONLY — clears the vertical registry so tests can re-seed. */
export function _resetVerticalsForTest(): void {
	VERTICALS.clear();
}

/**
 * Render the vertical's drive addendum, or "" if no profile is registered
 * for this org's industry. The host calls this when assembling the tail.
 */
export function renderVerticalAddendum(industryKey: string | undefined): string {
	if (!industryKey) return "";
	const profile = VERTICALS.get(industryKey);
	if (!profile?.driveAddendum) return "";
	return profile.driveAddendum.trim();
}

// ─── Built-in profiles ─────────────────────────────────────────────────────
//
// Verticals are seeded here as code (not data) because the addendum is part
// of the deployed prompt surface — the same shape every customer in that
// industry sees. Per-org overrides would defeat the cached prefix.
//
// Adding a vertical = one defineVertical() call. No capability changes,
// no schema changes, no per-org code.

defineVertical({
	industryKey: "real-estate",
	driveAddendum: `## Real-estate persona\n\nLeads here are property buyers / tenants / investors. Speak in real-estate terms: properties, units, listings, viewings, offers. Budgets are in the org's currency (default AED). When capturing requirements, ask for property type (1BR / 2BR / villa / townhouse), preferred area, and visit availability.`,
});

defineVertical({
	industryKey: "recruitment",
	driveAddendum: `## Recruitment persona\n\nLeads here are candidates and clients. Speak in recruitment terms: roles, requisitions, screening, placements. When capturing a candidate, ask for current role, notice period, and salary expectation.`,
});

defineVertical({
	industryKey: "freelancer",
	driveAddendum: `## Freelancer persona\n\nThis is a small workspace. Tone is direct and personal. Records are your own clients and projects, not an enterprise pipeline — favour brevity and skip enterprise jargon.`,
});
