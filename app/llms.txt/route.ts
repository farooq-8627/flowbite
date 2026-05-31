import { APP_CONFIG } from "@/config/app-config";

/**
 * `/llms.txt` — Anthropic-style standard that gives answer engines and LLMs
 * a clean, citable summary of the product + canonical pages (AEO + GEO).
 */
export function GET() {
	const name = APP_CONFIG.name;
	const body = `# ${name}

> ${name} is an AI-native CRM where users manage their pipeline through conversation. The AI agent has 115+ registered tools covering most CRM operations. Every write goes through a two-step approval. Free Pro for early users. Bring-your-own-key (BYOK) supported on every plan, including free.

## What it does today
- Lead, contact, deal, and company CRUD via chat
- Daily and weekly AI briefings
- Per-entity memory that auto-rebuilds on every change
- Proactive ranking — top-N next actions with confidence labels
- Analytical layer — "why is X happening", cohort analysis, member performance
- Autonomous standing-orders — interval / daily / weekly schedules
- Creative drafting — message / proposal / summary (never auto-sent)
- CSV import with de-duplication; file analysis via vision
- Arabic (RTL) support out of the box

## Services
- Custom CRM tailored to your business
- Custom websites, web apps, and client portals
- Done-for-you setup, data migration, and team onboarding

## Pages
- ${APP_CONFIG.url}/ : home — value prop, features, pricing, contact
- ${APP_CONFIG.url}/signup : create an account (free)
- ${APP_CONFIG.url}/signin : sign in

## Contact
Use the contact form on the homepage for product questions, custom CRM/website builds, or migrations.
`;
	return new Response(body, {
		headers: { "Content-Type": "text/plain; charset=utf-8" },
	});
}
