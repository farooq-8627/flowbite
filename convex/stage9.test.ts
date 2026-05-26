/**
 * convex/stage9.test.ts
 *
 * Stage 9 of `/SPRINT-PLAN.md` (2026-05-26). Regression coverage for the
 * creative-layer tools (`draft_message`, `commit_draft_message`,
 * `draft_proposal`, `commit_draft_proposal`, `summarise_conversation`,
 * `web_scrape`).
 *
 * The test file lives at the convex root (matches stage5/6/7/8.test.ts)
 * so the import.meta.glob path produces a consistent "./" prefix
 * for every module — convex-test's path resolution requires that. Tests
 * deep under convex/ai/tools/creative/ fail to find sibling
 * convex/ai/creativeHelpers.ts because vite emits a 2-level relative
 * path for siblings (../../creativeHelpers.ts) but the _generated
 * prefix is 3 levels up — the mismatch is fatal for t.mutation /
 * t.query lookups.
 *
 * What we cover:
 *
 *   1. Pure deterministic builders for the 3 LLM tools — these are what
 *      production sees when no API key is configured.
 *   2. Quota helpers (`enforceCreativeQuota` / `enforceWebScrapeRateLimit`)
 *      — auth gate + 5/min rate limit + 50/day soft cap.
 *   3. `validateScrapeUrl` + `checkScrapeConfigured` pure helpers
 *      extracted from the `"use node"` web_scrape action so the
 *      validation gate can be tested without the V8-incompatible
 *      Firecrawl import.
 *
 * Tests do NOT load a real LLM — convex-test cannot run `"use node"`
 * actions in its V8 sandbox. The deterministic-fallback path covered
 * by the builders IS the same code paths these tests exercise.
 */

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import { getDefaultPermissionsForRole } from "./_shared/permissions/derive";
import { buildDeterministicDraftMessage, type DraftMessage } from "./ai/actions/draftMessage";
import { buildDeterministicProposal } from "./ai/actions/draftProposal";
import {
	buildDeterministicSummary,
	type SummariseInputMessage,
} from "./ai/actions/summariseConversation";
import { checkScrapeConfigured, validateScrapeUrl } from "./ai/actions/webScrape";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// ─── seeders (mirror messaging.test.ts) ──────────────────────────────────

async function seedUser(t: ReturnType<typeof convexTest>, email = "alice@example.com") {
	const now = Date.now();
	const userId = await t.run(async (ctx) => {
		return ctx.db.insert("users", {
			tokenIdentifier: `password|${email}`,
			email,
			name: email.split("@")[0],
			onboardingCompleted: false,
			createdAt: now,
			updatedAt: now,
		});
	});
	return { userId };
}

