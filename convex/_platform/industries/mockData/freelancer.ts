/**
 * Mock data for the Freelancer / Solo template.
 *
 * Lean solo operator. Companies hidden. Pipeline:
 *   Inquiry → Quote Sent → In Progress → Invoiced → Paid | Lost.
 *
 * Field coverage:
 *   - lead: project_type, deadline (every lead has both)
 *   - deal: project_type, scope, quoted_amount, deadline, hourly_rate,
 *     invoice_paid_date (only on PAID deals per `showInStages`)
 *
 * At least one deal per stage so the dashboard board is fully populated
 * the moment the user lands.
 */
import type { MockDataSeed } from "../../../crm/fields/templates/types";

const DAY_MS = 86_400_000;

export const freelancerMockData: MockDataSeed = {
	leads: [
		{
			displayName: "Nina Patel",
			email: "nina.p@example.com",
			phone: "+1 415 555 0100",
			status: "new",
			fieldValues: {
				project_type: "Design",
				deadline: Date.now() + 14 * DAY_MS,
			},
			tags: ["Referral"],
		},
		{
			displayName: "Lukas Weber",
			email: "lukas.w@example.com",
			phone: "+49 30 555 0101",
			status: "contacted",
			fieldValues: {
				project_type: "Development",
				deadline: Date.now() + 30 * DAY_MS,
			},
			tags: ["Rush"],
		},
		{
			displayName: "Sara Cohen",
			email: "sara.c@example.com",
			phone: "+972 52 555 0102",
			status: "new",
			fieldValues: {
				project_type: "Writing",
				deadline: Date.now() + 21 * DAY_MS,
			},
			tags: ["Referral"],
		},
	],
	contacts: [
		{
			displayName: "Aisha Bakr",
			email: "aisha@example.com",
			phone: "+1 213 555 0150",
			tags: ["Repeat client"],
		},
		{
			displayName: "Hiroshi Tanaka",
			email: "hiroshi@example.com",
			phone: "+81 3 5555 0151",
			tags: ["Referral"],
		},
		{
			displayName: "Olivia Brennan",
			email: "olivia.b@example.com",
			phone: "+353 1 555 0152",
			tags: ["Repeat client"],
		},
	],
	deals: [
		{
			title: "Logo redesign — Aisha",
			stageCode: "WIP",
			value: 1500,
			contactDisplayName: "Aisha Bakr",
			fieldValues: {
				project_type: "Design",
				scope: "Logo + brand mark variations + style guide.",
				quoted_amount: 1500,
				deadline: Date.now() + 7 * DAY_MS,
				hourly_rate: 75,
			},
			tags: ["Repeat client"],
		},
		{
			title: "Marketing site copy — Hiroshi",
			stageCode: "QUOTE",
			value: 800,
			contactDisplayName: "Hiroshi Tanaka",
			fieldValues: {
				project_type: "Writing",
				scope: "Homepage + 4 product pages.",
				quoted_amount: 800,
				deadline: Date.now() + 14 * DAY_MS,
				hourly_rate: 60,
			},
			tags: ["Referral"],
		},
		{
			title: "Brand refresh — Olivia",
			stageCode: "INV",
			value: 2400,
			contactDisplayName: "Olivia Brennan",
			fieldValues: {
				project_type: "Design",
				scope: "Color palette refresh + 3 marketing templates.",
				quoted_amount: 2400,
				deadline: Date.now() - 3 * DAY_MS,
				hourly_rate: 80,
			},
			tags: ["Late payment"],
		},
		{
			title: "Old logo cleanup — Olivia (paid)",
			stageCode: "PAID",
			value: 600,
			contactDisplayName: "Olivia Brennan",
			fieldValues: {
				project_type: "Design",
				scope: "One-off logo cleanup + favicon export.",
				quoted_amount: 600,
				deadline: Date.now() - 30 * DAY_MS,
				hourly_rate: 80,
				invoice_paid_date: Date.now() - 25 * DAY_MS,
			},
			tags: ["Repeat client"],
		},
		{
			title: "Inquiry — Sara cookbook design",
			stageCode: "INQ",
			value: 1200,
			contactDisplayName: "Hiroshi Tanaka",
			fieldValues: {
				project_type: "Design",
				scope: "Cookbook layout + cover design.",
				quoted_amount: 1200,
				deadline: Date.now() + 21 * DAY_MS,
				hourly_rate: 70,
			},
		},
		{
			title: "Lost — Lukas SaaS landing page",
			stageCode: "LOST",
			value: 1800,
			fieldValues: {
				project_type: "Development",
				scope: "Landing page rebuild — they went in-house.",
				quoted_amount: 1800,
				deadline: Date.now() + 30 * DAY_MS,
				hourly_rate: 90,
			},
		},
	],
	notes: [
		{
			content: "Aisha approved sketches — proceed with vector + color exploration.",
			categoryName: "Today",
			anchorTo: { kind: "deal", title: "Logo redesign — Aisha" },
		},
		{
			content: "Send Hiroshi a revised quote — he wants 2 product pages added.",
			categoryName: "Urgent",
			anchorTo: { kind: "deal", title: "Marketing site copy — Hiroshi" },
		},
		{
			content: "Olivia invoice 12 days overdue — send polite reminder + late-fee schedule.",
			categoryName: "Urgent",
			anchorTo: { kind: "deal", title: "Brand refresh — Olivia" },
		},
		{
			content:
				"Idea: package logo + brand-guide + landing-page copy as a 'starter kit' offer.",
			categoryName: "Idea",
		},
		{
			content: "Olivia's previous job paid early — flag as priority repeat client.",
			categoryName: "Done",
			anchorTo: { kind: "deal", title: "Old logo cleanup — Olivia (paid)" },
		},
	],
	tasks: [
		{
			title: "Send logo v2 to Aisha",
			dueOffsetDays: 0,
			priority: "high",
			source: "manual",
			anchorTo: { kind: "deal", title: "Logo redesign — Aisha" },
		},
		{
			title: "Follow up on Hiroshi's revised quote",
			dueOffsetDays: 2,
			priority: "high",
			source: "followup",
			anchorTo: { kind: "deal", title: "Marketing site copy — Hiroshi" },
		},
		{
			title: "Olivia — payment reminder",
			dueOffsetDays: 1,
			priority: "urgent",
			source: "followup",
			anchorTo: { kind: "deal", title: "Brand refresh — Olivia" },
		},
		{
			title: "Sara cookbook — schedule discovery call",
			dueOffsetDays: 3,
			priority: "normal",
			source: "manual",
			anchorTo: { kind: "lead", displayName: "Sara Cohen" },
		},
	],
};
