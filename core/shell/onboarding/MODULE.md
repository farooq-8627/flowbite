# core/onboarding — MODULE.md

> Scan this file before writing any onboarding code. All decisions are final unless explicitly revised.

## Structure

```
core/onboarding/
  MODULE.md                        ← this file
  components/
    OnboardingPage.tsx             ← single-page 3-step wizard (all steps in one component)
  layouts/
    OnboardingLayout.tsx           ← wraps AuthShellLayout + step progress dots (legacy, not used by OnboardingPage)
  steps/
    steps-config.ts                ← ONBOARDING_STEPS array (legacy, not used by OnboardingPage)
    OrgNameStep.tsx                ← legacy step component (superseded by OnboardingPage)
    IndustryStep.tsx               ← legacy step component (superseded by OnboardingPage)
    CompleteStep.tsx               ← legacy step component (superseded by OnboardingPage)
```

## Decisions (from deep-plan.md Module 6 + session decisions)

| # | Decision | Outcome |
|---|---|---|
| O1 | Single route | All 3 steps live at `/onboarding` — no sub-routes (`/onboarding/org-name` etc.). State managed via `useState` in `OnboardingPage`. |
| O2 | Step navigation | Back and forth freely. Back button on steps 2 and 3. No data loss on back — orgId persisted in component state. |
| O3 | Resume mid-onboarding | `onboardingStep` field on org (0=created, 1=industry-set, 2=complete). Future: resume from last step. |
| O4 | Post-onboarding landing | Dashboard with AI banner: "💡 Let AI customize your workspace → Start". |
| O5 | Onboarding speed | < 2 minutes. No field setup, no advanced config. Dashboard first. AI Workspace Setup handles the rest. |
| O6 | Org creation | `createOrg` mutation. Slug validated live (useQuery checkSlug). If taken → show error, suggest `slug-2`. |
| O7 | Slug uniqueness | GitHub-style: `acme-corp` → `acme-corp-2` → `acme-corp-3`. `ensureUniqueSlug()` in helpers.ts. |
| O8 | platformOrgId | Generated from `PLATFORM_PREFIX` env var (never hardcoded). Format: `ORB-XXXXX` where XXXXX = last 5 chars of Convex ID. |
| O9 | Industry step | Grid of industry cards. Selecting seeds DEFAULT pipeline for that industry (pipeline seeding pending). |
| O10 | No field templates at onboarding | Keep it fast. Field setup happens via AI Workspace Setup after dashboard loads. |
| O11 | Right panel changes per step | Each step passes its own `panel` props to `AuthShellLayout`. Step 1=workspace icon, Step 2=briefcase, Step 3=rocket. |
| O12 | Border-radius | All `rounded-*` use `rounded-[var(--radius)]`. Never hardcode. |
| O13 | RTL-safe classes | `start-0`, `border-e`, `text-start` etc. No `left-*`, `right-*`, `border-l`, `border-r`. |
| O14 | No hardcoded app strings | `APP_CONFIG.name`, `APP_CONFIG.description`, `APP_CONFIG.url` everywhere. |

## Onboarding Steps

```
Step 1 — Create Organization
  - Org name (required)
  - Org slug (auto-generated from name, editable, live uniqueness check)
  - Mutation: createOrg → returns { orgId, slug, platformOrgId }

Step 2 — Select Industry
  - Grid of industry cards (10 options)
  - Team size pills (5 options)
  - Mutation: updateOrgIndustry → sets org.industry, org.teamSize, org.onboardingStep=1

Step 3 — Complete
  - Summary checklist (3 items)
  - Mutation: markOnboardingComplete → sets users.onboardingCompleted=true, org.onboardingStep=2
  - Redirect: /dashboard/[slug] (real slug from mutation return value)
```

## Convex Mutations

