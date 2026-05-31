/**
 * Landing-page content — single source of truth for all marketing copy.
 *
 * Every claim here maps to a shipped feature (see LANDING-PAGE.md §0/§5,
 * the "honesty contract"). The app name is never hardcoded — it reads from
 * `APP_CONFIG.name` so white-label deployments stay consistent.
 *
 * Icons are referenced by name and resolved in the components via a small
 * lucide map, so this stays a plain serialisable data module.
 */
import { APP_CONFIG } from "@/config/app-config";

export const BRAND = APP_CONFIG.name;

export const NAV_LINKS = [
	{ label: "Features", href: "#features" },
	{ label: "How it works", href: "#routine" },
	{ label: "Compare", href: "#compare" },
	{ label: "Services", href: "#services" },
	{ label: "Pricing", href: "#pricing" },
	{ label: "FAQ", href: "#faq" },
	{ label: "Contact", href: "#contact" },
] as const;

export const HERO = {
	badge: "Free Pro for early users — no credit card",
	titleLead: "Talk to your",
	titleAccent: "CRM",
	subtitle:
		"The AI-native CRM that drafts your follow-ups, manages your pipeline, and tells you what to do next — all through conversation. The AI proposes, you approve, the work is done in seconds.",
	example:
		'"Add Sara Khan as a lead, schedule a follow-up next Tuesday, and note the pricing concern."',
	primaryCta: { label: "Start free", href: "/signup" },
	secondaryCta: { label: "See how it works", href: "#routine" },
	trust: ["No credit card required", "BYOK on every plan", "Arabic & RTL ready"],
} as const;

/** Trust strip — what the platform is built on (anchors GEO credibility). */
export const BUILT_WITH = [
	"Convex",
	"Vercel AI SDK",
	"Next.js",
	"Anthropic",
	"OpenRouter",
	"Resend",
] as const;

export const STATS = [
	{ value: "115+", label: "AI tools shipped" },
	{ value: "~95%", label: "of CRM actions by chat" },
	{ value: "2-step", label: "approval on every write" },
	{ value: "15 min", label: "to a working workspace" },
] as const;

/** Six feature tiles — all shipped today. */
export const FEATURES = [
	{
		icon: "MessageSquare",
		title: "Conversational",
		description:
			"Type what you want in plain language. The AI understands your pipeline, fields, and history — then turns a sentence into the right actions.",
	},
	{
		icon: "Sparkles",
		title: "Proactive",
		description:
			"A daily briefing and a Top-3 ranked next-actions ribbon surface stale leads, slipped deals, and overdue follow-ups before you ask.",
	},
	{
		icon: "ShieldCheck",
		title: "Safe by default",
		description:
			"Every write goes through a two-step approval. The AI proposes; you confirm. Bulk, settings, and member changes always ask.",
	},
	{
		icon: "KeyRound",
		title: "Bring your own key",
		description:
			"Use your own AI provider key on any plan — including Free. No lock-in, predictable cost, and the models you trust.",
	},
	{
		icon: "Workflow",
		title: "Autonomous playbooks",
		description:
			"Standing orders run on a schedule — daily, weekly, or on an interval — and auto-follow-up when a deal changes stage.",
	},
	{
		icon: "BarChart3",
		title: "Analytical",
		description:
			'Ask "why is this happening?" Get cohort analysis, member performance, and pipeline velocity with structured, explainable answers.',
	},
] as const;

/** The daily-routine walkthrough — the most important narrative section. */
export const ROUTINE = [
	{
		time: "8:00 AM",
		title: "Wake up to a briefing",
		body: "3 stale leads, 2 deals slipped to next month, 4 follow-ups due today. Your morning briefing is ready before you open your laptop.",
	},
	{
		time: "9:00 AM",
		title: "See your next move",
		body: "The Pulse Ribbon ranks the top 3 things to do, each with a confidence label. Tap one — it pre-fills the chat composer.",
	},
	{
		time: "10:30 AM",
		title: "Log a call in one sentence",
		body: '"Schedule a follow-up with Sara next Tuesday at 3pm and add a note about pricing." The AI shows a preview card with both actions. You approve.',
	},
	{
		time: "12:30 PM",
		title: "Get nudged at the right time",
		body: '"Acme has been in Negotiation for 6 days — longer than your average. Want me to draft your standard pricing follow-up?" Tap yes, tweak, send.',
	},
	{
		time: "5:00 PM",
		title: "Plan tomorrow",
		body: '"What should I do first tomorrow?" A ranked next-actions list, ready for the morning. You close the laptop knowing nothing slipped.',
	},
] as const;

