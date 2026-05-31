# core/landing — MODULE.md

The public marketing landing page, served at the bare root `/`. Inspired by the
shadcnstore dashboard-landing template, rebuilt in this project's design language.

## Layout

```
core/landing/
├── views/LandingView.tsx        # composes all sections (server component)
├── components/                  # one file per section + utilities
│   ├── landing-navbar.tsx       # "use client" — anchor nav, theme toggle, mobile Sheet
│   ├── hero-section.tsx         # headline + propose/approve product mock (no images)
│   ├── logos-section.tsx        # built-with strip + stats
│   ├── features-section.tsx     # 6 feature tiles
│   ├── daily-routine-section.tsx# "your day" timeline
│   ├── comparison-section.tsx   # honest vs-competitor matrix
│   ├── services-section.tsx     # custom CRM / website / done-for-you offer
│   ├── pricing-section.tsx      # 4 plans
│   ├── faq-section.tsx          # Accordion
│   ├── contact-section.tsx      # "use client" — RHF + zod → POST /api/contact
│   ├── cta-section.tsx          # final banner
│   ├── landing-footer.tsx
│   ├── theme-toggle.tsx         # "use client" — self-contained dark mode
│   ├── dot-pattern.tsx          # decorative background
│   └── structured-data.tsx      # JSON-LD for SEO/AEO/GEO
└── lib/
    ├── content.ts               # ALL copy/data (single source of truth)
    ├── contact.ts               # server: submitContact (Resend best-effort)
    ├── contact-schema.ts        # client-safe zod schema + interests
    └── icons.ts                 # lucide name → component map
```

The thin route wrappers are `app/(root)/{layout,page}.tsx`, `app/api/contact/route.ts`,
`app/{robots,sitemap}.ts`, and `app/llms.txt/route.ts`.

## Decisions

| # | Decision | Outcome |
|---|----------|---------|
| 1 | Landing lives at the bare root `/` via the existing `app/(root)` route group — NOT `app/(marketing)/`. | `middleware.ts` returns `NextResponse.next()` for exact `/` so next-intl doesn't bounce it to `/en`. The page renders for everyone, including authed users (no Convex on the marketing route). |
| 2 | The `(root)` layout is a lean marketing root: shared `globals.css` + `ThemeBootScript` + `fontVars` + `Toaster` only. No Convex/i18n/PostHog. | Fast, static-friendly page; the design tokens (`--radius`, presets, `.dark`) match the app for brand consistency. |
| 3 | Dark mode uses a self-contained `theme-toggle` that writes the same `orbitly-pref-theme_mode` cookie `ThemeBootScript` reads. | Preference carries over to the app and survives refresh with no FOUC, without mounting the full preferences store. |
| 4 | All copy is data in `lib/content.ts`; icons referenced by name and resolved via `lib/icons.ts`. | Copy edits never touch JSX; sections stay declarative. |
| 5 | Contact schema is split into a client-safe `contact-schema.ts`; `contact.ts` keeps the server `submitContact` (dynamic `import("resend")`). | Importing the schema into the client form never pulls the Resend Node SDK into the browser bundle. |
| 6 | CTAs link to `/signin` + `/signup` (un-prefixed). | Middleware localises them and routes through the existing auth → onboarding → dashboard flow. |
| 7 | Every claim maps to a shipped feature (LANDING-PAGE.md honesty contract). No screenshots — the hero uses a built mock. | Honest marketing; no placeholder/stock imagery; nothing to keep in sync with the product visually. |

## Conventions

- RTL-safe logical classes only (`ms/me/ps/pe/start/end`, `text-start`).
- Border-radius via `rounded-[var(--radius)]`; `rounded-full` only for pills/dots.
- App name via `APP_CONFIG.name` (re-exported as `BRAND` from `content.ts`) — never hardcoded.

## Deferred

- Contact-endpoint rate-limit/CAPTCHA — `Future-Enhancements.md §B.36`.
- Multi-page expansion (`/pricing`, `/for-*`, `/vs/*`, blog, changelog) + domain split — `§B.37`.
- Real product screenshots + Free-Pro lifecycle emails — `LANDING-PAGE.md §8`.
