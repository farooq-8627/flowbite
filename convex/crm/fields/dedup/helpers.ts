// @ts-nocheck — ctx.db is typed as any; index callback params are implicitly any
/**
 * Dedup Engine — convex/crm/fields/dedup/helpers.ts
 *
 * Shared dedup utility used by leads.create and contacts.create.
 * Checks email (exact via index), phone (normalized via index), and displayName (fuzzy) within an org.
 *
 * Returns an array of duplicate candidates. Empty array = no duplicates found.
 * The caller decides what to do — show a warning, block, or proceed.
 */
import type { Id } from "../../../_generated/dataModel";

export type DuplicateCandidate = {
	entityType: "lead" | "contact";
	entityId: string;
	personCode: string;
	displayName: string;
	email?: string;
	phone?: string;
	confidence: "high" | "medium" | "low";
	matchReason: string;
};

/** Normalize phone: strip all non-digits */
export function normalizePhone(phone: string): string {
	return phone.replace(/\D/g, "");
}

/** Simple Levenshtein distance for fuzzy name matching */
function levenshtein(a: string, b: string): number {
	const m = a.length;
	const n = b.length;
	const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
		Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
	);
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			dp[i][j] =
				a[i - 1] === b[j - 1]
					? dp[i - 1][j - 1]
					: 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
		}
	}
	return dp[m][n];
}

function isFuzzyNameMatch(a: string, b: string): boolean {
	const na = a.toLowerCase().trim();
	const nb = b.toLowerCase().trim();
	if (na === nb) return true;
	const threshold = na.length <= 6 ? 2 : 3;
	return levenshtein(na, nb) <= threshold;
}

/**
 * Run dedup check for a new lead or contact.
 * Uses indexes for email and phone — O(log n) instead of O(n).
 */
export async function runDedup(
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	ctx: { db: any },
	orgId: Id<"orgs">,
	email?: string,
	phone?: string,
	displayName?: string,
): Promise<DuplicateCandidate[]> {
	const duplicates: DuplicateCandidate[] = [];

	// ── Email exact match (high confidence) — uses by_org_and_email index ────
	if (email) {
		const [leadByEmail, contactByEmail] = await Promise.all([
			ctx.db
				.query("leads")
				.withIndex("by_org_and_email", (q) => q.eq("orgId", orgId).eq("email", email))
				.first(),
			ctx.db
				.query("contacts")
				.withIndex("by_org_and_email", (q) => q.eq("orgId", orgId).eq("email", email))
				.first(),
		]);

		if (leadByEmail && !leadByEmail.deletedAt && !leadByEmail.convertedAt) {
			duplicates.push({
				entityType: "lead",
				entityId: leadByEmail._id,
				personCode: leadByEmail.personCode,
				displayName: leadByEmail.displayName,
				email: leadByEmail.email,
				phone: leadByEmail.phone,
				confidence: "high",
				matchReason: "Same email address",
			});
		}
		if (contactByEmail && !contactByEmail.deletedAt) {
			duplicates.push({
				entityType: "contact",
				entityId: contactByEmail._id,
				personCode: contactByEmail.personCode,
				displayName: contactByEmail.displayName,
				email: contactByEmail.email,
				phone: contactByEmail.phone,
				confidence: "high",
				matchReason: "Same email address",
			});
		}
	}

	// ── Phone normalized match (medium confidence) — uses by_org_and_normalizedPhone index ──
	if (phone && duplicates.length === 0) {
		const normalized = normalizePhone(phone);
		if (normalized.length >= 7) {
			const [leadByPhone, contactByPhone] = await Promise.all([
				ctx.db
					.query("leads")
					.withIndex("by_org_and_normalizedPhone", (q) => q.eq("orgId", orgId).eq("normalizedPhone", normalized))
					.first(),
				ctx.db
					.query("contacts")
					.withIndex("by_org_and_normalizedPhone", (q) => q.eq("orgId", orgId).eq("normalizedPhone", normalized))
					.first(),
			]);

			if (leadByPhone && !leadByPhone.deletedAt && !leadByPhone.convertedAt) {
				duplicates.push({
					entityType: "lead",
					entityId: leadByPhone._id,
					personCode: leadByPhone.personCode,
					displayName: leadByPhone.displayName,
					email: leadByPhone.email,
					phone: leadByPhone.phone,
					confidence: "medium",
					matchReason: "Same phone number",
				});
			}
			if (contactByPhone && !contactByPhone.deletedAt) {
				duplicates.push({
					entityType: "contact",
					entityId: contactByPhone._id,
					personCode: contactByPhone.personCode,
					displayName: contactByPhone.displayName,
					email: contactByPhone.email,
					phone: contactByPhone.phone,
					confidence: "medium",
					matchReason: "Same phone number",
				});
			}
		}
	}

	// ── Fuzzy name match (low confidence) — only if no high/medium found ──────
	if (displayName && duplicates.length === 0) {
		const [leads, contacts] = await Promise.all([
			ctx.db
				.query("leads")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.take(200),
			ctx.db
				.query("contacts")
				.withIndex("by_org", (q) => q.eq("orgId", orgId))
				.take(200),
		]);

		for (const lead of leads) {
			if (!lead.deletedAt && !lead.convertedAt && isFuzzyNameMatch(lead.displayName, displayName)) {
				duplicates.push({
					entityType: "lead",
					entityId: lead._id,
					personCode: lead.personCode,
					displayName: lead.displayName,
					email: lead.email,
					phone: lead.phone,
					confidence: "low",
					matchReason: "Similar name",
				});
			}
		}
		for (const contact of contacts) {
			if (!contact.deletedAt && isFuzzyNameMatch(contact.displayName, displayName)) {
				duplicates.push({
					entityType: "contact",
					entityId: contact._id,
					personCode: contact.personCode,
					displayName: contact.displayName,
					email: contact.email,
					phone: contact.phone,
					confidence: "low",
					matchReason: "Similar name",
				});
			}
		}
	}

	return duplicates;
}