async function seedOrg(
	t: ReturnType<typeof convexTest>,
	userId: string,
	roleName: "owner" | "admin" | "member" | "viewer" = "owner",
) {
	return await t.run(async (ctx) => {
		const now = Date.now();
		const id = await ctx.db.insert("orgs", {
			name: "Stage 9 Test Org",
			slug: `stage9-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
			plan: "free",
			platformOrgId: "ORB-TEST",
			settings: {},
			createdAt: now,
			updatedAt: now,
		});
		const capitalize = (s: string) =>
			(s.charAt(0).toUpperCase() + s.slice(1)) as "Owner" | "Admin" | "Member" | "Viewer";
		const roleId = await ctx.db.insert("orgRoles", {
			orgId: id,
			name: capitalize(roleName),
			permissions: [...getDefaultPermissionsForRole(capitalize(roleName))],
			isSystem: true,
			isDefault: roleName === "member",
			createdAt: now,
			updatedAt: now,
		});
		await ctx.db.insert("orgMembers", {
			orgId: id,
			userId,
			roleId,
			joinedAt: now,
		});
		return id;
	});
}

// ─── deterministic builders ──────────────────────────────────────────────

describe("Stage 9 — creative deterministic fallbacks", () => {
	it("buildDeterministicDraftMessage produces a follow-up draft for a person target", () => {
		const draft: DraftMessage = buildDeterministicDraftMessage({
			intent: "follow-up",
			target: { kind: "person", code: "P-014", displayName: "Sara Khan" },
			userFirstName: "Alex",
		});
		expect(draft.body).toContain("Hi Sara");
		expect(draft.body).toContain("Alex");
		expect(draft.subject).toBe("Following up");
		expect(draft.channel).toBe("message");
		expect(draft.suggestedSendMessageArgs.personCode).toBe("P-014");
		expect(draft.suggestedSendMessageArgs.content).toBe(draft.body);
	});

	it("buildDeterministicDraftMessage routes thank-you intents to email channel", () => {
		const draft = buildDeterministicDraftMessage({
			intent: "thank-you",
			target: { kind: "deal", code: "D-007", displayName: "Acme Q4 Renewal" },
		});
		expect(draft.channel).toBe("email");
		expect(draft.subject).toBe("Thank you");
		expect(draft.suggestedSendMessageArgs.dealCode).toBe("D-007");
	});

	it("buildDeterministicDraftMessage honours customPrompt for custom intents", () => {
		const draft = buildDeterministicDraftMessage({
			intent: "custom",
			target: { kind: "company", code: "C-003", displayName: "Acme Corp" },
			customPrompt: "Apologise for the late reply and propose a 30-min sync.",
		});
		expect(draft.body).toContain("Apologise for the late reply");
		expect(draft.suggestedSendMessageArgs.companyCode).toBe("C-003");
	});

	it("buildDeterministicProposal returns 5 default sections in order", () => {
		const proposal = buildDeterministicProposal({
			deal: { title: "Acme Q4", dealCode: "D-007", value: 12000, currency: "USD" },
			company: { name: "Acme Corp" },
			person: { displayName: "Sara Khan" },
			orgPersona: "We help mid-market sales teams ship faster.",
		});
		expect(proposal.title).toContain("Acme Q4");
		expect(proposal.sections).toHaveLength(5);
		expect(proposal.sections.map((s) => s.heading)).toEqual([
			"Summary",
			"Pricing",
			"Timeline",
			"Next steps",
			"Terms",
		]);
		expect(proposal.bodyMarkdown).toContain("# Proposal — Acme Q4");
		expect(proposal.bodyMarkdown).toContain("USD 12,000");
		expect(proposal.bodyMarkdown).toContain("Acme Corp");
	});

	it("buildDeterministicSummary returns empty arrays + neutral summary for an empty thread", () => {
		const summary = buildDeterministicSummary({ messages: [] });
		expect(summary.bullets).toEqual([]);
		expect(summary.agreements).toEqual([]);
		expect(summary.openQuestions).toEqual([]);
		expect(summary.actionItems).toEqual([]);
		expect(summary.summary).toContain("No messages");
	});

	it("buildDeterministicSummary uses the last 3 messages as bullets + suggests review", () => {
		const messages: SummariseInputMessage[] = [
			{ body: "first", authorType: "user", authorName: "Alex", createdAt: 1 },
			{ body: "second", authorType: "user", authorName: "Sara", createdAt: 2 },
			{ body: "third", authorType: "user", authorName: "Alex", createdAt: 3 },
			{ body: "fourth", authorType: "user", authorName: "Sara", createdAt: 4 },
		];
		const summary = buildDeterministicSummary({ messages });
		expect(summary.bullets).toHaveLength(3);
		expect(summary.bullets[0]).toContain("Sara");
		expect(summary.bullets[2]).toContain("Sara");
		expect(summary.actionItems).toHaveLength(1);
		expect(summary.actionItems[0]?.body).toContain("Review");
	});
});

// ─── webScrape pure helpers — validation gates ──────────────────────────

describe("Stage 9 — web_scrape validators", () => {
	it("checkScrapeConfigured returns WEB_SCRAPE_NOT_CONFIGURED when key is missing", () => {
		const result = checkScrapeConfigured(undefined);
		expect(result?.ok).toBe(false);
		expect(result?.code).toBe("WEB_SCRAPE_NOT_CONFIGURED");
	});

	it("checkScrapeConfigured passes through when key is set", () => {
		expect(checkScrapeConfigured("anything")).toBeNull();
	});

	it("validateScrapeUrl rejects malformed URLs with WEB_SCRAPE_BAD_URL", () => {
		const result = validateScrapeUrl("not a url");
		expect(result?.ok).toBe(false);
		expect(result?.code).toBe("WEB_SCRAPE_BAD_URL");
	});

	it("validateScrapeUrl rejects non-http(s) protocols with WEB_SCRAPE_BAD_URL", () => {
		const result = validateScrapeUrl("file:///etc/passwd");
		expect(result?.ok).toBe(false);
		expect(result?.code).toBe("WEB_SCRAPE_BAD_URL");
	});

	it("validateScrapeUrl accepts http(s) URLs", () => {
		expect(validateScrapeUrl("https://example.com")).toBeNull();
		expect(validateScrapeUrl("http://localhost:3000/page")).toBeNull();
	});
});

// ─── quota helpers ───────────────────────────────────────────────────────

describe("Stage 9 — creativeHelpers quota gate", () => {
	it("enforceCreativeQuota refuses non-org-member callers", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { userId: outsiderId } = await seedUser(t, "outsider@example.com");

		await expect(
			t.mutation(internal.ai.creativeHelpers.enforceCreativeQuota, {
				orgId,
				userId: outsiderId,
				toolName: "commit_draft_message",
			}),
		).rejects.toThrow();
	});

	it("enforceCreativeQuota lets a member through on the first call + returns remaining budget", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const result = await t.mutation(internal.ai.creativeHelpers.enforceCreativeQuota, {
			orgId,
			userId,
			toolName: "commit_draft_message",
		});
		expect(result.remainingMinute).toBe(4);
		expect(result.remainingDay).toBe(49);
	});

	it("enforceCreativeQuota throws AI_QUOTA_EXHAUSTED at the 50/day soft cap", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const now = Date.now();
		await t.run(async (ctx) => {
			for (let i = 0; i < 50; i++) {
				await ctx.db.insert("aiToolEvents", {
					orgId,
					userId,
					toolName: "commit_draft_message",
					startedAt: now - i * 1000,
					durationMs: 1200,
					ok: true,
					expiresAt: now + 30 * 24 * 60 * 60 * 1000,
				});
			}
		});

		await expect(
			t.mutation(internal.ai.creativeHelpers.enforceCreativeQuota, {
				orgId,
				userId,
				toolName: "commit_draft_proposal",
			}),
		).rejects.toThrow(/AI_QUOTA_EXHAUSTED|Daily creative-tool budget/);
	});

	it("enforceCreativeQuota does NOT count failed calls toward the daily cap", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);

		const now = Date.now();
		await t.run(async (ctx) => {
			for (let i = 0; i < 50; i++) {
				await ctx.db.insert("aiToolEvents", {
					orgId,
					userId,
					toolName: "commit_draft_message",
					startedAt: now - i * 1000,
					durationMs: 1200,
					ok: false,
					errorCode: "AI_PROVIDER_ERROR",
					expiresAt: now + 30 * 24 * 60 * 60 * 1000,
				});
			}
		});

		const result = await t.mutation(internal.ai.creativeHelpers.enforceCreativeQuota, {
			orgId,
			userId,
			toolName: "summarise_conversation",
		});
		expect(result.remainingDay).toBe(49);
	});

	it("countRecentCreativeRunsForUser only counts ok creative-tool rows for that user", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { userId: otherId } = await seedUser(t, "other@example.com");

		const now = Date.now();
		await t.run(async (ctx) => {
			for (let i = 0; i < 3; i++) {
				await ctx.db.insert("aiToolEvents", {
					orgId,
					userId,
					toolName: "commit_draft_message",
					startedAt: now - i * 1000,
					durationMs: 100,
					ok: true,
					expiresAt: now + 30 * 24 * 60 * 60 * 1000,
				});
			}
			for (let i = 0; i < 2; i++) {
				await ctx.db.insert("aiToolEvents", {
					orgId,
					userId: otherId,
					toolName: "summarise_conversation",
					startedAt: now - i * 1000,
					durationMs: 100,
					ok: true,
					expiresAt: now + 30 * 24 * 60 * 60 * 1000,
				});
			}
			await ctx.db.insert("aiToolEvents", {
				orgId,
				userId,
				toolName: "create_lead",
				startedAt: now,
				durationMs: 100,
				ok: true,
				expiresAt: now + 30 * 24 * 60 * 60 * 1000,
			});
		});

		const count = await t.query(internal.ai.creativeHelpers.countRecentCreativeRunsForUser, {
			orgId,
			userId,
		});
		expect(count).toBe(3);
	});

	it("enforceWebScrapeRateLimit gates non-members and lets members through", async () => {
		const t = convexTest(schema, modules);
		const { userId } = await seedUser(t);
		const orgId = await seedOrg(t, userId);
		const { userId: outsiderId } = await seedUser(t, "outsider@example.com");

		await t.mutation(internal.ai.creativeHelpers.enforceWebScrapeRateLimit, {
			orgId,
			userId,
		});

		await expect(
			t.mutation(internal.ai.creativeHelpers.enforceWebScrapeRateLimit, {
				orgId,
				userId: outsiderId,
			}),
		).rejects.toThrow();
	});
});