| Mutation | Args | Returns | Notes |
|---|---|---|---|
| `orgs.mutations.createOrg` | `{ name, slug }` | `{ orgId, slug, platformOrgId }` | Throws if slug taken |
| `orgs.mutations.updateOrgIndustry` | `{ orgId, industry, teamSize }` | void | Requires org membership |
| `orgs.mutations.markOnboardingComplete` | `{ orgId }` | `{ slug }` | Sets user.onboardingCompleted=true |
| `orgs.mutations.suggestSlug` | `{ name }` | `{ slug }` | Returns first available slug |

## Convex Queries

| Query | Args | Returns | Notes |
|---|---|---|---|
| `orgs.queries.checkSlug` | `{ slug }` | `{ available: boolean }` | Used for live validation |

## Routing

| Route | Component | Notes |
|---|---|---|
| `/onboarding` | `app/[locale]/onboarding/page.tsx` → `OnboardingPage` | Single thin wrapper |
| Post-completion redirect | `/${slug}/dashboard` | Real slug from markOnboardingComplete return value |

## What's Pending

- [ ] Seed default pipeline on industry selection (pipeline seeding mutations)
- [ ] Resume from last step (read `org.onboardingStep` on mount)
- [ ] Onboarding guard: redirect users with `onboardingCompleted=true` away from `/onboarding` (currently no guard — they'd just re-onboard)
- [ ] Join-org flow (UI ready, mutation pending)

---

## Product Tour (Post-Onboarding) — Using Onborda

> **Decision O15**: Use [onborda](https://github.com/uixmat/onborda) for the in-app product tour that runs AFTER the user completes onboarding and lands on the dashboard for the first time.

### What is Onborda?

Onborda is a Next.js-native product tour library built on top of Framer Motion. It uses CSS selectors to highlight elements and shows step-by-step tooltips.

- **GitHub**: https://github.com/uixmat/onborda
- **Live Demo**: https://www.onborda.dev/
- **npm**: `onborda` (install with `pnpm add onborda`)

### Why Onborda (not Shepherd.js, Intro.js, etc.)

| Criteria | Onborda | Others |
|---|---|---|
| Next.js native | ✅ Built for Next.js App Router | ❌ DOM-based, SSR issues |
| Framer Motion | ✅ Smooth animations | ❌ CSS-only or jQuery |
| TypeScript | ✅ Full types | ⚠️ Partial |
| Customizable | ✅ Custom card component | ⚠️ Limited |
| Bundle size | ✅ Small | ❌ Shepherd.js is large |

### Integration Plan (When Building)

```tsx
// 1. Install
pnpm add onborda

// 2. Wrap layout with OnbordaProvider
import { OnbordaProvider, Onborda } from "onborda";

// 3. Define tour steps
const steps = [
  {
    icon: "👋",
    title: "Welcome to your workspace",
    content: "This is your dashboard. Let's take a quick tour.",
    selector: "#sidebar-nav",
    side: "right",
    showControls: true,
  },
  {
    icon: "🔍",
    title: "Search anything",
    content: "Press ⌘J to search across all your records.",
    selector: "#topnav-search",
    side: "bottom",
  },
  {
    icon: "🤖",
    title: "AI Assistant",
    content: "Press ⌘. to open the AI panel. Ask it anything.",
    selector: "#ai-toggle",
    side: "left",
  },
  // ... more steps
];

// 4. Trigger tour on first dashboard visit
// Check users.dismissedCards includes "product_tour" — if not, start tour
// After completion: call users.mutations.dismissCard("product_tour")
```

### Tour Steps Planned

| Step | Target Element | Content |
|---|---|---|
| 1 | Sidebar workspace switcher | "Switch between workspaces here" |
| 2 | Sidebar nav | "Your CRM modules live here" |
| 3 | TopNav search (⌘J) | "Search across all records" |
| 4 | AI toggle (⌘.) | "Your AI assistant is always here" |
| 5 | NavUser dropdown | "Access settings and billing" |
| 6 | Dashboard main area | "This is your home base" |

### State Tracking

- Tour completion stored in `users.dismissedCards[]` (already in schema)
- Key: `"product_tour_v1"` (versioned so we can re-trigger on major UI changes)
- Check on dashboard mount: if `!user.dismissedCards?.includes("product_tour_v1")` → start tour
- On tour complete/skip: call `api.users.mutations.dismissCard({ card: "product_tour_v1" })`

### Files to Create (When Building)

```
core/onboarding/
  tour/
    tour-steps.ts          ← step definitions array
    TourCard.tsx           ← custom card component (matches our design system)
    useTourTrigger.ts      ← hook: checks dismissedCards, triggers tour on first visit
```

### Important Notes

- Tour runs AFTER onboarding wizard (not during)
- Tour is skippable — never block the user
- Tour re-runs if `product_tour_v1` is not in `dismissedCards`
- Custom `TourCard` component must use our design tokens (rounded-[var(--radius)], theme colors)
- RTL support: Onborda supports `dir="rtl"` — test with Arabic locale

---

## Onboarding Email Sequence (P2)

After signup, send a drip email sequence teaching features. Reduces churn by keeping users engaged during the "aha moment" window.

**Implementation**: Trigger.dev scheduled jobs. Emails sent via Resend (already in tech stack).

```typescript
// Trigger.dev job: triggered after org creation
export const onboardingEmailSequence = task({
  id: "onboarding-email-sequence",
  run: async ({ userId, orgId, email, name }) => {
    // Day 0: Welcome + "Add your first lead" CTA
    await sendEmail({ to: email, template: "welcome", data: { name } });

    // Day 1: "Did you know? AI can set up your workspace in 2 minutes"
    await wait.for({ days: 1 });
    await sendEmail({ to: email, template: "ai-setup-tip", data: { name } });

    // Day 3: "Your team is waiting — invite them"
    await wait.for({ days: 2 });
    await sendEmail({ to: email, template: "invite-team", data: { name, orgId } });

    // Day 7: "Here's what top teams do in week 1"
    await wait.for({ days: 4 });
    await sendEmail({ to: email, template: "week-one-tips", data: { name } });
  },
});
```

**Trigger point**: `convex/orgs/mutations.ts` → `create` handler → `ctx.scheduler.runAfter(0, internal.jobs.startOnboardingSequence, { userId, orgId })`

**Unsubscribe**: Respect `users.notificationPreferences.onboarding_emails` toggle.


## 2026-05-21 — Industry list pruned + Dubai vs general real-estate split

| # | Decision | Outcome |
|---|---|---|
| 1 | Onboarding industry picker now lists only the seven industries that have a curated `IndustryTemplate` in the registry: `dubai-real-estate`, `real-estate`, `b2b-saas`, `agency-freelance`, `recruiting`, `freelancer`, `other` (alias → `generic`). The previous filler entries (technology, finance, retail, healthcare, construction, hospitality) are gone. | The picker no longer shows industries that don't have curated workflows. Anyone wanting one of the dropped industries can pick `Other` (uses `generic`) and customise from Settings. |
| 2 | Split the legacy `real-estate` template into two: `dubai-real-estate` (the original Gulf-specific workflow with RERA, Form F, Ejari, Emirates ID, 90-day rent renewal) and `real-estate` (general property workflow — no region-specific compliance fields, currency / timezone left to user choice). | Brokers outside the UAE can now pick `Real Estate` without inheriting Gulf-only fields and the rent-renewal alert. Brokers in Dubai pick `Real Estate (Dubai / Gulf)` and get the full RERA + Ejari machinery. |
| 3 | Existing orgs with `industry: "real-estate"` were onboarded into the Gulf workflow — their fieldDefinitions table already holds RERA / Ejari rows. Migration `convex/_migrations/renameRealEstateToDubai.ts` renames them to `industry: "dubai-real-estate"` so the rent-renewal toggle in Settings → Reminders, the AI persona overlay, and any future industry-aware code paths all keep matching the workflow they were set up with. Idempotent; ran on dev — 2 orgs renamed. | No data loss; the AI persona, reminders' "Rent Renewal Alert" toggle, and the curated saved-views all continue to work for these orgs. |