/** Honest comparison matrix (GEO play — verify cells before publishing). */
export const COMPARE = {
	columns: [BRAND, "Salesforce", "HubSpot", "Pipedrive"],
	rows: [
		{ label: "Conversational by default", values: ["Native", "Add-on", "Add-on", "No"] },
		{ label: "AI tools shipped", values: ["115+", "~50", "~30", "~10"] },
		{ label: "Free tier", values: ["Yes (Pro)", "No", "Limited", "No"] },
		{ label: "Bring your own AI key", values: ["Yes", "No", "No", "No"] },
		{ label: "Two-step write approval", values: ["Yes", "No", "No", "No"] },
		{ label: "Per-entity AI memory", values: ["Yes", "No", "No", "No"] },
		{ label: "Arabic / RTL out of the box", values: ["Yes", "Partial", "Partial", "Partial"] },
		{ label: "Time to first value", values: ["15 min", "Days", "Hours", "Hours"] },
	],
} as const;

/** Services offer — custom CRM / website / done-for-you work. */
export const SERVICES = {
	badge: "Work with us",
	title: "Need it built around your business?",
	subtitle:
		"Beyond the product, we design and build custom CRMs, websites, and automations tailored to how your team actually works. You get the AI-native foundation — shaped to your industry.",
	cards: [
		{
			icon: "Boxes",
			title: "Custom CRM, your way",
			body: "Your pipelines, entities, fields, roles, and automations — modelled to your workflow, with the AI assistant wired into all of it.",
			points: [
				"Tailored data model & pipelines",
				"Industry templates (real estate, services, agencies)",
				"Data migration from your current CRM",
			],
		},
		{
			icon: "Globe",
			title: "Custom website & web app",
			body: "A fast, on-brand marketing site or customer portal — built on the same modern stack as this page, connected to your CRM.",
			points: [
				"Marketing sites & landing pages",
				"Client portals & dashboards",
				"SEO / AEO / GEO from day one",
			],
		},
		{
			icon: "Rocket",
			title: "Done-for-you setup",
			body: "We configure your workspace, import your data, set up your AI playbooks, and train your team — so you start selling, not configuring.",
			points: [
				"Workspace & playbook setup",
				"AI standing-orders configured",
				"Team onboarding & support",
			],
		},
	],
	cta: { label: "Tell us what you need", href: "#contact" },
} as const;

export const FAQS = [
	{
		q: `What is ${BRAND}?`,
		a: `${BRAND} is an AI-native CRM where you manage leads, contacts, deals, and follow-ups through conversation. The AI has 115+ tools covering most CRM actions; every write is confirmed by you through a two-step approval.`,
	},
	{
		q: "How is this different from Salesforce or HubSpot?",
		a: "Traditional CRMs were built for forms and clicks. We're chat-first: you describe what you want and approve a preview. We also support bring-your-own AI key, per-entity memory, and a proactive ranker — none of which ship by default elsewhere.",
	},
	{
		q: "Is the AI safe? What if it makes a mistake?",
		a: "Every action that changes data is proposed first and only runs after you approve it. Deletes preview their cascade impact, and bulk, settings, and member changes always require confirmation — even if you opt others out.",
	},
	{
		q: "Can I bring my own AI key (BYOK)?",
		a: "Yes — on every plan, including Free. Use the provider and models you trust, with predictable cost and no lock-in.",
	},
	{
		q: "What happens after the 90-day free Pro?",
		a: "Your workspace reverts to Free (BYOK) unless you upgrade. Your data stays exactly where it is — nothing is deleted.",
	},
	{
		q: "Can I import from another CRM?",
		a: "Yes. Import a CSV from any CRM with de-duplication at parse time. For larger migrations, our team can do it for you as a service.",
	},
	{
		q: "Do you support Arabic and right-to-left layouts?",
		a: "Yes — the product runs in Arabic (RTL) out of the box, and so do the workspaces we build for you.",
	},
	{
		q: "Can you build a custom CRM or website for my business?",
		a: "Absolutely — that's our services offer. We design and build custom CRMs, websites, client portals, and AI playbooks tailored to your industry. Tell us what you need in the contact form below.",
	},
] as const;

export const FOOTER = {
	tagline: "The AI-native CRM. The AI proposes, you approve, the work is done.",
	columns: [
		{
			title: "Product",
			links: [
				{ label: "Features", href: "#features" },
				{ label: "How it works", href: "#routine" },
				{ label: "Pricing", href: "#pricing" },
				{ label: "Compare", href: "#compare" },
			],
		},
		{
			title: "Services",
			links: [
				{ label: "Custom CRM", href: "#services" },
				{ label: "Custom website", href: "#services" },
				{ label: "Done-for-you setup", href: "#services" },
				{ label: "Contact", href: "#contact" },
			],
		},
		{
			title: "Get started",
			links: [
				{ label: "Sign up", href: "/signup" },
				{ label: "Sign in", href: "/signin" },
				{ label: "FAQ", href: "#faq" },
				{ label: "llms.txt", href: "/llms.txt" },
			],
		},
	],
} as const;
