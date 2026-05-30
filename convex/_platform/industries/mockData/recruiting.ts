/**
 * Mock data for the Recruiting / Staffing template.
 *
 * Pipeline: SRC → SCR → PHN → ONS → OFR → HIRED | REJ | WDN.
 *
 * Field coverage:
 *   - Lead (Candidate): all 11 fields populated on every seed —
 *     skills, years_experience, current_title, current_company,
 *     location, linkedin_url, resume_file (placeholder), salary_*,
 *     notice_period, work_authorization.
 *   - Contact (Hiring Manager): department, hiring_urgency.
 *   - Company (Client Company): headcount, open_roles_count,
 *     fee_structure.
 *   - Deal (Placement): role_title, role_level, comp_band_*,
 *     interview_feedback. OFR + HIRED add placement_fee, start_date,
 *     offer_amount. REJ + WDN add rejection_reason.
 *
 * Sensitive fields (resume_file, salary_expectation, current_salary,
 * comp_band_*, offer_amount) are still seeded so admins can preview
 * the privacy controls — they're hidden from non-admins at render time.
 */
import type { MockDataSeed } from "../../../crm/fields/templates/types";

const DAY_MS = 86_400_000;

export const recruitingMockData: MockDataSeed = {
	companies: [
		{
			key: "acme-corp",
			name: "Acme Corp",
			industry: "SaaS",
			website: "https://acme.example.com",
			fieldValues: {
				headcount: 340,
				open_roles_count: 8,
				fee_structure: "Contingency 20%",
			},
		},
		{
			key: "buildplex",
			name: "Buildplex",
			industry: "Construction Tech",
			website: "https://buildplex.example.com",
			fieldValues: {
				headcount: 95,
				open_roles_count: 3,
				fee_structure: "Contingency 15%",
			},
		},
		{
			key: "novatech",
			name: "NovaTech Labs",
			industry: "Fintech",
			website: "https://novatech.example.com",
			fieldValues: {
				headcount: 28,
				open_roles_count: 2,
				fee_structure: "Retained",
			},
		},
	],
	leads: [
		{
			displayName: "Priya Iyer",
			email: "priya.iyer@example.com",
			phone: "+91 98765 43210",
			status: "new",
			fieldValues: {
				skills: ["TypeScript", "React", "Node.js", "AWS"],
				years_experience: 6,
				current_title: "Senior Frontend Engineer",
				current_company: "TechStart India",
				location: "Bangalore, India (open to remote)",
				linkedin_url: "https://linkedin.com/in/priya-iyer-example",
				salary_expectation: 120000,
				current_salary: 95000,
				notice_period: "1 month",
				work_authorization: "Needs Sponsorship",
			},
			tags: ["Active job seeker", "Senior talent"],
		},
		{
			displayName: "Mateusz Nowak",
			email: "mateusz@example.com",
			phone: "+48 500 123 456",
			status: "contacted",
			fieldValues: {
				skills: ["Python", "Go", "DevOps", "AWS"],
				years_experience: 9,
				current_title: "Staff Engineer",
				current_company: "Allegro",
				location: "Warsaw, Poland (remote only)",
				linkedin_url: "https://linkedin.com/in/mateusz-nowak-example",
				salary_expectation: 160000,
				current_salary: 140000,
				notice_period: "3 months",
				work_authorization: "Work Visa",
			},
			tags: ["Passive candidate", "Senior talent"],
		},
		{
			displayName: "Hannah O'Reilly",
			email: "hannah.o@example.com",
			phone: "+1 415 555 0410",
			status: "new",
			fieldValues: {
				skills: ["Product", "Design", "JavaScript"],
				years_experience: 5,
				current_title: "Senior Product Manager",
				current_company: "Stitchwork (consulting)",
				location: "San Francisco, CA",
				linkedin_url: "https://linkedin.com/in/hannah-oreilly-example",
				salary_expectation: 145000,
				current_salary: 130000,
				notice_period: "Immediate",
				work_authorization: "Citizen",
			},
			tags: ["Referral", "Diversity hire"],
		},
		{
			displayName: "Diego Sanchez",
			email: "diego.dev@example.com",
			phone: "+34 91 555 0411",
			status: "contacted",
			fieldValues: {
				skills: ["Java", "Go", "AWS", "DevOps"],
				years_experience: 11,
				current_title: "Engineering Manager",
				current_company: "Cabify",
				location: "Madrid, Spain",
				linkedin_url: "https://linkedin.com/in/diego-sanchez-example",
				salary_expectation: 175000,
				current_salary: 150000,
				notice_period: "2 months",
				work_authorization: "Citizen",
			},
			tags: ["Boomerang"],
		},
		{
			displayName: "Sara Kowalski",
			email: "sara.k@example.com",
			phone: "+48 22 555 0412",
			status: "new",
			fieldValues: {
				skills: ["HR", "Marketing"],
				years_experience: 4,
				current_title: "Recruiter",
				current_company: "Allegro",
				location: "Warsaw, Poland",
				linkedin_url: "https://linkedin.com/in/sara-kowalski-example",
				salary_expectation: 65000,
				current_salary: 55000,
				notice_period: "1 month",
				work_authorization: "Citizen",
			},
			tags: ["Active job seeker"],
		},
	],
	contacts: [
		{
			displayName: "Renee Park",
			email: "renee.p@example.com",
			phone: "+1 408 555 0220",
			companyKey: "acme-corp",
			fieldValues: {
				department: "Engineering",
				hiring_urgency: "Backfill (urgent)",
			},
		},
		{
			displayName: "Diego Mendez (HM)",
			email: "diego.hm@example.com",
			phone: "+1 312 555 0330",
			companyKey: "buildplex",
			fieldValues: {
				department: "Product",
				hiring_urgency: "Growth (normal)",
			},
		},
		{
			displayName: "Aisha Patel",
			email: "aisha.p@novatech.example.com",
			phone: "+44 20 7946 0214",
			companyKey: "novatech",
			fieldValues: {
				department: "Founders' Office",
				hiring_urgency: "Future pipeline",
			},
		},
	],
	deals: [
		{
			title: "Senior FE Engineer — Acme Corp",
			stageCode: "ONS",
			value: 18000,
			contactDisplayName: "Renee Park",
			companyKey: "acme-corp",
			fieldValues: {
				role_title: "Senior Frontend Engineer",
				role_level: "Senior",
				comp_band_min: 130000,
				comp_band_max: 160000,
				interview_feedback:
					"Priya cleared phone screen with flying colors — schedule system design round.",
			},
			tags: ["Senior talent"],
		},
		{
			title: "Staff Backend Engineer — NovaTech",
			stageCode: "PHN",
			value: 25000,
			contactDisplayName: "Aisha Patel",
			companyKey: "novatech",
			fieldValues: {
				role_title: "Staff Backend Engineer",
				role_level: "Staff",
				comp_band_min: 160000,
				comp_band_max: 200000,
				interview_feedback: "Mateusz screen scheduled for next Tuesday.",
			},
			tags: ["Passive candidate"],
		},
		{
			title: "Senior PM — Buildplex",
			stageCode: "OFR",
			value: 22000,
			contactDisplayName: "Diego Mendez (HM)",
			companyKey: "buildplex",
			fieldValues: {
				role_title: "Senior Product Manager",
				role_level: "Senior",
				comp_band_min: 130000,
				comp_band_max: 150000,
				placement_fee: 22000,
				offer_amount: 138000,
				start_date: Date.now() + 30 * DAY_MS,
				interview_feedback:
					"Hannah outperformed all candidates in product sense. Verbal offer accepted.",
			},
			tags: ["Referral"],
		},
		{
			title: "Engineering Manager — Acme Corp (hired)",
			stageCode: "HIRED",
			value: 32000,
			contactDisplayName: "Renee Park",
			companyKey: "acme-corp",
			fieldValues: {
				role_title: "Engineering Manager",
				role_level: "Director",
				comp_band_min: 180000,
				comp_band_max: 210000,
				placement_fee: 32000,
				offer_amount: 195000,
				start_date: Date.now() + 14 * DAY_MS,
				interview_feedback:
					"Diego Sanchez cleared all rounds — bar-raiser called him 'one of the strongest EMs we've evaluated this year'.",
			},
			tags: ["Boomerang", "Senior talent"],
		},
		{
			title: "Sourced — sourcer pool — Acme",
			stageCode: "SRC",
			contactDisplayName: "Renee Park",
			companyKey: "acme-corp",
			fieldValues: {
				role_title: "Internal Recruiter",
				role_level: "Mid",
				comp_band_min: 70000,
				comp_band_max: 90000,
				interview_feedback: "Sara K. flagged for cold-outreach campaign next week.",
			},
		},
		{
			title: "Screening — sourcer pool — Acme",
			stageCode: "SCR",
			contactDisplayName: "Renee Park",
			companyKey: "acme-corp",
			fieldValues: {
				role_title: "Internal Recruiter",
				role_level: "Mid",
				comp_band_min: 70000,
				comp_band_max: 90000,
				interview_feedback: "Initial screen booked for Thursday — 30 min intro call.",
			},
		},
		{
			title: "Senior Backend — Acme (rejected)",
			stageCode: "REJ",
			contactDisplayName: "Renee Park",
			companyKey: "acme-corp",
			fieldValues: {
				role_title: "Senior Backend Engineer",
				role_level: "Senior",
				comp_band_min: 140000,
				comp_band_max: 170000,
				interview_feedback: "Strong technical, but missing key system-design depth.",
				rejection_reason: "Technical skills",
			},
		},
		{
			title: "PM — NovaTech (withdrew)",
			stageCode: "WDN",
			contactDisplayName: "Aisha Patel",
			companyKey: "novatech",
			fieldValues: {
				role_title: "Senior Product Manager",
				role_level: "Senior",
				comp_band_min: 130000,
				comp_band_max: 150000,
				interview_feedback:
					"Candidate accepted competing offer mid-process — flag for re-engage in 6 months.",
				rejection_reason: "Candidate withdrew",
			},
		},
	],
	notes: [
		{
			content:
				"Priya: cleared 45-min phone screen — strong React/TS, great system design instincts. Schedule onsite with Renee's team next week.",
			categoryName: "Interview Prep",
			anchorTo: { kind: "deal", title: "Senior FE Engineer — Acme Corp" },
		},
		{
			content:
				"Hannah — verbal offer extended at $138K. She's comparing with one other offer (startup). Decision by Friday.",
			categoryName: "Today",
			anchorTo: { kind: "deal", title: "Senior PM — Buildplex" },
		},
		{
			content:
				"Mateusz: passive candidate. 3-month notice + needs visa. Flag to Aisha for Q3 pipeline — strong AWS/platform background.",
			categoryName: "Reference",
			anchorTo: { kind: "lead", displayName: "Mateusz Nowak" },
		},
		{
			content:
				"Diego Sanchez (boomerang) hired as EM at Acme — celebrate placement and request referrals.",
			categoryName: "Done",
			anchorTo: { kind: "deal", title: "Engineering Manager — Acme Corp (hired)" },
		},
		{
			content:
				"Sara K. screen call moved to Thursday — confirm logistics + send role primer.",
			categoryName: "Today",
			anchorTo: { kind: "deal", title: "Screening — sourcer pool — Acme" },
		},
	],
	tasks: [
		{
			title: "Schedule Priya onsite — Acme Corp",
			dueOffsetDays: 1,
			priority: "high",
			source: "manual",
			anchorTo: { kind: "deal", title: "Senior FE Engineer — Acme Corp" },
		},
		{
			title: "Hannah — confirm verbal offer by EOD",
			dueOffsetDays: 0,
			priority: "urgent",
			source: "followup",
			anchorTo: { kind: "deal", title: "Senior PM — Buildplex" },
		},
		{
			title: "Nurture Mateusz — check in Q3",
			dueOffsetDays: 30,
			priority: "normal",
			source: "manual",
			anchorTo: { kind: "lead", displayName: "Mateusz Nowak" },
		},
		{
			title: "Diego Sanchez — send signed offer kit",
			dueOffsetDays: 2,
			priority: "high",
			source: "followup",
			anchorTo: { kind: "deal", title: "Engineering Manager — Acme Corp (hired)" },
		},
		{
			title: "Sara K. — Thursday screen call",
			dueOffsetDays: 3,
			priority: "high",
			source: "manual",
			anchorTo: { kind: "deal", title: "Screening — sourcer pool — Acme" },
		},
	],
};
