/**
 * Mock data for the Agency / Freelance template.
 *
 * Full agency setup with retainer + milestone billing. Pipeline:
 *   Inquiry → Quote → Deposit → WIP → Review → Invoiced → Done | Cancelled.
 *
 * Field coverage:
 *   - lead: project_type, budget_range, deadline, referral_source
 *   - contact: company_name, billing_email, payment_terms
 *   - deal: scope_summary, quoted_amount, estimated_hours, hourly_rate,
 *     deposit_amount, deposit_paid_date (DEP+), delivery_date (WIP+),
 *     invoice_number/amount (INV+), invoice_paid_date (DONE),
 *     revision_count (REV+).
 *
 * One deal per stage (incl. CANCELLED) so the board lights up fully.
 */
import type { MockDataSeed } from "../../../crm/fields/templates/types";

const DAY_MS = 86_400_000;

export const agencyFreelanceMockData: MockDataSeed = {
	companies: [
		{
			key: "northwind-creative",
			name: "Northwind Creative",
			industry: "Agency",
			website: "https://northwind.example.com",
		},
		{
			key: "saltlight-studio",
			name: "Saltlight Studio",
			industry: "Sub-contractor agency",
			website: "https://saltlight.example.com",
		},
	],
	leads: [
		{
			displayName: "Tom Bauer",
			email: "tom.b@example.com",
			phone: "+1 415 555 0301",
			status: "new",
			fieldValues: {
				project_type: "Branding",
				budget_range: "$15K–$50K",
				deadline: Date.now() + 30 * DAY_MS,
				referral_source: "Portfolio",
			},
			tags: ["Repeat client"],
		},
		{
			displayName: "Eva Larsson",
			email: "eva.l@example.com",
			phone: "+46 8 555 0302",
			status: "contacted",
			fieldValues: {
				project_type: "Website",
				budget_range: "$5K–$15K",
				deadline: Date.now() + 21 * DAY_MS,
				referral_source: "Referral",
			},
			tags: ["Referral source"],
		},
		{
			displayName: "Carlos Mendes",
			email: "carlos@example.com",
			phone: "+55 11 5555 0303",
			status: "new",
			fieldValues: {
				project_type: "Video",
				budget_range: "$1K–$5K",
				deadline: Date.now() + 14 * DAY_MS,
				referral_source: "Social media",
			},
			tags: ["Rush job"],
		},
		{
			displayName: "Mei Watanabe",
			email: "mei.w@example.com",
			phone: "+81 3 5555 0304",
			status: "new",
			fieldValues: {
				project_type: "Marketing",
				budget_range: "$50K+",
				deadline: Date.now() + 60 * DAY_MS,
				referral_source: "Repeat client",
			},
			tags: ["Retainer"],
		},
	],
	contacts: [
		{
			displayName: "Aria Thompson",
			email: "aria@example.com",
			phone: "+1 213 555 0310",
			companyKey: "northwind-creative",
			fieldValues: {
				company_name: "Northwind Creative",
				billing_email: "billing@northwind.example.com",
				payment_terms: "50% upfront",
			},
			tags: ["Retainer"],
		},
		{
			displayName: "Riku Yamada",
			email: "riku@example.com",
			phone: "+81 3 5555 0311",
			fieldValues: {
				company_name: "Riku Studios",
				billing_email: "riku@example.com",
				payment_terms: "Milestone-based",
			},
		},
		{
			displayName: "Owen Brewer",
			email: "owen@example.com",
			phone: "+44 20 7946 0312",
			companyKey: "saltlight-studio",
			fieldValues: {
				company_name: "Saltlight Studio",
				billing_email: "ap@saltlight.example.com",
				payment_terms: "Net 30",
			},
			tags: ["Repeat client"],
		},
	],
	deals: [
		{
			title: "Tom — branding inquiry",
			stageCode: "INQ",
			value: 18000,
			fieldValues: {
				scope_summary: "Brand discovery + identity kit + 2 marketing templates.",
				quoted_amount: 18000,
				estimated_hours: 110,
				hourly_rate: 165,
			},
			tags: ["Repeat client"],
		},
		{
			title: "Eva — Shopify rebuild quote",
			stageCode: "QUOTE",
			value: 12500,
			fieldValues: {
				scope_summary: "Shopify theme rebuild + 6 product pages + email integration.",
				quoted_amount: 12500,
				estimated_hours: 75,
				hourly_rate: 165,
			},
		},
		{
			title: "Carlos — promo video deposit",
			stageCode: "DEP",
			value: 4500,
			fieldValues: {
				scope_summary: "60-second promo video + 3 social cutdowns.",
				quoted_amount: 4500,
				estimated_hours: 35,
				hourly_rate: 130,
				deposit_amount: 2250,
				deposit_paid_date: Date.now() - 2 * DAY_MS,
			},
			tags: ["Rush job"],
		},
		{
			title: "Northwind — Website redesign",
			stageCode: "WIP",
			value: 12000,
			contactDisplayName: "Aria Thompson",
			companyKey: "northwind-creative",
			fieldValues: {
				scope_summary:
					"Marketing site redesign — homepage + 6 inner pages + CMS migration.",
				quoted_amount: 12000,
				estimated_hours: 80,
				hourly_rate: 150,
				deposit_amount: 6000,
				deposit_paid_date: Date.now() - 14 * DAY_MS,
				delivery_date: Date.now() + 21 * DAY_MS,
			},
			tags: ["Repeat client"],
		},
		{
			title: "Riku — Brand identity",
			stageCode: "REV",
			value: 8500,
			contactDisplayName: "Riku Yamada",
			fieldValues: {
				scope_summary: "Logo + brand guide + business card mockups.",
				quoted_amount: 8500,
				estimated_hours: 60,
				hourly_rate: 142,
				deposit_amount: 4250,
				deposit_paid_date: Date.now() - 30 * DAY_MS,
				delivery_date: Date.now() + 7 * DAY_MS,
				revision_count: 2,
			},
			tags: ["Scope creep"],
		},
		{
			title: "Saltlight — quarterly retainer May",
			stageCode: "INV",
			value: 9000,
			contactDisplayName: "Owen Brewer",
			companyKey: "saltlight-studio",
			fieldValues: {
				scope_summary: "May retainer — 60 hours design + content support.",
				quoted_amount: 9000,
				estimated_hours: 60,
				hourly_rate: 150,
				deposit_amount: 0,
				delivery_date: Date.now() - 5 * DAY_MS,
				revision_count: 1,
				invoice_number: "INV-2026-0421",
				invoice_amount: 9000,
			},
			tags: ["Retainer", "Overdue payment"],
		},
		{
			title: "Saltlight — quarterly retainer April (closed)",
			stageCode: "DONE",
			value: 9000,
			contactDisplayName: "Owen Brewer",
			companyKey: "saltlight-studio",
			fieldValues: {
				scope_summary: "April retainer — completed + invoiced + paid.",
				quoted_amount: 9000,
				estimated_hours: 60,
				hourly_rate: 150,
				deposit_amount: 0,
				delivery_date: Date.now() - 35 * DAY_MS,
				revision_count: 0,
				invoice_number: "INV-2026-0331",
				invoice_amount: 9000,
				invoice_paid_date: Date.now() - 28 * DAY_MS,
			},
			tags: ["Retainer", "Repeat client"],
		},
		{
			title: "Carlos — second video pitch (cancelled)",
			stageCode: "CXL",
			value: 3500,
			fieldValues: {
				scope_summary: "Cancelled — client postponed campaign indefinitely.",
				quoted_amount: 3500,
				estimated_hours: 25,
				hourly_rate: 140,
			},
		},
	],
	notes: [
		{
			content: "Northwind kickoff call — confirmed scope + signed deposit invoice.",
			categoryName: "Brief",
			anchorTo: { kind: "deal", title: "Northwind — Website redesign" },
		},
		{
			content: "Riku requested third revision on logo color palette. Track scope.",
			categoryName: "Review",
			anchorTo: { kind: "deal", title: "Riku — Brand identity" },
		},
		{
			content: "Saltlight May invoice 5 days overdue — send reminder + late-fee schedule.",
			categoryName: "Urgent",
			anchorTo: { kind: "deal", title: "Saltlight — quarterly retainer May" },
		},
		{
			content: "Tom asked for portfolio samples in agency style — send Wednesday.",
			categoryName: "Today",
			anchorTo: { kind: "lead", displayName: "Tom Bauer" },
		},
		{
			content:
				"Carlos cancelled the second-video pitch — log lessons-learned and parking-lot for Q4 reach-out.",
			categoryName: "Done",
			anchorTo: { kind: "deal", title: "Carlos — second video pitch (cancelled)" },
		},
	],
	tasks: [
		{
			title: "Northwind — homepage v1 to client",
			dueOffsetDays: 3,
			priority: "high",
			source: "followup",
			anchorTo: { kind: "deal", title: "Northwind — Website redesign" },
		},
		{
			title: "Riku — present revised logo set",
			dueOffsetDays: 1,
			priority: "high",
			source: "manual",
			anchorTo: { kind: "deal", title: "Riku — Brand identity" },
		},
		{
			title: "Saltlight — invoice reminder May retainer",
			dueOffsetDays: 0,
			priority: "urgent",
			source: "followup",
			anchorTo: { kind: "deal", title: "Saltlight — quarterly retainer May" },
		},
		{
			title: "Tom — brand portfolio samples",
			dueOffsetDays: 2,
			priority: "normal",
			source: "manual",
			anchorTo: { kind: "lead", displayName: "Tom Bauer" },
		},
		{
			title: "Mei Watanabe — discovery call (retainer)",
			dueOffsetDays: 4,
			priority: "high",
			source: "manual",
			anchorTo: { kind: "lead", displayName: "Mei Watanabe" },
		},
	],
};
