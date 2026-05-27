/**
 * convex/ai/orchestrator/router.test.ts
 *
 * Stage 3-A H1 — heuristic-classifier contract tests.
 *
 * The router's heuristic shortlist is the LAST line of defence when the
 * LLM classifier has no API key (the most common case in production until
 * Anthropic key is wired). Every named case below is either:
 *   - The exact user-reported failure verbatim (the 2026-05-26 followup-
 *     for-p-007-next-stage-work bug); OR
 *   - A representative ambiguous CRM-action vs settings phrasing surfaced
 *     during the audit.
 *
 * Cases are grouped by intent. Each group documents WHY that intent must
 * route the way it does. If you change a regex, you must keep every
 * assertion green — no quiet weakening.
 */

import { describe, expect, it } from "vitest";
import { heuristicClassify } from "./router";

describe("router heuristicClassify — Stage 3-A H1", () => {
	describe("user-reported bug (verbatim) — must NOT route to settings", () => {
		it("create a followup for p-007 on this thursday for next stage work please", () => {
			const r = heuristicClassify(
				"create a followup for p-007 on this thursday for next stage work please",
			);
			// REGRESSION: previously matched (create + stage) → settings @ 0.65.
			// Fix: 'follow up' / 'followup' verb pins to crm_action BEFORE settings.
			expect(r.id).toBe("crm_action");
			expect(r.confidence).toBeGreaterThanOrEqual(0.7);
		});

		it("Can you please send a msg to p-007 saying Hi, Can you send me the documents", () => {
			// Same conversation, first message — must also be crm_action.
			const r = heuristicClassify(
				"Can you please send a msg to p-007 saying Hi, Can you send me the documents",
			);
			expect(r.id).toBe("crm_action");
		});
	});

	describe("CRM-action verbs pin to crm_action @ ≥0.7", () => {
		const cases: Array<[string, string]> = [
			["follow up with Sarah next week", "crm_action"],
			["follow-up call with the Acme deal", "crm_action"],
			["create a follow-up for L-007", "crm_action"],
			["remind me to call back tomorrow", "crm_action"],
			["set a reminder for D-005 on Friday", "crm_action"],
			["add a note to P-001 about the call", "crm_action"],
			["note for P-002: client wants discount", "crm_action"],
			["call back the BDR lead", "crm_action"],
			["check in with Acme this Thursday", "crm_action"],
			["nudge the Acme deal", "crm_action"],
			["tag this lead as hot", "crm_action"],
			["convert this lead to a contact", "crm_action"],
			["move D-007 to negotiation", "crm_action"],
			["send a message to P-001", "crm_action"],
			["send msg to the deal owner", "crm_action"],
			["draft a thank-you for D-007", "crm_action"],
			["write a follow-up email to P-005", "crm_action"],
			["summarise the conversation with Acme", "crm_action"],
			["recap the last 3 messages on the deal", "crm_action"],
			["qualify L-007 as warm", "crm_action"],
			["push my reminder to next monday", "crm_action"],
			["reschedule the follow-up to friday", "crm_action"],
		];

		for (const [msg, expected] of cases) {
			it(`"${msg}" → ${expected}`, () => {
				const r = heuristicClassify(msg);
				expect(r.id).toBe(expected);
			});
		}
	});

	describe("workspace-settings true positives still route to settings", () => {
		const cases: Array<[string, string]> = [
			["rename the Sales pipeline to Renewals", "settings"],
			["rename the lead label to Prospect", "settings"],
			["change the currency to AED", "settings"],
			["change the timezone for the workspace", "settings"],
			["set the default pipeline for deals", "settings"],
			["update the workspace settings", "settings"],
			["update the pipeline definition", "settings"],
			["edit the Negotiation stage", "settings"],
			["edit the Account Executive role", "settings"],
			["configure the pipeline workflow", "settings"],
			["add a stage to the Sales pipeline", "settings"],
			["add a tag named 'Hot Lead'", "settings"],
			["add a saved view called Stale leads", "settings"],
			["create a new pipeline for renewals", "settings"],
			["create a tag named urgent", "settings"],
			["delete the Negotiation stage", "settings"],
			["delete the BDR role", "settings"],
			["invite a member to the workspace", "settings"],
			["invite alice@example.com", "settings"],
			["manage role permissions", "settings"],
			["reorder stages in the Sales pipeline", "settings"],
			["apply the real estate template", "settings"],
		];

		for (const [msg, expected] of cases) {
			it(`"${msg}" → ${expected}`, () => {
				const r = heuristicClassify(msg);
				expect(r.id).toBe(expected);
			});
		}
	});

	describe("read-only Q&A still routes to qa", () => {
		const cases: Array<[string, string]> = [
			["what fields are on a deal?", "qa"],
			["which leads are stale?", "qa"],
			["who owns D-007?", "qa"],
			["how many open deals do I have?", "qa"],
			["can I export my leads?", "qa"],
			["show me the Acme deal", "qa"],
			["list my open follow-ups", "qa"],
			["find leads tagged urgent", "qa"],
			["search for Sarah", "qa"],
			["are there any overdue reminders?", "qa"],
		];

		for (const [msg, expected] of cases) {
			it(`"${msg}" → ${expected}`, () => {
				const r = heuristicClassify(msg);
				expect(r.id).toBe(expected);
			});
		}
	});

	describe("ambiguous / fallback cases", () => {
		it("bare 'help me with my deals' → crm_action fallback", () => {
			const r = heuristicClassify("help me with my deals");
			expect(r.id).toBe("crm_action");
			// Bare fallback is 0.4 confidence (still goes to LLM classifier
			// when one is configured).
			expect(r.confidence).toBe(0.4);
		});

		it("'thanks!' → crm_action fallback (low confidence)", () => {
			const r = heuristicClassify("thanks!");
			expect(r.id).toBe("crm_action");
			expect(r.confidence).toBeLessThan(0.5);
		});

		it("CRM-action verb wins over a settings noun in the same sentence", () => {
			// User says "create a follow-up for D-007 about the next stage" —
			// 'stage' alone (without 'rename/edit/add stage to ...pipeline')
			// must NOT trigger settings.
			const r = heuristicClassify("create a follow-up for D-007 about the next stage");
			expect(r.id).toBe("crm_action");
		});

		it("'tag this lead as hot' must NOT route to settings tag-management", () => {
			// 'tag' alone is no longer a settings noun. The verb 'tag this'
			// is a CRM action (attach existing tag to a record).
			const r = heuristicClassify("tag this lead as hot");
			expect(r.id).toBe("crm_action");
		});

		it("'add a tag named urgent' → settings (CREATE the tag definition)", () => {
			// Distinct from "tag this lead as urgent" — this creates a tag.
			const r = heuristicClassify("add a tag named urgent");
			expect(r.id).toBe("settings");
		});

		it("'send the AED report to my manager' is read-or-action — fallback OK", () => {
			// Not a clear CRM verb either way; classifier picks. Heuristic
			// should fall back to crm_action @ 0.4.
			const r = heuristicClassify("send the AED report to my manager");
			// 'send' is in the crm_action verb set → must NOT fall through.
			expect(r.id).toBe("crm_action");
		});
	});
});
