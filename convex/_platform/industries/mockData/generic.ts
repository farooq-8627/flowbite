/**
 * Mock data for the Generic / fallback CRM template.
 *
 * Generic has no industry-specific `fieldDefinitions`, so this seed
 * exercises only the system fields (displayName, email, phone, status,
 * value, stageCode) plus tag attachment + note categories. The goal is
 * a balanced board: every pipeline column has at least one card, every
 * note category has at least one sticky, and every tag preset is
 * represented.
 */
import type { MockDataSeed } from "../../../crm/fields/templates/types";

export const genericMockData: MockDataSeed = {
	companies: [
		{
			key: "sample-co",
			name: "Sample Co.",
			industry: "Professional Services",
			website: "https://sampleco.example.com",
		},
		{
			key: "northwind",
			name: "Northwind Trading",
			industry: "Wholesale",
			website: "https://northwind.example.com",
		},
	],
	leads: [
		{
			displayName: "Alex Park",
			email: "alex.p@example.com",
			phone: "+1 555 010 0001",
			status: "new",
			tags: ["Hot", "Follow up"],
		},
		{
			displayName: "Jamie Carter",
			email: "jamie.c@example.com",
			phone: "+1 555 010 0003",
			status: "contacted",
			tags: ["Warm"],
		},
		{
			displayName: "Priya Iyer",
			email: "priya.i@example.com",
			phone: "+1 555 010 0005",
			status: "new",
			tags: ["Cold", "Follow up"],
		},
	],
	contacts: [
		{
			displayName: "Sam Lee",
			email: "sam.lee@example.com",
			phone: "+1 555 010 0002",
			companyKey: "sample-co",
			tags: ["VIP"],
		},
		{
			displayName: "Jordan Rivera",
			email: "jordan.r@example.com",
			phone: "+1 555 010 0004",
			tags: ["Follow up"],
		},
		{
			displayName: "Maya Singh",
			email: "maya.s@example.com",
			phone: "+1 555 010 0006",
			companyKey: "northwind",
			tags: ["VIP", "Hot"],
		},
	],
	deals: [
		{
			title: "Sample Co. — Q3 contract",
			stageCode: "PROP",
			value: 8500,
			contactDisplayName: "Sam Lee",
			companyKey: "sample-co",
			tags: ["Hot"],
		},
		{
			title: "Jordan — initial outreach",
			stageCode: "CONT",
			value: 3000,
			contactDisplayName: "Jordan Rivera",
			tags: ["Warm"],
		},
		{
			title: "Northwind — annual renewal",
			stageCode: "NEG",
			value: 24000,
			contactDisplayName: "Maya Singh",
			companyKey: "northwind",
			tags: ["VIP"],
		},
		{
			title: "Closed example — last quarter",
			stageCode: "WON",
			value: 12000,
			contactDisplayName: "Sam Lee",
			companyKey: "sample-co",
			tags: ["Hot"],
		},
	],
	notes: [
		{
			content:
				"Welcome! This is sample data — explore the CRM then clear it from the banner above (or Settings → Workspace → Sample Data) when you're ready.",
			categoryName: "Today",
		},
		{
			content:
				"Sam Lee at Sample Co. is expecting a revised proposal by Friday. Adjust the deal value and move to Negotiation when sent.",
			categoryName: "In Progress",
			anchorTo: { kind: "deal", title: "Sample Co. — Q3 contract" },
		},
		{
			content: "Maya pre-approved an annual renewal — book the contract review meeting.",
			categoryName: "In Progress",
			anchorTo: { kind: "deal", title: "Northwind — annual renewal" },
		},
		{
			content: "Idea: set up a saved view for all open deals closing this month.",
			categoryName: "Idea",
		},
		{
			content: "Last quarter's Sample Co. deal closed — log retro outcome.",
			categoryName: "Done",
			anchorTo: { kind: "deal", title: "Closed example — last quarter" },
		},
	],
	tasks: [
		{
			title: "Send revised proposal to Sam Lee",
			dueOffsetDays: 2,
			priority: "high",
			source: "manual",
			anchorTo: { kind: "deal", title: "Sample Co. — Q3 contract" },
		},
		{
			title: "Follow up with Jamie Carter",
			dueOffsetDays: 1,
			priority: "normal",
			source: "followup",
			anchorTo: { kind: "lead", displayName: "Jamie Carter" },
		},
		{
			title: "Northwind — schedule renewal meeting",
			dueOffsetDays: 3,
			priority: "high",
			source: "followup",
			anchorTo: { kind: "deal", title: "Northwind — annual renewal" },
		},
		{
			title: "Clear sample data once explored — banner above or Settings",
			dueOffsetDays: 0,
			priority: "normal",
			source: "manual",
		},
	],
};
