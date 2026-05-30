/**
 * Mock data for the Productivity / Individual template.
 *
 * Solo task tracker. `lead` and `company` are hidden via
 * `entityVisibility`, so this seed only populates `deal` (renamed
 * "Task" in the UI) and `contact` (renamed "Person") plus a couple of
 * notes. Every Task fieldDefinition (priority, due_date,
 * estimated_hours, project) gets exercised across the 5 stages.
 */
import type { MockDataSeed } from "../../../crm/fields/templates/types";

const DAY_MS = 86_400_000;

export const productivityMockData: MockDataSeed = {
	contacts: [
		{
			displayName: "Anita Rao (mentor)",
			email: "anita.rao@example.com",
			phone: "+1 555 030 0001",
		},
		{
			displayName: "Workshop client — Jess",
			email: "jess@example.com",
			phone: "+1 555 030 0002",
		},
	],
	deals: [
		{
			title: "Finish quarterly report",
			stageCode: "DOING",
			fieldValues: {
				priority: "High",
				due_date: Date.now() + 2 * DAY_MS,
				estimated_hours: 4,
				project: "Q3-2026",
			},
			tags: ["#work"],
		},
		{
			title: "Reply to client emails",
			stageCode: "TODO",
			fieldValues: {
				priority: "Urgent",
				due_date: Date.now() - 1 * DAY_MS, // overdue on purpose
				estimated_hours: 1,
				project: "Inbox-zero",
			},
			tags: ["#work", "#waiting"],
		},
		{
			title: "Draft side-project landing page",
			stageCode: "REV",
			fieldValues: {
				priority: "Normal",
				due_date: Date.now() + 3 * DAY_MS,
				estimated_hours: 6,
				project: "Side-project",
			},
			tags: ["#side-project"],
		},
		{
			title: "Pick up groceries",
			stageCode: "DONE",
			fieldValues: {
				priority: "Low",
				due_date: Date.now() - 1 * DAY_MS,
				estimated_hours: 1,
				project: "Personal",
			},
			tags: ["#personal"],
		},
		{
			title: "Onboard new mentor session",
			stageCode: "TODO",
			fieldValues: {
				priority: "Normal",
				due_date: Date.now() + 7 * DAY_MS,
				estimated_hours: 2,
				project: "Mentorship",
			},
			tags: ["#personal"],
		},
		{
			title: "Tax filing — needs accountant input",
			stageCode: "BLK",
			fieldValues: {
				priority: "High",
				due_date: Date.now() + 14 * DAY_MS,
				estimated_hours: 3,
				project: "Admin",
			},
			tags: ["#waiting"],
		},
	],
	notes: [
		{
			content:
				"Idea: build a tiny CLI that surfaces today's overdue tasks as a daily morning email. Could ship in a weekend.",
			categoryName: "Idea",
		},
		{
			content:
				"Reference: prefer focused 90-min blocks for deep work; protect the 10am-12pm window from meetings.",
			categoryName: "Reference",
		},
		{
			content: "Anita's feedback: be ruthless about saying no to <2-hour tasks before lunch.",
			categoryName: "Reference",
			anchorTo: { kind: "contact", displayName: "Anita Rao (mentor)" },
		},
	],
	tasks: [
		{
			title: "Quarterly report due — start drafting",
			dueOffsetDays: 0,
			priority: "high",
			source: "manual",
			anchorTo: { kind: "deal", title: "Finish quarterly report" },
		},
		{
			title: "Inbox zero — clear by EOD",
			dueOffsetDays: 0,
			priority: "urgent",
			source: "manual",
			anchorTo: { kind: "deal", title: "Reply to client emails" },
		},
		{
			title: "Mentor catch-up with Anita",
			dueOffsetDays: 7,
			priority: "normal",
			source: "manual",
			anchorTo: { kind: "contact", displayName: "Anita Rao (mentor)" },
		},
	],
};
