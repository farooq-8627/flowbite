# Orbitly Dashboard Architecture & Detailed Template Mapping

This document provides a complete graph of the folder structures for all templates, detailing what each folder and file does. This will serve as a comprehensive reference to map and copy features properly.

## NEXT-SHADCN-ADMIN-DASHBOARD

```text
├── 📄 .gitignore - File.
├── 📁 .husky - Directory.
│   └── 📄 pre-commit - File.
├── 📄 CONTRIBUTING.md - Markdown documentation or content.
├── 📄 LICENSE - File.
├── 📄 README.md - Markdown documentation or content.
├── 📄 biome.json - JSON configuration or data file.
├── 📄 components.json - Shadcn UI configuration.
├── 📁 media - Directory.
│   └── 📄 dashboard.png - File.
├── 📄 next.config.mjs - Configuration file.
├── 📄 package-lock.json - JSON configuration or data file.
├── 📄 package.json - NPM dependencies and scripts.
├── 📄 postcss.config.mjs - Configuration file.
├── 📁 src - Directory.
│   ├── 📁 app - Next.js App Router root directory.
│   │   ├── 📁 (external) - Directory.
│   │   │   └── 📄 page.tsx - Main page UI component.
│   │   ├── 📁 (main) - Directory.
│   │   │   ├── 📁 auth - Authentication feature module.
│   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   ├── 📄 login-form.tsx - Reusable UI component.
│   │   │   │   │   ├── 📄 register-form.tsx - Reusable UI component.
│   │   │   │   │   └── 📁 social-auth - Directory.
│   │   │   │   │       └── 📄 google-button.tsx - Reusable UI component.
│   │   │   │   ├── 📁 v1 - Directory.
│   │   │   │   │   ├── 📁 login - Directory.
│   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   └── 📁 register - Directory.
│   │   │   │   │       └── 📄 page.tsx - Main page UI component.
│   │   │   │   └── 📁 v2 - Directory.
│   │   │   │       ├── 📄 layout.tsx - Layout wrapper for this route.
│   │   │   │       ├── 📁 login - Directory.
│   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │       └── 📁 register - Directory.
│   │   │   │           └── 📄 page.tsx - Main page UI component.
│   │   │   ├── 📁 dashboard - Dashboard feature module.
│   │   │   │   ├── 📁 (legacy) - Directory.
│   │   │   │   │   ├── 📁 crm-v1 - Directory.
│   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   ├── 📄 crm.config.ts - Reusable UI component.
│   │   │   │   │   │   │   ├── 📄 insight-cards.tsx - Reusable UI component.
│   │   │   │   │   │   │   ├── 📄 operational-cards.tsx - Reusable UI component.
│   │   │   │   │   │   │   ├── 📄 overview-cards.tsx - Reusable UI component.
│   │   │   │   │   │   │   └── 📁 recent-leads-table - Directory.
│   │   │   │   │   │   │       ├── 📄 columns.tsx - Reusable UI component.
│   │   │   │   │   │   │       ├── 📄 schema.ts - Reusable UI component.
│   │   │   │   │   │   │       └── 📄 table.tsx - Reusable UI component.
│   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   └── 📁 default-v1 - Directory.
│   │   │   │   │       ├── 📁 _components - Directory.
│   │   │   │   │       │   ├── 📄 chart-area-interactive.tsx - Reusable UI component.
│   │   │   │   │       │   ├── 📄 data.json - Mock JSON data.
│   │   │   │   │       │   ├── 📁 proposal-sections-table - Directory.
│   │   │   │   │       │   │   ├── 📄 columns.tsx - Reusable UI component.
│   │   │   │   │       │   │   ├── 📄 schema.ts - Reusable UI component.
│   │   │   │   │       │   │   └── 📄 table.tsx - Reusable UI component.
│   │   │   │   │       │   └── 📄 section-cards.tsx - Reusable UI component.
│   │   │   │   │       └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📁 [...not-found] - Directory.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   └── 📁 sidebar - Directory.
│   │   │   │   │       ├── 📄 account-switcher.tsx - Reusable UI component.
│   │   │   │   │       ├── 📄 app-sidebar.tsx - Reusable UI component.
│   │   │   │   │       ├── 📄 layout-controls.tsx - Layout wrapper for this route.
│   │   │   │   │       ├── 📄 nav-documents.tsx - Reusable UI component.
│   │   │   │   │       ├── 📄 nav-main.tsx - Reusable UI component.
│   │   │   │   │       ├── 📄 nav-secondary.tsx - Reusable UI component.
│   │   │   │   │       ├── 📄 nav-user.tsx - Reusable UI component.
│   │   │   │   │       ├── 📄 search-dialog.tsx - Reusable UI component.
│   │   │   │   │       ├── 📄 sidebar-support-card.tsx - Reusable UI component.
│   │   │   │   │       └── 📄 theme-switcher.tsx - Reusable UI component.
│   │   │   │   ├── 📁 analytics - Directory.
│   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   ├── 📄 analytics-actions-manager-queue.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 analytics-actions-risk-ledger.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 analytics-drivers-coverage-triage.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 analytics-drivers-forecast-target.tsx - Reusable UI component.
│   │   │   │   │   │   └── 📄 analytics-overview.tsx - Reusable UI component.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📁 coming-soon - Directory.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📁 crm - Directory.
│   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   ├── 📄 kpi-cards.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 opportunities-section.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📁 opportunities-table - Directory.
│   │   │   │   │   │   │   ├── 📄 columns.tsx - Reusable UI component.
│   │   │   │   │   │   │   ├── 📄 data.json - Mock JSON data.
│   │   │   │   │   │   │   └── 📄 schema.ts - Reusable UI component.
│   │   │   │   │   │   ├── 📄 pipeline-activity.tsx - Reusable UI component.
│   │   │   │   │   │   └── 📄 task-reminders.tsx - Reusable UI component.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📁 default - Directory.
│   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   ├── 📄 data.json - Mock JSON data.
│   │   │   │   │   │   ├── 📄 metric-cards.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 performance-overview.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📁 recent-customers-table - Directory.
│   │   │   │   │   │   │   ├── 📄 columns.tsx - Reusable UI component.
│   │   │   │   │   │   │   ├── 📄 schema.ts - Reusable UI component.
│   │   │   │   │   │   │   └── 📄 table.tsx - Reusable UI component.
│   │   │   │   │   │   └── 📄 subscriber-overview.tsx - Reusable UI component.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📁 finance - Directory.
│   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   ├── 📄 card-overview.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 cash-flow-overview.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 income-reliability.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📁 kpis - Directory.
│   │   │   │   │   │   │   ├── 📄 monthly-cash-flow.tsx - Reusable UI component.
│   │   │   │   │   │   │   ├── 📄 net-worth.tsx - Reusable UI component.
│   │   │   │   │   │   │   ├── 📄 primary-account.tsx - Reusable UI component.
│   │   │   │   │   │   │   └── 📄 savings-rate.tsx - Reusable UI component.
│   │   │   │   │   │   └── 📄 spending-breakdown.tsx - Reusable UI component.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📄 layout.tsx - Layout wrapper for this route.
│   │   │   │   ├── 📄 page.tsx - Main page UI component.
│   │   │   │   └── 📁 productivity - Directory.
│   │   │   │       ├── 📁 _components - Directory.
│   │   │   │       │   ├── 📄 calendar-panel.tsx - Reusable UI component.
│   │   │   │       │   ├── 📄 focus-card.tsx - Reusable UI component.
│   │   │   │       │   ├── 📄 projects-section.tsx - Reusable UI component.
│   │   │   │       │   ├── 📄 quick-actions.tsx - Reusable UI component.
│   │   │   │       │   ├── 📄 quote-card.tsx - Reusable UI component.
│   │   │   │       │   ├── 📄 recent-notes-card.tsx - Reusable UI component.
│   │   │   │       │   ├── 📄 summary-cards.tsx - Reusable UI component.
│   │   │   │       │   ├── 📄 tasks-section.tsx - Reusable UI component.
│   │   │   │       │   └── 📄 weekly-summary-card.tsx - Reusable UI component.
│   │   │   │       └── 📄 page.tsx - Main page UI component.
│   │   │   └── 📁 unauthorized - Directory.
│   │   │       └── 📄 page.tsx - Main page UI component.
│   │   ├── 📄 favicon.ico - File.
│   │   ├── 📄 globals.css - Styles / Tailwind directives.
│   │   ├── 📄 layout.tsx - Layout wrapper for this route.
│   │   └── 📄 not-found.tsx - TypeScript file.
│   ├── 📁 components - Reusable UI and feature components.
│   │   ├── 📄 date-range-picker.tsx - Reusable UI component.
│   │   ├── 📄 simple-icon.tsx - Reusable UI component.
│   │   └── 📁 ui - Base Shadcn UI components.
│   │       ├── 📄 accordion.tsx - Reusable UI component.
│   │       ├── 📄 alert-dialog.tsx - Reusable UI component.
│   │       ├── 📄 alert.tsx - Reusable UI component.
│   │       ├── 📄 aspect-ratio.tsx - Reusable UI component.
│   │       ├── 📄 avatar.tsx - Reusable UI component.
│   │       ├── 📄 badge.tsx - Reusable UI component.
│   │       ├── 📄 breadcrumb.tsx - Reusable UI component.
│   │       ├── 📄 button-group.tsx - Reusable UI component.
│   │       ├── 📄 button.tsx - Reusable UI component.
│   │       ├── 📄 calendar.tsx - Reusable UI component.
│   │       ├── 📄 card.tsx - Reusable UI component.
│   │       ├── 📄 carousel.tsx - Reusable UI component.
│   │       ├── 📄 chart.tsx - Reusable UI component.
│   │       ├── 📄 checkbox.tsx - Reusable UI component.
│   │       ├── 📄 collapsible.tsx - Reusable UI component.
│   │       ├── 📄 combobox.tsx - Reusable UI component.
│   │       ├── 📄 command.tsx - Reusable UI component.
│   │       ├── 📄 context-menu.tsx - Reusable UI component.
│   │       ├── 📄 dialog.tsx - Reusable UI component.
│   │       ├── 📄 direction.tsx - Reusable UI component.
│   │       ├── 📄 drawer.tsx - Reusable UI component.
│   │       ├── 📄 dropdown-menu.tsx - Reusable UI component.
│   │       ├── 📄 empty.tsx - Reusable UI component.
│   │       ├── 📄 field.tsx - Reusable UI component.
│   │       ├── 📄 hover-card.tsx - Reusable UI component.
│   │       ├── 📄 input-group.tsx - Reusable UI component.
│   │       ├── 📄 input-otp.tsx - Reusable UI component.
│   │       ├── 📄 input.tsx - Reusable UI component.
│   │       ├── 📄 item.tsx - Reusable UI component.
│   │       ├── 📄 kbd.tsx - Reusable UI component.
│   │       ├── 📄 label.tsx - Reusable UI component.
│   │       ├── 📄 menubar.tsx - Reusable UI component.
│   │       ├── 📄 native-select.tsx - Reusable UI component.
│   │       ├── 📄 navigation-menu.tsx - Reusable UI component.
│   │       ├── 📄 pagination.tsx - Reusable UI component.
│   │       ├── 📄 popover.tsx - Reusable UI component.
│   │       ├── 📄 progress.tsx - Reusable UI component.
│   │       ├── 📄 radio-group.tsx - Reusable UI component.
│   │       ├── 📄 resizable.tsx - Reusable UI component.
│   │       ├── 📄 scroll-area.tsx - Reusable UI component.
│   │       ├── 📄 select.tsx - Reusable UI component.
│   │       ├── 📄 separator.tsx - Reusable UI component.
│   │       ├── 📄 sheet.tsx - Reusable UI component.
│   │       ├── 📄 sidebar.tsx - Reusable UI component.
│   │       ├── 📄 skeleton.tsx - Reusable UI component.
│   │       ├── 📄 slider.tsx - Reusable UI component.
│   │       ├── 📄 sonner.tsx - Reusable UI component.
│   │       ├── 📄 spinner.tsx - Reusable UI component.
│   │       ├── 📄 switch.tsx - Reusable UI component.
│   │       ├── 📄 table.tsx - Reusable UI component.
│   │       ├── 📄 tabs.tsx - Reusable UI component.
│   │       ├── 📄 textarea.tsx - Reusable UI component.
│   │       ├── 📄 toggle-group.tsx - Reusable UI component.
│   │       ├── 📄 toggle.tsx - Reusable UI component.
│   │       └── 📄 tooltip.tsx - Reusable UI component.
│   ├── 📁 config - Directory.
│   │   └── 📄 app-config.ts - TypeScript file.
│   ├── 📁 data - Static or mock data.
│   │   └── 📄 users.ts - TypeScript file.
│   ├── 📁 hooks - React custom hooks.
│   │   └── 📄 use-mobile.ts - Custom React hook logic.
│   ├── 📁 lib - Utility functions and helpers.
│   │   ├── 📄 cookie.client.ts - Utility functions.
│   │   ├── 📁 fonts - Directory.
│   │   │   └── 📄 registry.ts - Utility functions.
│   │   ├── 📄 local-storage.client.ts - Utility functions.
│   │   ├── 📁 preferences - Directory.
│   │   │   ├── 📄 layout-utils.ts - Layout wrapper for this route.
│   │   │   ├── 📄 layout.ts - Layout wrapper for this route.
│   │   │   ├── 📄 preferences-config.ts - Utility functions.
│   │   │   ├── 📄 preferences-storage.ts - Utility functions.
│   │   │   ├── 📄 theme-utils.ts - Utility functions.
│   │   │   └── 📄 theme.ts - Utility functions.
│   │   └── 📄 utils.ts - Utility functions.
│   ├── 📁 navigation - Directory.
│   │   └── 📁 sidebar - Directory.
│   │       └── 📄 sidebar-items.ts - TypeScript file.
│   ├── 📄 proxy.disabled.ts - TypeScript file.
│   ├── 📁 scripts - Directory.
│   │   ├── 📄 generate-theme-presets.ts - TypeScript file.
│   │   └── 📄 theme-boot.tsx - TypeScript file.
│   ├── 📁 server - Directory.
│   │   └── 📄 server-actions.ts - TypeScript file.
│   ├── 📁 stores - Directory.
│   │   └── 📁 preferences - Directory.
│   │       ├── 📄 preferences-provider.tsx - TypeScript file.
│   │       └── 📄 preferences-store.ts - TypeScript file.
│   └── 📁 styles - Global stylesheets.
│       └── 📁 presets - Directory.
│           ├── 📄 brutalist.css - Styles / Tailwind directives.
│           ├── 📄 soft-pop.css - Styles / Tailwind directives.
│           └── 📄 tangerine.css - Styles / Tailwind directives.
├── 📄 tsconfig.json - JSON configuration or data file.
└── 📄 tsconfig.scripts.json - JSON configuration or data file.
```

### Summary of `next-shadcn-admin-dashboard`
- **Primary Use:** Reference for specific UI or layout aspects.
- **Integration Strategy:** Copy the relevant components (`.tsx`) into Orbitly's `core/` or `features/` folders, updating imports to match our colocation architecture. Re-wire mock JSON data to Convex queries.

---

## SHADBOARD

```text
├── 📁 .github - Directory.
│   ├── 📁 ISSUE_TEMPLATE - Directory.
│   │   ├── 📄 bug_report.yml - File.
│   │   ├── 📄 config.yml - File.
│   │   ├── 📄 documentation.yml - File.
│   │   ├── 📄 feature_request.yml - File.
│   │   ├── 📄 refactor_request.yml - File.
│   │   └── 📄 ui_feedback.yml - File.
│   └── 📁 workflows - Directory.
│       ├── 📄 code-check.yml - File.
│       ├── 📄 commitlint.yml - File.
│       └── 📄 release.yml - File.
├── 📄 .gitignore - File.
├── 📄 .npmrc - File.
├── 📁 .vscode - Directory.
│   ├── 📄 extensions.json - JSON configuration or data file.
│   └── 📄 settings.json - JSON configuration or data file.
├── 📄 CONTRIBUTING.md - Markdown documentation or content.
├── 📄 LICENSE - File.
├── 📄 README.md - Markdown documentation or content.
├── 📄 commitlint.config.js - Configuration file.
├── 📁 full-kit - Directory.
│   ├── 📄 .env.example - File.
│   ├── 📄 .gitignore - File.
│   ├── 📄 .npmrc - File.
│   ├── 📁 .vscode - Directory.
│   │   ├── 📄 extensions.json - JSON configuration or data file.
│   │   └── 📄 settings.json - JSON configuration or data file.
│   ├── 📄 README.md - Markdown documentation or content.
│   ├── 📄 components.json - Shadcn UI configuration.
│   ├── 📄 eslint.config.mjs - Configuration file.
│   ├── 📄 mdx.d.ts - TypeScript file.
│   ├── 📄 next.config.mjs - Configuration file.
│   ├── 📄 package.json - NPM dependencies and scripts.
│   ├── 📄 pnpm-lock.yaml - File.
│   ├── 📄 pnpm-workspace.yaml - File.
│   ├── 📄 postcss.config.mjs - Configuration file.
│   ├── 📄 prettier.config.mjs - Configuration file.
│   ├── 📁 prisma - Directory.
│   │   ├── 📄 dev.db - File.
│   │   ├── 📁 migrations - Directory.
│   │   │   ├── 📁 20241026151136_init - Directory.
│   │   │   │   └── 📄 migration.sql - File.
│   │   │   └── 📄 migration_lock.toml - File.
│   │   └── 📄 schema.prisma - File.
│   ├── 📁 src - Directory.
│   │   ├── 📁 app - Next.js App Router root directory.
│   │   │   ├── 📁 (unlocalized) - Directory.
│   │   │   │   ├── 📁 docs - Directory.
│   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   ├── 📄 docs-breadcrumb.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 docs-command-menu.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 docs-header.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 docs-mode-dropdown.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 docs-pagination.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 docs-sidebar.tsx - Reusable UI component.
│   │   │   │   │   │   └── 📄 docs-toc.tsx - Reusable UI component.
│   │   │   │   │   ├── 📁 _data - Directory.
│   │   │   │   │   │   └── 📄 sidebar-navigation.ts - TypeScript file.
│   │   │   │   │   ├── 📁 development - Directory.
│   │   │   │   │   │   ├── 📁 authentication - Directory.
│   │   │   │   │   │   │   └── 📄 page.mdx - Markdown documentation or content.
│   │   │   │   │   │   ├── 📁 i18n - Directory.
│   │   │   │   │   │   │   └── 📄 page.mdx - Markdown documentation or content.
│   │   │   │   │   │   ├── 📁 navigation - Directory.
│   │   │   │   │   │   │   └── 📄 page.mdx - Markdown documentation or content.
│   │   │   │   │   │   └── 📁 theme-color - Directory.
│   │   │   │   │   │       └── 📄 page.mdx - Markdown documentation or content.
│   │   │   │   │   ├── 📄 layout.tsx - Layout wrapper for this route.
│   │   │   │   │   ├── 📁 miscellaneous - Directory.
│   │   │   │   │   │   └── 📁 sources-and-credits - Directory.
│   │   │   │   │   │       ├── 📁 _components - Directory.
│   │   │   │   │   │       │   └── 📄 sources-and-credits-table.tsx - Reusable UI component.
│   │   │   │   │   │       ├── 📁 _data - Directory.
│   │   │   │   │   │       │   └── 📄 sources-and-credits.ts - TypeScript file.
│   │   │   │   │   │       └── 📄 page.mdx - Markdown documentation or content.
│   │   │   │   │   ├── 📁 overview - Directory.
│   │   │   │   │   │   ├── 📁 deployment - Directory.
│   │   │   │   │   │   │   └── 📄 page.mdx - Markdown documentation or content.
│   │   │   │   │   │   ├── 📁 installation - Directory.
│   │   │   │   │   │   │   └── 📄 page.mdx - Markdown documentation or content.
│   │   │   │   │   │   ├── 📁 introduction - Directory.
│   │   │   │   │   │   │   └── 📄 page.mdx - Markdown documentation or content.
│   │   │   │   │   │   └── 📁 kits - Directory.
│   │   │   │   │   │       └── 📄 page.mdx - Markdown documentation or content.
│   │   │   │   │   ├── 📄 page.tsx - Main page UI component.
│   │   │   │   │   └── 📄 types.ts - TypeScript file.
│   │   │   │   └── 📄 layout.tsx - Layout wrapper for this route.
│   │   │   ├── 📁 [lang] - Directory.
│   │   │   │   ├── 📁 (dashboard-layout) - Directory.
│   │   │   │   │   ├── 📁 (design-system) - Directory.
│   │   │   │   │   │   ├── 📁 cards - Directory.
│   │   │   │   │   │   │   ├── 📁 advanced - Directory.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 analytics - Directory.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 basic - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   ├── 📄 card-overlay.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 card-with-filled-image-horizontal.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 card-with-filled-image.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 card-with-image-horizontal.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 card-with-image.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   └── 📄 card-with-tabs.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   └── 📁 statistics - Directory.
│   │   │   │   │   │   │       └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   ├── 📁 charts - Directory.
│   │   │   │   │   │   │   ├── 📁 area-charts - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   └── 📄 area-charts.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 bar-charts - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   └── 📄 bar-charts.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 composed-charts - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   └── 📄 composed-charts.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 line-charts - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   └── 📄 line-charts.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 pie-charts - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   └── 📄 pie-charts.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 radar-charts - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   └── 📄 radar-charts.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 radial-bar-charts - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   └── 📄 radial-bar-charts.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 scatter-charts - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   └── 📄 scatter-charts.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   └── 📁 treemap-charts - Directory.
│   │   │   │   │   │   │       ├── 📁 _components - Directory.
│   │   │   │   │   │   │       │   └── 📄 treemap-charts.tsx - Reusable UI component.
│   │   │   │   │   │   │       └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   ├── 📁 colors - Directory.
│   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   ├── 📄 basic-colors.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 borders-and-rings.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 chart-colors.tsx - Reusable UI component.
│   │   │   │   │   │   │   ├── 📁 _data - Directory.
│   │   │   │   │   │   │   │   ├── 📄 basic-colors.ts - TypeScript file.
│   │   │   │   │   │   │   │   ├── 📄 borders-and-rings.ts - TypeScript file.
│   │   │   │   │   │   │   │   └── 📄 chart-colors.ts - TypeScript file.
│   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   ├── 📁 extended-ui - Directory.
│   │   │   │   │   │   │   ├── 📁 avatar-stack - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   ├── 📄 avatar-stack-limit.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 avatar-stack-size.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   └── 📄 basic-avatar-stack.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📁 _data - Directory.
│   │   │   │   │   │   │   │   │   └── 📄 avatars.ts - TypeScript file.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 bento-grid - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   └── 📄 basic-bento-grid.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 editor - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   ├── 📄 basic-editor.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 editor-bubble-menu.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   └── 📄 editor-placeholder.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 emoji-picker - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   ├── 📄 basic-emoji-picker.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   └── 📄 reaction-picker.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 file-dropzone - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   ├── 📄 basic-file-dropzone.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 file-dropzone-max-files.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 file-dropzone-max-size.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   └── 📄 file-dropzone-multiple.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 input-file - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   ├── 📄 basic-input-file.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 input-file-button-label.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 input-file-button-varaints.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   └── 📄 input-file-placeholder.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 input-group - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   ├── 📄 basic-input-group.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 input-group-checkbox-and-radio.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 input-group-dropdown-button.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   └── 📄 input-group-merged.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 input-phone - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   ├── 📄 basic-input-phone.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   └── 📄 input-phone-country.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 input-spin - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   ├── 📄 basic-input-spin.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 input-spin-button-variants.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 input-spin-disabled.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 input-spin-max.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 input-spin-min.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   └── 📄 input-spin-step.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 input-tags - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   ├── 📄 basic-input-tags.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 input-tags-placeholder.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   └── 📄 input-tags-with-suggestions.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📁 _data - Directory.
│   │   │   │   │   │   │   │   │   └── 📄 suggestions.ts - TypeScript file.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 keyboard - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   └── 📄 basic-keyboard.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 media-grid - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   ├── 📄 basic-media-grid.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 media-grid-limit.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 media-grid-one-item.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   └── 📄 media-grid-two-items.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 mockups - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   ├── 📄 iphone-15-pro-mockup.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   └── 📄 safari-mockup.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 rating - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   ├── 📄 basic-rating.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 rating-icon.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 rating-length.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 rating-read-only.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 rating-sizes.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   └── 📄 rating-variants.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 separator-with-text - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   └── 📄 basic-separator-with-text.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 show-more-text - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   ├── 📄 basic-show-more-text.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   └── 📄 show-more-text-max-length.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 sticky-layout - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   └── 📄 basic-sticky-layout.tsx - Layout wrapper for this route.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   └── 📁 timeline - Directory.
│   │   │   │   │   │   │       ├── 📁 _components - Directory.
│   │   │   │   │   │   │       │   ├── 📄 basic-timeline.tsx - Reusable UI component.
│   │   │   │   │   │   │       │   ├── 📄 timeline-alternating.tsx - Reusable UI component.
│   │   │   │   │   │   │       │   ├── 📄 timeline-left-align.tsx - Reusable UI component.
│   │   │   │   │   │   │       │   ├── 📄 timeline-right-align.tsx - Reusable UI component.
│   │   │   │   │   │   │       │   └── 📄 timeline-with-label.tsx - Reusable UI component.
│   │   │   │   │   │   │       └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   ├── 📁 forms - Directory.
│   │   │   │   │   │   │   ├── 📁 basic-inputs - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   └── 📄 basic-inputs.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 file-dropzones - Directory.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 form-layouts - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   └── 📁 form-layouts - Directory.
│   │   │   │   │   │   │   │   │       ├── 📄 horizontal-form-layout.tsx - Layout wrapper for this route.
│   │   │   │   │   │   │   │   │       ├── 📄 index.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │       └── 📄 vertical-form-layout.tsx - Layout wrapper for this route.
│   │   │   │   │   │   │   │   ├── 📁 _schemas - Directory.
│   │   │   │   │   │   │   │   │   └── 📄 form-layouts-schema.ts - Layout wrapper for this route.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 pickers - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   ├── 📄 date-picker-placeholder.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 date-picker.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 date-range-picker.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 date-time-picker.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 human-friendly-date-picker.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 multiple-dates-picker.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   └── 📄 time-picker.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   └── 📁 select-and-tags - Directory.
│   │   │   │   │   │   │       └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   ├── 📁 icons - Directory.
│   │   │   │   │   │   │   ├── 📁 lucide - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   └── 📄 lucide.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 react-icons - Directory.
│   │   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   │   └── 📄 react-icons.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   └── 📄 types.ts - TypeScript file.
│   │   │   │   │   │   ├── 📁 tables - Directory.
│   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   └── 📁 tables - Directory.
│   │   │   │   │   │   │   │       ├── 📄 basic-table.tsx - Reusable UI component.
│   │   │   │   │   │   │   │       ├── 📄 bordered-table.tsx - Reusable UI component.
│   │   │   │   │   │   │   │       ├── 📄 contextual-classes.tsx - Reusable UI component.
│   │   │   │   │   │   │   │       ├── 📁 data-table - Directory.
│   │   │   │   │   │   │   │       │   ├── 📄 columns.tsx - Reusable UI component.
│   │   │   │   │   │   │   │       │   ├── 📄 data-table-row-actions.tsx - Reusable UI component.
│   │   │   │   │   │   │   │       │   ├── 📄 data-table-toolbar.tsx - Reusable UI component.
│   │   │   │   │   │   │   │       │   ├── 📄 data-table-view-options.tsx - Reusable UI component.
│   │   │   │   │   │   │   │       │   └── 📄 index.tsx - Reusable UI component.
│   │   │   │   │   │   │   │       ├── 📄 index.tsx - Reusable UI component.
│   │   │   │   │   │   │   │       ├── 📄 table-with-caption.tsx - Reusable UI component.
│   │   │   │   │   │   │   │       └── 📄 table-with-footer.tsx - Reusable UI component.
│   │   │   │   │   │   │   ├── 📁 _data - Directory.
│   │   │   │   │   │   │   │   └── 📄 invoices.ts - TypeScript file.
│   │   │   │   │   │   │   ├── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   └── 📄 types.ts - TypeScript file.
│   │   │   │   │   │   ├── 📁 typography - Directory.
│   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   ├── 📄 font-families.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 text-styles.tsx - Reusable UI component.
│   │   │   │   │   │   │   ├── 📁 _data - Directory.
│   │   │   │   │   │   │   │   ├── 📄 font-families.ts - TypeScript file.
│   │   │   │   │   │   │   │   └── 📄 text-styles.ts - TypeScript file.
│   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   └── 📁 ui - Base Shadcn UI components.
│   │   │   │   │   │       ├── 📁 accordion - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   └── 📄 basic-accordion.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 alert - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   └── 📄 basic-alert.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 alert-dialog - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   └── 📄 basic-alert-dialog.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 aspect-ratio - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   └── 📄 basic-aspect-ratio.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 avatar - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   └── 📄 basic-avatar.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 badge - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   └── 📄 basic-badge.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 breadcrumb - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   ├── 📄 basic-breadcrumb.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 collapsed-breadcrumb.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 custom-separator-breadcrumb.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 dropdown-breadcrumb.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 link-component-breadcrumb.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   └── 📄 responsive-breadcrumb.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 button - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   ├── 📄 button-misc.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 button-sizes.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   └── 📄 button-variants.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 calendar - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   └── 📄 basic-calendar.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 card - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   └── 📄 basic-card.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 carousel - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   ├── 📄 basic-carousel.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 carousel-autoplay.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 carousel-orientation.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 carousel-sizes.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   └── 📄 carousel-spacing.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 checkbox - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   ├── 📄 basic-checkbox.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   └── 📄 checkbox-disabled.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 collapsible - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   └── 📄 basic-collapsible.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 combobox - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   ├── 📄 basic-combobox.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 combobox-dropdown-menu.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   └── 📄 combobox-popover.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 command - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   ├── 📄 basic-command.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   └── 📄 command-dialog.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 context-menu - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   └── 📄 basic-context-menu.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 dialog - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   └── 📄 basic-dialog.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 drawer - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   ├── 📄 basic-drawer.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   └── 📄 drawer-responsive-dialog.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 dropdown-menu - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   ├── 📄 basic-dropdown-menu.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 dropdown-menu-checkboxes.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   └── 📄 dropdown-menu-radio-group.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 form - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   └── 📄 basic-form.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 hover-card - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   └── 📄 basic-hover-card.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 input - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   ├── 📄 basic-input.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 input-disabled.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 input-file.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 input-with-button.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   └── 📄 input-with-label.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 input-otp - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   ├── 📄 basic-input-otp.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 input-otp-pattern.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   └── 📄 input-otp-separator.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 label - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   └── 📄 basic-label.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 menubar - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   └── 📄 basic-menubar.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 navigation-menu - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   └── 📄 basic-navigation-menu.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 pagination - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   └── 📄 basic-pagination.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 popover - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   └── 📄 basic-popover.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 progress - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   └── 📄 basic-progress.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 radio-group - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   ├── 📄 basic-radio-group.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   └── 📄 radio-group-disabled.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 resizable - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   ├── 📄 basic-resizable.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 resizable-handle.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   └── 📄 resizable-vertical.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 scroll-area - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   ├── 📄 basic-scroll-area.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   └── 📄 scroll-area-horizontal.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 select - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   ├── 📄 basic-select.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   └── 📄 select-scrollable.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 separator - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   └── 📄 basic-separator.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 sheet - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   ├── 📄 basic-sheet.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   └── 📄 sheet-side.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 skeleton - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   └── 📄 default-skeleton.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 slider - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   └── 📄 basic-slider.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 sonner - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   └── 📄 basic-sonner.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 switch - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   ├── 📄 basic-switch.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   └── 📄 switch-disabled.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 table - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   └── 📄 basic-table.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 tabs - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   └── 📄 basic-tabs.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 textarea - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   ├── 📄 basic-textarea.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 textarea-disabled.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 textarea-with-button.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 textarea-with-label.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   └── 📄 textarea-with-text.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 toast - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   ├── 📄 basic-toast.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 toast-destructive.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 toast-with-action.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   └── 📄 toast-with-title.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 toggle - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   ├── 📄 basic-toggle.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 toggle-disabled.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 toggle-large.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 toggle-outline.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 toggle-small.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   └── 📄 toggle-with-text.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       ├── 📁 toggle-group - Directory.
│   │   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │   │       │   │   ├── 📄 basic-toggle-group.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 toggle-group-disabled.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 toggle-group-large.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 toggle-group-outline.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 toggle-group-single.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   └── 📄 toggle-group-small.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       └── 📁 tooltip - Directory.
│   │   │   │   │   │           ├── 📁 _components - Directory.
│   │   │   │   │   │           │   └── 📄 basic-tooltip.tsx - Reusable UI component.
│   │   │   │   │   │           └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   ├── 📁 apps - Directory.
│   │   │   │   │   │   ├── 📁 calendar - Directory.
│   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   ├── 📄 calendar-content.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 calendar-header.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 calendar-wrapper.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 event-filters.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 event-sidebar.tsx - Reusable UI component.
│   │   │   │   │   │   │   ├── 📁 _contexts - Directory.
│   │   │   │   │   │   │   │   └── 📄 calendar-context.tsx - TypeScript file.
│   │   │   │   │   │   │   ├── 📁 _data - Directory.
│   │   │   │   │   │   │   │   ├── 📄 categories.ts - TypeScript file.
│   │   │   │   │   │   │   │   └── 📄 events.ts - TypeScript file.
│   │   │   │   │   │   │   ├── 📁 _hooks - Directory.
│   │   │   │   │   │   │   │   └── 📄 calendar-context.tsx - Custom React hook logic.
│   │   │   │   │   │   │   ├── 📁 _reducers - Directory.
│   │   │   │   │   │   │   │   └── 📄 calendar-reducer.ts - TypeScript file.
│   │   │   │   │   │   │   ├── 📁 _schemas - Directory.
│   │   │   │   │   │   │   │   └── 📄 event-sidebar-schema.tsx - Data validation schema.
│   │   │   │   │   │   │   ├── 📄 constants.ts - TypeScript file.
│   │   │   │   │   │   │   ├── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   └── 📄 types.ts - TypeScript file.
│   │   │   │   │   │   ├── 📁 chat - Directory.
│   │   │   │   │   │   │   ├── 📁 [[...id]] - Directory.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   ├── 📄 chat-avatar.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 chat-box-content-list.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 chat-box-content.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 chat-box-footer-actions.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 chat-box-footer.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 chat-box-header.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 chat-box-not-found.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 chat-box-placeholder.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 chat-box.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 chat-header-actions.jsx - File.
│   │   │   │   │   │   │   │   ├── 📄 chat-header-info.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 chat-menu-button.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📁 chat-sidebar - Directory.
│   │   │   │   │   │   │   │   │   ├── 📄 chat-sidebar-action-buttons.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 chat-sidebar-header.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 chat-sidebar-item.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 chat-sidebar-list.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 chat-sidebar-notification-dropdown.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 chat-sidebar-search-input.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 chat-sidebar-status-dropdown.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   └── 📄 index.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 chat-wrapper.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 files-uploader.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 images-uploader.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 message-bubble-content-files.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 message-bubble-content-images.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 message-bubble-content-text.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 message-bubble-content.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 message-bubble-status-icon.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 message-bubble.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 text-message-form.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 user-status-icon.tsx - Reusable UI component.
│   │   │   │   │   │   │   ├── 📁 _contexts - Directory.
│   │   │   │   │   │   │   │   └── 📄 chat-context.tsx - TypeScript file.
│   │   │   │   │   │   │   ├── 📁 _data - Directory.
│   │   │   │   │   │   │   │   └── 📄 chats.ts - TypeScript file.
│   │   │   │   │   │   │   ├── 📁 _hooks - Directory.
│   │   │   │   │   │   │   │   └── 📄 use-chat-context.tsx - Custom React hook logic.
│   │   │   │   │   │   │   ├── 📁 _reducers - Directory.
│   │   │   │   │   │   │   │   └── 📄 chat-reducer.ts - TypeScript file.
│   │   │   │   │   │   │   ├── 📁 _schemas - Directory.
│   │   │   │   │   │   │   │   ├── 📄 files-uploader-schema.tsx - Data validation schema.
│   │   │   │   │   │   │   │   ├── 📄 images-uploader-schema.tsx - Data validation schema.
│   │   │   │   │   │   │   │   └── 📄 text-message-schema.tsx - Data validation schema.
│   │   │   │   │   │   │   ├── 📄 constants.ts - TypeScript file.
│   │   │   │   │   │   │   ├── 📄 layout.tsx - Layout wrapper for this route.
│   │   │   │   │   │   │   └── 📄 types.ts - TypeScript file.
│   │   │   │   │   │   ├── 📁 email - Directory.
│   │   │   │   │   │   │   ├── 📁 [filter] - Directory.
│   │   │   │   │   │   │   │   ├── 📁 [id] - Directory.
│   │   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   ├── 📄 email-composer-form.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 email-composer.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 email-list-content-desktop.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 email-list-content-header.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 email-list-content-item-mobile.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 email-list-content-mobile.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 email-list-content.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 email-list-footer.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 email-list-header.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 email-list-row-desktop.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 email-list-search-form.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 email-list.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 email-menu-button.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 email-not-found.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 email-sidebar-header.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 email-sidebar-item.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 email-sidebar-list.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 email-sidebar.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 email-view-content-actions.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 email-view-content-body.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 email-view-content-footer.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 email-view-content-header.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 email-view-content.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 email-view-header.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 email-view.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 email-wrapper.tsx - Reusable UI component.
│   │   │   │   │   │   │   ├── 📁 _contexts - Directory.
│   │   │   │   │   │   │   │   └── 📄 email-context.tsx - TypeScript file.
│   │   │   │   │   │   │   ├── 📁 _data - Directory.
│   │   │   │   │   │   │   │   ├── 📄 emails-sidebar-items.ts - TypeScript file.
│   │   │   │   │   │   │   │   ├── 📄 emails.ts - TypeScript file.
│   │   │   │   │   │   │   │   └── 📄 labels.ts - TypeScript file.
│   │   │   │   │   │   │   ├── 📁 _hooks - Directory.
│   │   │   │   │   │   │   │   └── 📄 use-email-context.tsx - Custom React hook logic.
│   │   │   │   │   │   │   ├── 📁 _reducers - Directory.
│   │   │   │   │   │   │   │   └── 📄 email-reducer.ts - TypeScript file.
│   │   │   │   │   │   │   ├── 📁 _schemas - Directory.
│   │   │   │   │   │   │   │   ├── 📄 email-composer-schema.tsx - Data validation schema.
│   │   │   │   │   │   │   │   └── 📄 email-list-search-schema.tsx - Data validation schema.
│   │   │   │   │   │   │   ├── 📁 compose - Directory.
│   │   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   ├── 📄 constants.ts - TypeScript file.
│   │   │   │   │   │   │   ├── 📄 layout.tsx - Layout wrapper for this route.
│   │   │   │   │   │   │   └── 📄 types.ts - TypeScript file.
│   │   │   │   │   │   └── 📁 kanban - Directory.
│   │   │   │   │   │       ├── 📁 _components - Directory.
│   │   │   │   │   │       │   ├── 📄 kanban-add-new-column-button.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 kanban-add-new-task-button.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 kanban-column-actions.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 kanban-column-item-header.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 kanban-column-item.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 kanban-column-list.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📁 kanban-sidebar - Directory.
│   │   │   │   │   │       │   │   ├── 📄 index.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 kanban-add-column-sidebar.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 kanban-add-task-sidebar.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   ├── 📄 kanban-update-column-sidebar.tsx - Reusable UI component.
│   │   │   │   │   │       │   │   └── 📄 kanban-update-task-sidebar.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 kanban-task-item-actions.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 kanban-task-item-content.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 kanban-task-item-footer.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 kanban-task-item-header.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 kanban-task-item.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 kanban-task-list.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 kanban-wrapper.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 kanban.tsx - Reusable UI component.
│   │   │   │   │   │       ├── 📁 _contexts - Directory.
│   │   │   │   │   │       │   └── 📄 kanban-context.tsx - TypeScript file.
│   │   │   │   │   │       ├── 📁 _data - Directory.
│   │   │   │   │   │       │   ├── 📄 kanban.ts - TypeScript file.
│   │   │   │   │   │       │   ├── 📄 labels.ts - TypeScript file.
│   │   │   │   │   │       │   └── 📄 team-members.ts - TypeScript file.
│   │   │   │   │   │       ├── 📁 _hooks - Directory.
│   │   │   │   │   │       │   └── 📄 use-kanban-context.tsx - Custom React hook logic.
│   │   │   │   │   │       ├── 📁 _reducers - Directory.
│   │   │   │   │   │       │   └── 📄 kanban-reducer.ts - TypeScript file.
│   │   │   │   │   │       ├── 📁 _schemas - Directory.
│   │   │   │   │   │       │   ├── 📄 kanban-column-schema.ts - Data validation schema.
│   │   │   │   │   │       │   ├── 📄 kanban-task-schema.ts - Data validation schema.
│   │   │   │   │   │       │   └── 📄 user-schema.ts - Data validation schema.
│   │   │   │   │   │       ├── 📄 constants.ts - TypeScript file.
│   │   │   │   │   │       ├── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       └── 📄 types.ts - TypeScript file.
│   │   │   │   │   ├── 📁 dashboards - Directory.
│   │   │   │   │   │   ├── 📁 analytics - Directory.
│   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   ├── 📄 conversion-funnel-chart.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 conversion-funnel-item.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 conversion-funnel-list.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 conversion-funnel.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 engagement-by-device-table-columns.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 engagement-by-device-table-toolbar.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 engagement-by-device-table-view-options.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 engagement-by-device-table.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 engagement-by-device.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 new-vs-returning-visitors-chart.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 new-vs-returning-visitors-list.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 new-vs-returning-visitors.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📁 overview - Directory.
│   │   │   │   │   │   │   │   │   ├── 📄 average-session-duration-chart.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 average-session-duration.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 bounce-rate-chart.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 bounce-rate.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 conversion-rate-chart.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 conversion-rate.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 index.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   ├── 📄 unique-visitors-chart.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   │   └── 📄 unique-visitors.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 performance-over-time-chart.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 performance-over-time-summary.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 performance-over-time.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 traffic-sources-chart.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 traffic-sources-table.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 traffic-sources.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 visitors-by-country-item.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 visitors-by-country-list.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 visitors-by-country.tsx - Reusable UI component.
│   │   │   │   │   │   │   ├── 📁 _data - Directory.
│   │   │   │   │   │   │   │   ├── 📄 conversion-funnel.ts - TypeScript file.
│   │   │   │   │   │   │   │   ├── 📄 engagement-by-device.ts - TypeScript file.
│   │   │   │   │   │   │   │   ├── 📄 new-vs-returning-visitors.ts - TypeScript file.
│   │   │   │   │   │   │   │   ├── 📄 overview.ts - TypeScript file.
│   │   │   │   │   │   │   │   ├── 📄 performance-over-time.ts - TypeScript file.
│   │   │   │   │   │   │   │   ├── 📄 traffic-sources.ts - TypeScript file.
│   │   │   │   │   │   │   │   └── 📄 visitors-by-country.ts - TypeScript file.
│   │   │   │   │   │   │   ├── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   └── 📄 types.ts - TypeScript file.
│   │   │   │   │   │   ├── 📁 crm - Directory.
│   │   │   │   │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │   │   │   │   ├── 📄 active-projects-item-chart.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 active-projects-item.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 active-projects-list.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 active-projects.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 activity-timeline-item.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 activity-timeline-list.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 activity-timeline.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 customer-satisfaction-carousel.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 customer-satisfaction-chart.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 customer-satisfaction.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 lead-sources-chart.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 lead-sources.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 overview.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 revenue-trend-chart.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 revenue-trend-summary.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 revenue-trend.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 sales-by-country-chart.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 sales-by-country.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 sales-trend-chart.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 sales-trend.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 top-sales-representatives-list.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 top-sales-representatives-others-item.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   ├── 📄 top-sales-representatives-top-3-item.tsx - Reusable UI component.
│   │   │   │   │   │   │   │   └── 📄 top-sales-representatives.tsx - Reusable UI component.
│   │   │   │   │   │   │   ├── 📁 _data - Directory.
│   │   │   │   │   │   │   │   ├── 📄 active-projects.ts - TypeScript file.
│   │   │   │   │   │   │   │   ├── 📄 activity-timeline.ts - TypeScript file.
│   │   │   │   │   │   │   │   ├── 📄 customer-satisfaction.ts - TypeScript file.
│   │   │   │   │   │   │   │   ├── 📄 lead-sources.ts - TypeScript file.
│   │   │   │   │   │   │   │   ├── 📄 overview.ts - TypeScript file.
│   │   │   │   │   │   │   │   ├── 📄 revenue-trend.ts - TypeScript file.
│   │   │   │   │   │   │   │   ├── 📄 sales-by-country.ts - TypeScript file.
│   │   │   │   │   │   │   │   ├── 📄 sales-trend.ts - TypeScript file.
│   │   │   │   │   │   │   │   └── 📄 top-sales-representatives.ts - TypeScript file.
│   │   │   │   │   │   │   ├── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   │   └── 📄 types.ts - TypeScript file.
│   │   │   │   │   │   └── 📁 ecommerce - Directory.
│   │   │   │   │   │       ├── 📁 _components - Directory.
│   │   │   │   │   │       │   ├── 📄 churn-rate-chart.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 churn-rate-summary.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 churn-rate.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 customer-insight-item.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 customer-insight-list.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 customer-insights.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 gender-distribution-chart.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 gender-distribution.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 invoice-table-row-actions.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 invoice-table-toolbar.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 invoice-table-view-options.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 invoices-table-columns.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 invoices-table.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 invoices.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 overview.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 revenue-by-source-chart.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 revenue-by-source-item.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 revenue-by-source-list.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 revenue-by-source-summary.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 revenue-by-source.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 sales-trend-chart.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 sales-trend-summary-item.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 sales-trend-summary.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 sales-trend.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 top-products-item.tsx - Reusable UI component.
│   │   │   │   │   │       │   ├── 📄 top-products-list.tsx - Reusable UI component.
│   │   │   │   │   │       │   └── 📄 top-products.tsx - Reusable UI component.
│   │   │   │   │   │       ├── 📁 _data - Directory.
│   │   │   │   │   │       │   ├── 📄 churn-rate.ts - TypeScript file.
│   │   │   │   │   │       │   ├── 📄 customer-insights.ts - TypeScript file.
│   │   │   │   │   │       │   ├── 📄 gender-distribution.ts - TypeScript file.
│   │   │   │   │   │       │   ├── 📄 invoices.ts - TypeScript file.
│   │   │   │   │   │       │   ├── 📄 overview.ts - TypeScript file.
│   │   │   │   │   │       │   ├── 📄 revenue-by-source.ts - TypeScript file.
│   │   │   │   │   │       │   ├── 📄 sales-trend.ts - TypeScript file.
│   │   │   │   │   │       │   └── 📄 top-products.ts - TypeScript file.
│   │   │   │   │   │       ├── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │       └── 📄 types.ts - TypeScript file.
│   │   │   │   │   ├── 📄 global-error.tsx - TypeScript file.
│   │   │   │   │   ├── 📄 layout.tsx - Layout wrapper for this route.
│   │   │   │   │   └── 📁 pages - Directory.
│   │   │   │   │       ├── 📁 account - Directory.
│   │   │   │   │       │   ├── 📁 _data - Directory.
│   │   │   │   │       │   │   ├── 📄 connections.ts - TypeScript file.
│   │   │   │   │       │   │   ├── 📄 curremt-plan.ts - TypeScript file.
│   │   │   │   │       │   │   ├── 📄 logs.ts - TypeScript file.
│   │   │   │   │       │   │   ├── 📄 nav-list-links.ts - TypeScript file.
│   │   │   │   │       │   │   ├── 📄 plans.ts - TypeScript file.
│   │   │   │   │       │   │   ├── 📄 posts.ts - TypeScript file.
│   │   │   │   │       │   │   ├── 📄 saved-cards.ts - TypeScript file.
│   │   │   │   │       │   │   └── 📄 subscriptions.tsx - TypeScript file.
│   │   │   │   │       │   ├── 📄 constants.ts - TypeScript file.
│   │   │   │   │       │   ├── 📁 profile - Directory.
│   │   │   │   │       │   │   ├── 📁 _components - Directory.
│   │   │   │   │       │   │   │   ├── 📁 profile-content - Directory.
│   │   │   │   │       │   │   │   │   ├── 📄 index.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   │   ├── 📄 profile-content-info-connection-item.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   │   ├── 📄 profile-content-info-connection-list.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   │   ├── 📄 profile-content-info-connection.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   │   ├── 📄 profile-content-info-intro-item.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   │   ├── 📄 profile-content-info-intro-list.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   │   ├── 📄 profile-content-info-intro.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   │   ├── 📄 profile-content-info.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   │   ├── 📄 profile-content-main-feed-create-post.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   │   ├── 📄 profile-content-main-feed-post-item.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   │   ├── 📄 profile-content-main-feed-post-list.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   │   └── 📄 profile-content-main-feed.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   └── 📄 profile-header.tsx - Reusable UI component.
│   │   │   │   │       │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │       │   ├── 📁 settings - Directory.
│   │   │   │   │       │   │   ├── 📁 _components - Directory.
│   │   │   │   │       │   │   │   ├── 📁 general - Directory.
│   │   │   │   │       │   │   │   │   ├── 📄 dangerous-zone.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   │   ├── 📄 delete-account-form.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   │   ├── 📄 profile-info-form.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   │   └── 📄 profile-info.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   └── 📄 nav-list.tsx - Reusable UI component.
│   │   │   │   │       │   │   ├── 📁 _schemas - Directory.
│   │   │   │   │       │   │   │   ├── 📄 delete-account-schema.tsx - Data validation schema.
│   │   │   │   │       │   │   │   └── 📄 profile-info-form-schema.tsx - Data validation schema.
│   │   │   │   │       │   │   ├── 📄 layout.tsx - Layout wrapper for this route.
│   │   │   │   │       │   │   ├── 📁 notifications - Directory.
│   │   │   │   │       │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │       │   │   │   │   ├── 📄 notification-preferences.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   │   └── 📄 notifications-preferenes-form.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   ├── 📁 _schemas - Directory.
│   │   │   │   │       │   │   │   │   └── 📄 notifications-preferenes-schema.tsx - Data validation schema.
│   │   │   │   │       │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │       │   │   ├── 📄 page.tsx - Main page UI component.
│   │   │   │   │       │   │   ├── 📁 plan-and-billing - Directory.
│   │   │   │   │       │   │   │   ├── 📁 _components - Directory.
│   │   │   │   │       │   │   │   │   ├── 📄 change-plan-form.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   │   ├── 📄 change-plan.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   │   ├── 📄 current-plan.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   │   ├── 📄 payment-method-form.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   │   ├── 📄 payment-method.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   │   ├── 📄 plan-and-billing.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   │   ├── 📄 saved-cards-item.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   │   ├── 📄 saved-cards-list.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   │   └── 📄 saved-cards.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   ├── 📁 _schemas - Directory.
│   │   │   │   │       │   │   │   │   ├── 📄 card-schema.tsx - Data validation schema.
│   │   │   │   │       │   │   │   │   ├── 📄 change-plan-schema.tsx - Data validation schema.
│   │   │   │   │       │   │   │   │   └── 📄 payment-method-schema.tsx - Data validation schema.
│   │   │   │   │       │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │       │   │   └── 📁 security - Directory.
│   │   │   │   │       │   │       ├── 📁 _components - Directory.
│   │   │   │   │       │   │       │   ├── 📄 account-recovery-options-form.tsx - Reusable UI component.
│   │   │   │   │       │   │       │   ├── 📄 account-recovery-options.tsx - Reusable UI component.
│   │   │   │   │       │   │       │   ├── 📄 change-password.tsx - Reusable UI component.
│   │   │   │   │       │   │       │   ├── 📄 chnage-password-form.tsx - Reusable UI component.
│   │   │   │   │       │   │       │   ├── 📄 recent-logs-table.tsx - Reusable UI component.
│   │   │   │   │       │   │       │   ├── 📄 recent-logs.tsx - Reusable UI component.
│   │   │   │   │       │   │       │   ├── 📄 security-preferences-form.tsx - Reusable UI component.
│   │   │   │   │       │   │       │   └── 📄 security-preferences.tsx - Reusable UI component.
│   │   │   │   │       │   │       ├── 📁 _schemas - Directory.
│   │   │   │   │       │   │       │   ├── 📄 account-recovery-options-schema.ts - Data validation schema.
│   │   │   │   │       │   │       │   ├── 📄 chnage-password-schema.ts - Data validation schema.
│   │   │   │   │       │   │       │   └── 📄 security-preferences-form-schema.tsx - Data validation schema.
│   │   │   │   │       │   │       └── 📄 page.tsx - Main page UI component.
│   │   │   │   │       │   └── 📄 types.ts - TypeScript file.
│   │   │   │   │       ├── 📁 payment - Directory.
│   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │       │   │   ├── 📄 payment-contnet.tsx - Reusable UI component.
│   │   │   │   │       │   │   ├── 📄 payment-method-form.tsx - Reusable UI component.
│   │   │   │   │       │   │   ├── 📄 payment-summary-row.tsx - Reusable UI component.
│   │   │   │   │       │   │   ├── 📄 payment-summary.tsx - Reusable UI component.
│   │   │   │   │       │   │   └── 📄 saved-card.tsx - Reusable UI component.
│   │   │   │   │       │   ├── 📁 _data - Directory.
│   │   │   │   │       │   │   └── 📄 payment.ts - TypeScript file.
│   │   │   │   │       │   ├── 📁 _schemas - Directory.
│   │   │   │   │       │   │   └── 📄 payment-method-schema.tsx - Data validation schema.
│   │   │   │   │       │   ├── 📄 page.tsx - Main page UI component.
│   │   │   │   │       │   └── 📄 types.ts - TypeScript file.
│   │   │   │   │       └── 📁 pricing - Directory.
│   │   │   │   │           ├── 📁 _components - Directory.
│   │   │   │   │           │   └── 📄 pricing.tsx - Reusable UI component.
│   │   │   │   │           ├── 📁 _data - Directory.
│   │   │   │   │           │   └── 📄 pricing.ts - TypeScript file.
│   │   │   │   │           ├── 📄 page.tsx - Main page UI component.
│   │   │   │   │           └── 📄 types.ts - TypeScript file.
│   │   │   │   ├── 📁 (plain-layout) - Directory.
│   │   │   │   │   ├── 📁 (auth) - Directory.
│   │   │   │   │   │   ├── 📁 forgot-password - Directory.
│   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   ├── 📁 new-password - Directory.
│   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   ├── 📁 register - Directory.
│   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   ├── 📁 sign-in - Directory.
│   │   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   │   └── 📁 verify-email - Directory.
│   │   │   │   │   │       └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   ├── 📄 layout.tsx - Layout wrapper for this route.
│   │   │   │   │   └── 📁 pages - Directory.
│   │   │   │   │       ├── 📁 coming-soon - Directory.
│   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │       ├── 📁 landing - Landing page feature module.
│   │   │   │   │       │   ├── 📁 _components - Directory.
│   │   │   │   │       │   │   ├── 📄 contact-us-form.tsx - Reusable UI component.
│   │   │   │   │       │   │   ├── 📄 contact-us-info.tsx - Reusable UI component.
│   │   │   │   │       │   │   ├── 📄 contact-us.tsx - Reusable UI component.
│   │   │   │   │       │   │   ├── 📄 core-benefits-item.tsx - Reusable UI component.
│   │   │   │   │       │   │   ├── 📄 core-benefits-list.tsx - Reusable UI component.
│   │   │   │   │       │   │   ├── 📄 core-benefits.tsx - Reusable UI component.
│   │   │   │   │       │   │   ├── 📄 core-features-item.tsx - Reusable UI component.
│   │   │   │   │       │   │   ├── 📄 core-features-list.tsx - Reusable UI component.
│   │   │   │   │       │   │   ├── 📄 core-features.tsx - Reusable UI component.
│   │   │   │   │       │   │   ├── 📄 faqs-item.tsx - Reusable UI component.
│   │   │   │   │       │   │   ├── 📄 faqs-list.tsx - Reusable UI component.
│   │   │   │   │       │   │   ├── 📄 faqs.tsx - Reusable UI component.
│   │   │   │   │       │   │   ├── 📄 hero.tsx - Reusable UI component.
│   │   │   │   │       │   │   ├── 📄 in-action-cta.tsx - Reusable UI component.
│   │   │   │   │       │   │   ├── 📁 layout - Directory.
│   │   │   │   │       │   │   │   ├── 📄 index.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   ├── 📄 landing-footer.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   ├── 📄 landing-header.tsx - Reusable UI component.
│   │   │   │   │       │   │   │   └── 📄 landing-sidebar.tsx - Reusable UI component.
│   │   │   │   │       │   │   ├── 📄 pricing-plans-list.tsx - Reusable UI component.
│   │   │   │   │       │   │   ├── 📄 pricing-plans.tsx - Reusable UI component.
│   │   │   │   │       │   │   ├── 📄 ready-to-build-cta.tsx - Reusable UI component.
│   │   │   │   │       │   │   ├── 📄 trusted-by-carousel.tsx - Reusable UI component.
│   │   │   │   │       │   │   ├── 📄 trusted-by.tsx - Reusable UI component.
│   │   │   │   │       │   │   ├── 📄 what-people-say-carousel.tsx - Reusable UI component.
│   │   │   │   │       │   │   └── 📄 what-people-say.tsx - Reusable UI component.
│   │   │   │   │       │   ├── 📁 _data - Directory.
│   │   │   │   │       │   │   ├── 📄 contact-us-info.ts - TypeScript file.
│   │   │   │   │       │   │   ├── 📄 core-benefits.ts - TypeScript file.
│   │   │   │   │       │   │   ├── 📄 core-features.tsx - TypeScript file.
│   │   │   │   │       │   │   ├── 📄 faqs.tsx - TypeScript file.
│   │   │   │   │       │   │   ├── 📄 footer-navigation.ts - TypeScript file.
│   │   │   │   │       │   │   ├── 📄 header-navigation.ts - TypeScript file.
│   │   │   │   │       │   │   ├── 📄 pricing-plans.ts - TypeScript file.
│   │   │   │   │       │   │   ├── 📄 social-proof-badge-avatars.ts - TypeScript file.
│   │   │   │   │       │   │   ├── 📄 trusted-by.ts - TypeScript file.
│   │   │   │   │       │   │   └── 📄 what-people-say.ts - TypeScript file.
│   │   │   │   │       │   ├── 📁 _schemas - Directory.
│   │   │   │   │       │   │   └── 📄 contact-us-schema.ts - Data validation schema.
│   │   │   │   │       │   ├── 📄 layout.tsx - Layout wrapper for this route.
│   │   │   │   │       │   ├── 📄 page.tsx - Main page UI component.
│   │   │   │   │       │   └── 📄 types.ts - TypeScript file.
│   │   │   │   │       ├── 📁 maintenance - Directory.
│   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │       ├── 📁 not-found-404 - Directory.
│   │   │   │   │       │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │       └── 📁 unauthorized-401 - Directory.
│   │   │   │   │           └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📁 [...not-found] - Directory.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📄 global-error.tsx - TypeScript file.
│   │   │   │   └── 📄 layout.tsx - Layout wrapper for this route.
│   │   │   ├── 📁 api - Directory.
│   │   │   │   └── 📁 auth - Authentication feature module.
│   │   │   │       ├── 📁 [...nextauth] - Directory.
│   │   │   │       │   └── 📄 route.ts - API endpoint.
│   │   │   │       └── 📁 sign-in - Directory.
│   │   │   │           └── 📄 route.ts - API endpoint.
│   │   │   ├── 📄 favicon.ico - File.
│   │   │   ├── 📄 globals.css - Styles / Tailwind directives.
│   │   │   └── 📄 themes.css - Styles / Tailwind directives.
│   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   ├── 📁 auth - Authentication feature module.
│   │   │   │   ├── 📄 auth-layout.tsx - Layout wrapper for this route.
│   │   │   │   ├── 📄 forgot-password-form.tsx - Reusable UI component.
│   │   │   │   ├── 📄 forgot-password.tsx - Reusable UI component.
│   │   │   │   ├── 📄 new-passward.tsx - Reusable UI component.
│   │   │   │   ├── 📄 new-password-form.tsx - Reusable UI component.
│   │   │   │   ├── 📄 oauth-links.tsx - Reusable UI component.
│   │   │   │   ├── 📄 register-form.tsx - Reusable UI component.
│   │   │   │   ├── 📄 register.tsx - Reusable UI component.
│   │   │   │   ├── 📄 sign-in-form.tsx - Reusable UI component.
│   │   │   │   ├── 📄 sign-in.tsx - Reusable UI component.
│   │   │   │   ├── 📄 verify-email-form.tsx - Reusable UI component.
│   │   │   │   └── 📄 verify-email.tsx - Reusable UI component.
│   │   │   ├── 📄 credit-card-brand-icon.tsx - Reusable UI component.
│   │   │   ├── 📁 dashboards - Directory.
│   │   │   │   ├── 📄 dashboard-card.tsx - Reusable UI component.
│   │   │   │   └── 📄 percentage-change-badge.tsx - Reusable UI component.
│   │   │   ├── 📄 dynamic-icon.tsx - Reusable UI component.
│   │   │   ├── 📄 highlight.tsx - Reusable UI component.
│   │   │   ├── 📄 language-dropdown.tsx - Reusable UI component.
│   │   │   ├── 📁 layout - Directory.
│   │   │   │   ├── 📄 command-menu.tsx - Reusable UI component.
│   │   │   │   ├── 📄 customizer.tsx - Reusable UI component.
│   │   │   │   ├── 📄 footer.tsx - Reusable UI component.
│   │   │   │   ├── 📄 full-screen-toggle.tsx - Reusable UI component.
│   │   │   │   ├── 📁 horizontal-layout - Directory.
│   │   │   │   │   ├── 📄 bottom-bar-header.tsx - Reusable UI component.
│   │   │   │   │   ├── 📄 horizontal-layout-header.tsx - Layout wrapper for this route.
│   │   │   │   │   ├── 📄 index.tsx - Reusable UI component.
│   │   │   │   │   ├── 📄 top-bar-header-menubar.tsx - Reusable UI component.
│   │   │   │   │   └── 📄 top-bar-header.tsx - Reusable UI component.
│   │   │   │   ├── 📄 index.tsx - Reusable UI component.
│   │   │   │   ├── 📄 notification-dropdown.tsx - Reusable UI component.
│   │   │   │   ├── 📄 sidebar.tsx - Reusable UI component.
│   │   │   │   ├── 📄 toggle-mobile-sidebar.tsx - Reusable UI component.
│   │   │   │   ├── 📄 user-dropdown.tsx - Reusable UI component.
│   │   │   │   └── 📁 vertical-layout - Directory.
│   │   │   │       ├── 📄 index.tsx - Reusable UI component.
│   │   │   │       └── 📄 vertical-layout-header.tsx - Layout wrapper for this route.
│   │   │   ├── 📄 mode-dropdown.tsx - Reusable UI component.
│   │   │   ├── 📁 pages - Directory.
│   │   │   │   ├── 📁 coming-soon - Directory.
│   │   │   │   │   ├── 📄 coming-soon-form.tsx - Reusable UI component.
│   │   │   │   │   ├── 📄 countdown-timer.tsx - Reusable UI component.
│   │   │   │   │   └── 📄 index.tsx - Reusable UI component.
│   │   │   │   ├── 📄 maintenance.tsx - Reusable UI component.
│   │   │   │   ├── 📄 not-found-404.tsx - Reusable UI component.
│   │   │   │   └── 📄 unauthorized-401.tsx - Reusable UI component.
│   │   │   ├── 📄 pricing-plans.tsx - Reusable UI component.
│   │   │   ├── 📄 social-media-links.tsx - Reusable UI component.
│   │   │   └── 📁 ui - Base Shadcn UI components.
│   │   │       ├── 📄 accordion.tsx - Reusable UI component.
│   │   │       ├── 📄 alert-dialog.tsx - Reusable UI component.
│   │   │       ├── 📄 alert.tsx - Reusable UI component.
│   │   │       ├── 📄 aspect-ratio.tsx - Reusable UI component.
│   │   │       ├── 📄 avatar.tsx - Reusable UI component.
│   │   │       ├── 📄 badge.tsx - Reusable UI component.
│   │   │       ├── 📄 bento-grid.tsx - Reusable UI component.
│   │   │       ├── 📄 breadcrumb.tsx - Reusable UI component.
│   │   │       ├── 📄 button.tsx - Reusable UI component.
│   │   │       ├── 📄 calendar.tsx - Reusable UI component.
│   │   │       ├── 📄 card.tsx - Reusable UI component.
│   │   │       ├── 📄 carousel.tsx - Reusable UI component.
│   │   │       ├── 📄 chart.tsx - Reusable UI component.
│   │   │       ├── 📄 checkbox.tsx - Reusable UI component.
│   │   │       ├── 📄 code-block.tsx - Reusable UI component.
│   │   │       ├── 📄 collapsible.tsx - Reusable UI component.
│   │   │       ├── 📄 command.tsx - Reusable UI component.
│   │   │       ├── 📄 context-menu.tsx - Reusable UI component.
│   │   │       ├── 📁 data-table - Directory.
│   │   │       │   ├── 📄 data-table-column-header.tsx - Reusable UI component.
│   │   │       │   ├── 📄 data-table-column-toggle.tsx - Reusable UI component.
│   │   │       │   └── 📄 data-table-pagination.tsx - Reusable UI component.
│   │   │       ├── 📄 date-picker.tsx - Reusable UI component.
│   │   │       ├── 📄 date-range-picker.tsx - Reusable UI component.
│   │   │       ├── 📄 date-time-picker.tsx - Reusable UI component.
│   │   │       ├── 📄 dialog.tsx - Reusable UI component.
│   │   │       ├── 📄 drawer.tsx - Reusable UI component.
│   │   │       ├── 📄 dropdown-menu.tsx - Reusable UI component.
│   │   │       ├── 📁 editor - Directory.
│   │   │       │   ├── 📄 editor-menu-bar.tsx - Reusable UI component.
│   │   │       │   └── 📄 index.tsx - Reusable UI component.
│   │   │       ├── 📄 emoji-picker.tsx - Reusable UI component.
│   │   │       ├── 📄 file-dropzone.tsx - Reusable UI component.
│   │   │       ├── 📄 file-thumbnail.tsx - Reusable UI component.
│   │   │       ├── 📄 form.tsx - Reusable UI component.
│   │   │       ├── 📄 hover-card.tsx - Reusable UI component.
│   │   │       ├── 📄 input-file.tsx - Reusable UI component.
│   │   │       ├── 📄 input-group.tsx - Reusable UI component.
│   │   │       ├── 📄 input-otp.tsx - Reusable UI component.
│   │   │       ├── 📄 input-phone.tsx - Reusable UI component.
│   │   │       ├── 📄 input-spin.tsx - Reusable UI component.
│   │   │       ├── 📄 input-tags.tsx - Reusable UI component.
│   │   │       ├── 📄 input-time.tsx - Reusable UI component.
│   │   │       ├── 📄 input.tsx - Reusable UI component.
│   │   │       ├── 📄 iphone-15-pro.tsx - Reusable UI component.
│   │   │       ├── 📄 keyboard.tsx - Reusable UI component.
│   │   │       ├── 📄 label.tsx - Reusable UI component.
│   │   │       ├── 📄 media-grid.tsx - Reusable UI component.
│   │   │       ├── 📄 menubar.tsx - Reusable UI component.
│   │   │       ├── 📄 multiple-date-picker.tsx - Reusable UI component.
│   │   │       ├── 📄 navigation-menu.tsx - Reusable UI component.
│   │   │       ├── 📄 pagination.tsx - Reusable UI component.
│   │   │       ├── 📄 popover.tsx - Reusable UI component.
│   │   │       ├── 📄 progress.tsx - Reusable UI component.
│   │   │       ├── 📄 radio-group.tsx - Reusable UI component.
│   │   │       ├── 📄 rating.tsx - Reusable UI component.
│   │   │       ├── 📄 resizable.tsx - Reusable UI component.
│   │   │       ├── 📄 safari.tsx - Reusable UI component.
│   │   │       ├── 📄 scroll-area.tsx - Reusable UI component.
│   │   │       ├── 📄 select.tsx - Reusable UI component.
│   │   │       ├── 📄 separator.tsx - Reusable UI component.
│   │   │       ├── 📄 sheet.tsx - Reusable UI component.
│   │   │       ├── 📄 show-more-text.tsx - Reusable UI component.
│   │   │       ├── 📄 sidebar.tsx - Reusable UI component.
│   │   │       ├── 📄 skeleton.tsx - Reusable UI component.
│   │   │       ├── 📄 slider.tsx - Reusable UI component.
│   │   │       ├── 📄 sonner.tsx - Reusable UI component.
│   │   │       ├── 📄 sticky-layout.tsx - Layout wrapper for this route.
│   │   │       ├── 📄 switch.tsx - Reusable UI component.
│   │   │       ├── 📄 table.tsx - Reusable UI component.
│   │   │       ├── 📄 tabs.tsx - Reusable UI component.
│   │   │       ├── 📄 textarea.tsx - Reusable UI component.
│   │   │       ├── 📄 time-picker.tsx - Reusable UI component.
│   │   │       ├── 📄 timeline.tsx - Reusable UI component.
│   │   │       ├── 📄 toast.tsx - Reusable UI component.
│   │   │       ├── 📄 toaster.tsx - Reusable UI component.
│   │   │       ├── 📄 toggle-group.tsx - Reusable UI component.
│   │   │       ├── 📄 toggle.tsx - Reusable UI component.
│   │   │       └── 📄 tooltip.tsx - Reusable UI component.
│   │   ├── 📁 configs - Directory.
│   │   │   ├── 📄 auth-routes.ts - API endpoint.
│   │   │   ├── 📄 i18n.ts - TypeScript file.
│   │   │   ├── 📄 next-auth.ts - TypeScript file.
│   │   │   └── 📄 themes.ts - TypeScript file.
│   │   ├── 📁 contexts - React Context providers.
│   │   │   └── 📄 settings-context.tsx - TypeScript file.
│   │   ├── 📁 data - Static or mock data.
│   │   │   ├── 📁 dictionaries - Directory.
│   │   │   │   ├── 📄 ar.json - Mock JSON data.
│   │   │   │   └── 📄 en.json - Mock JSON data.
│   │   │   ├── 📄 navigations.ts - TypeScript file.
│   │   │   ├── 📄 notifications.ts - TypeScript file.
│   │   │   ├── 📄 oauth-links.ts - TypeScript file.
│   │   │   ├── 📄 social-links.ts - TypeScript file.
│   │   │   └── 📄 user.ts - TypeScript file.
│   │   ├── 📁 hooks - React custom hooks.
│   │   │   ├── 📄 use-is-rtl.tsx - Custom React hook logic.
│   │   │   ├── 📄 use-is-vertical.tsx - Custom React hook logic.
│   │   │   ├── 📄 use-mobile.tsx - Custom React hook logic.
│   │   │   ├── 📄 use-mode.tsx - Custom React hook logic.
│   │   │   ├── 📄 use-radius.tsx - Custom React hook logic.
│   │   │   ├── 📄 use-settings.ts - Custom React hook logic.
│   │   │   └── 📄 use-toast.ts - Custom React hook logic.
│   │   ├── 📁 lib - Utility functions and helpers.
│   │   │   ├── 📄 auth-routes.ts - API endpoint.
│   │   │   ├── 📄 auth.ts - Utility functions.
│   │   │   ├── 📄 get-dictionary.ts - Utility functions.
│   │   │   ├── 📄 i18n.ts - Utility functions.
│   │   │   ├── 📄 prisma.ts - Utility functions.
│   │   │   └── 📄 utils.ts - Utility functions.
│   │   ├── 📄 mdx-components.tsx - Reusable UI component.
│   │   ├── 📄 middleware.ts - TypeScript file.
│   │   ├── 📁 providers - React Context providers.
│   │   │   ├── 📄 direction-provider.tsx - TypeScript file.
│   │   │   ├── 📄 index.tsx - TypeScript file.
│   │   │   ├── 📄 mode-provider.tsx - TypeScript file.
│   │   │   ├── 📄 next-auth-provider.tsx - TypeScript file.
│   │   │   └── 📄 theme-provider.tsx - TypeScript file.
│   │   ├── 📁 schemas - Directory.
│   │   │   ├── 📄 coming-soon-schema.ts - Data validation schema.
│   │   │   ├── 📄 forgot-passward-schema.ts - Data validation schema.
│   │   │   ├── 📄 new-passward-schema.ts - Data validation schema.
│   │   │   ├── 📄 register-schema.ts - Data validation schema.
│   │   │   ├── 📄 sign-in-schema.ts - Data validation schema.
│   │   │   └── 📄 verify-email-schema.ts - Data validation schema.
│   │   └── 📄 types.ts - TypeScript file.
│   └── 📄 tsconfig.json - JSON configuration or data file.
├── 📄 package.json - NPM dependencies and scripts.
├── 📄 pnpm-lock.yaml - File.
├── 📄 release.config.js - Configuration file.
└── 📁 starter-kit - Directory.
    ├── 📄 .env.example - File.
    ├── 📄 .gitignore - File.
    ├── 📄 .npmrc - File.
    ├── 📁 .vscode - Directory.
    │   ├── 📄 extensions.json - JSON configuration or data file.
    │   └── 📄 settings.json - JSON configuration or data file.
    ├── 📄 README.md - Markdown documentation or content.
    ├── 📄 components.json - Shadcn UI configuration.
    ├── 📄 eslint.config.mjs - Configuration file.
    ├── 📄 next.config.mjs - Configuration file.
    ├── 📄 package.json - NPM dependencies and scripts.
    ├── 📄 pnpm-lock.yaml - File.
    ├── 📄 pnpm-workspace.yaml - File.
    ├── 📄 postcss.config.mjs - Configuration file.
    ├── 📄 prettier.config.mjs - Configuration file.
    ├── 📁 src - Directory.
    │   ├── 📁 app - Next.js App Router root directory.
    │   │   ├── 📁 (dashboard-layout) - Directory.
    │   │   │   ├── 📄 layout.tsx - Layout wrapper for this route.
    │   │   │   └── 📄 page.tsx - Main page UI component.
    │   │   ├── 📁 [...not-found] - Directory.
    │   │   │   └── 📄 page.tsx - Main page UI component.
    │   │   ├── 📄 favicon.ico - File.
    │   │   ├── 📄 global-error.tsx - TypeScript file.
    │   │   ├── 📄 globals.css - Styles / Tailwind directives.
    │   │   └── 📄 layout.tsx - Layout wrapper for this route.
    │   ├── 📁 components - Reusable UI and feature components.
    │   │   ├── 📄 dynamic-icon.tsx - Reusable UI component.
    │   │   ├── 📁 layout - Directory.
    │   │   │   ├── 📄 command-menu.tsx - Reusable UI component.
    │   │   │   ├── 📄 footer.tsx - Reusable UI component.
    │   │   │   ├── 📄 full-screen-toggle.tsx - Reusable UI component.
    │   │   │   ├── 📁 horizontal-layout - Directory.
    │   │   │   │   ├── 📄 bottom-bar-header.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 horizontal-layout-header.tsx - Layout wrapper for this route.
    │   │   │   │   ├── 📄 index.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 top-bar-header-menubar.tsx - Reusable UI component.
    │   │   │   │   └── 📄 top-bar-header.tsx - Reusable UI component.
    │   │   │   ├── 📄 index.tsx - Reusable UI component.
    │   │   │   ├── 📄 mode-dropdown.tsx - Reusable UI component.
    │   │   │   ├── 📄 sidebar.tsx - Reusable UI component.
    │   │   │   ├── 📄 toggle-mobile-sidebar.tsx - Reusable UI component.
    │   │   │   ├── 📄 user-dropdown.tsx - Reusable UI component.
    │   │   │   └── 📁 vertical-layout - Directory.
    │   │   │       ├── 📄 index.tsx - Reusable UI component.
    │   │   │       └── 📄 vertical-layout-header.tsx - Layout wrapper for this route.
    │   │   ├── 📁 pages - Directory.
    │   │   │   └── 📄 not-found-404.tsx - Reusable UI component.
    │   │   └── 📁 ui - Base Shadcn UI components.
    │   │       ├── 📄 alert.tsx - Reusable UI component.
    │   │       ├── 📄 avatar.tsx - Reusable UI component.
    │   │       ├── 📄 badge.tsx - Reusable UI component.
    │   │       ├── 📄 button.tsx - Reusable UI component.
    │   │       ├── 📄 calendar.tsx - Reusable UI component.
    │   │       ├── 📄 card.tsx - Reusable UI component.
    │   │       ├── 📄 collapsible.tsx - Reusable UI component.
    │   │       ├── 📄 command.tsx - Reusable UI component.
    │   │       ├── 📄 dialog.tsx - Reusable UI component.
    │   │       ├── 📄 drawer.tsx - Reusable UI component.
    │   │       ├── 📄 dropdown-menu.tsx - Reusable UI component.
    │   │       ├── 📄 input.tsx - Reusable UI component.
    │   │       ├── 📄 keyboard.tsx - Reusable UI component.
    │   │       ├── 📄 label.tsx - Reusable UI component.
    │   │       ├── 📄 menubar.tsx - Reusable UI component.
    │   │       ├── 📄 scroll-area.tsx - Reusable UI component.
    │   │       ├── 📄 separator.tsx - Reusable UI component.
    │   │       ├── 📄 sheet.tsx - Reusable UI component.
    │   │       ├── 📄 sidebar.tsx - Reusable UI component.
    │   │       ├── 📄 skeleton.tsx - Reusable UI component.
    │   │       ├── 📄 sonner.tsx - Reusable UI component.
    │   │       ├── 📄 toast.tsx - Reusable UI component.
    │   │       ├── 📄 toaster.tsx - Reusable UI component.
    │   │       └── 📄 tooltip.tsx - Reusable UI component.
    │   ├── 📁 contexts - React Context providers.
    │   │   └── 📄 settings-context.tsx - TypeScript file.
    │   ├── 📁 data - Static or mock data.
    │   │   ├── 📄 navigations.ts - TypeScript file.
    │   │   └── 📄 user.ts - TypeScript file.
    │   ├── 📁 hooks - React custom hooks.
    │   │   ├── 📄 use-is-rtl.tsx - Custom React hook logic.
    │   │   ├── 📄 use-is-vertical.tsx - Custom React hook logic.
    │   │   ├── 📄 use-mobile.tsx - Custom React hook logic.
    │   │   ├── 📄 use-mode.tsx - Custom React hook logic.
    │   │   ├── 📄 use-radius.tsx - Custom React hook logic.
    │   │   ├── 📄 use-settings.ts - Custom React hook logic.
    │   │   └── 📄 use-toast.ts - Custom React hook logic.
    │   ├── 📁 lib - Utility functions and helpers.
    │   │   └── 📄 utils.ts - Utility functions.
    │   ├── 📁 providers - React Context providers.
    │   │   ├── 📄 index.tsx - TypeScript file.
    │   │   ├── 📄 mode-provider.tsx - TypeScript file.
    │   │   └── 📄 theme-provider.tsx - TypeScript file.
    │   └── 📄 types.ts - TypeScript file.
    └── 📄 tsconfig.json - JSON configuration or data file.
```

### Summary of `shadboard`
- **Primary Use:** Reference for specific UI or layout aspects.
- **Integration Strategy:** Copy the relevant components (`.tsx`) into Orbitly's `core/` or `features/` folders, updating imports to match our colocation architecture. Re-wire mock JSON data to Convex queries.

---

## SHADCNSTORE

```text
├── 📄 .editorconfig - File.
├── 📄 .gitattributes - File.
├── 📁 .github - Directory.
│   └── 📁 workflows - Directory.
│       └── 📄 deploy.yml - File.
├── 📄 .gitignore - File.
├── 📄 .nvmrc - File.
├── 📄 .prettierignore - File.
├── 📄 .prettierrc - File.
├── 📄 License.md - Markdown documentation or content.
├── 📄 README.md - Markdown documentation or content.
├── 📁 docs - Directory.
│   ├── 📁 .vitepress - Directory.
│   │   └── 📄 config.ts - TypeScript file.
│   ├── 📄 README.md - Markdown documentation or content.
│   ├── 📁 components - Reusable UI and feature components.
│   │   ├── 📄 charts.md - Markdown documentation or content.
│   │   ├── 📄 custom-components.md - Markdown documentation or content.
│   │   ├── 📄 data-tables.md - Markdown documentation or content.
│   │   ├── 📄 index.md - Markdown documentation or content.
│   │   └── 📄 shadcn-ui.md - Markdown documentation or content.
│   ├── 📄 dev.sh - File.
│   ├── 📁 guide - Directory.
│   │   ├── 📄 choosing-framework.md - Markdown documentation or content.
│   │   ├── 📄 contributing.md - Markdown documentation or content.
│   │   ├── 📄 features.md - Markdown documentation or content.
│   │   ├── 📄 index.md - Markdown documentation or content.
│   │   ├── 📄 installation.md - Markdown documentation or content.
│   │   ├── 📄 license.md - Markdown documentation or content.
│   │   ├── 📄 project-structure.md - Markdown documentation or content.
│   │   ├── 📄 support.md - Markdown documentation or content.
│   │   ├── 📄 tech-stack.md - Markdown documentation or content.
│   │   └── 📄 theme-system.md - Markdown documentation or content.
│   ├── 📄 index.md - Markdown documentation or content.
│   ├── 📁 nextjs - Directory.
│   │   ├── 📄 build-deploy.md - Markdown documentation or content.
│   │   ├── 📄 development.md - Markdown documentation or content.
│   │   ├── 📄 index.md - Markdown documentation or content.
│   │   ├── 📄 quick-start.md - Markdown documentation or content.
│   │   └── 📄 troubleshooting.md - Markdown documentation or content.
│   ├── 📄 package.json - NPM dependencies and scripts.
│   ├── 📁 theme-customizer - Directory.
│   │   ├── 📄 configuration.md - Markdown documentation or content.
│   │   ├── 📄 custom-themes.md - Markdown documentation or content.
│   │   ├── 📄 index.md - Markdown documentation or content.
│   │   └── 📄 removing-customizer.md - Markdown documentation or content.
│   └── 📁 vite - Directory.
│       ├── 📄 build-deploy.md - Markdown documentation or content.
│       ├── 📄 development.md - Markdown documentation or content.
│       ├── 📄 index.md - Markdown documentation or content.
│       ├── 📄 quick-start.md - Markdown documentation or content.
│       └── 📄 troubleshooting.md - Markdown documentation or content.
├── 📁 nextjs-version - Directory.
│   ├── 📄 .gitignore - File.
│   ├── 📄 components.json - Shadcn UI configuration.
│   ├── 📄 eslint.config.mjs - Configuration file.
│   ├── 📄 next.config.ts - TypeScript file.
│   ├── 📄 package.json - NPM dependencies and scripts.
│   ├── 📄 pnpm-lock.yaml - File.
│   ├── 📄 postcss.config.mjs - Configuration file.
│   ├── 📁 src - Directory.
│   │   ├── 📁 app - Next.js App Router root directory.
│   │   │   ├── 📁 (auth) - Directory.
│   │   │   │   ├── 📁 errors - Directory.
│   │   │   │   │   ├── 📁 forbidden - Directory.
│   │   │   │   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   │   │   │   └── 📄 forbidden-error.tsx - Reusable UI component.
│   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   ├── 📁 internal-server-error - Directory.
│   │   │   │   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   │   │   │   └── 📄 internal-server-error.tsx - Reusable UI component.
│   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   ├── 📁 not-found - Directory.
│   │   │   │   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   │   │   │   └── 📄 not-found-error.tsx - Reusable UI component.
│   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   ├── 📁 unauthorized - Directory.
│   │   │   │   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   │   │   │   └── 📄 unauthorized-error.tsx - Reusable UI component.
│   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   └── 📁 under-maintenance - Directory.
│   │   │   │   │       ├── 📁 components - Reusable UI and feature components.
│   │   │   │   │       │   └── 📄 under-maintenance-error.tsx - Reusable UI component.
│   │   │   │   │       └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📁 forgot-password - Directory.
│   │   │   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   │   │   └── 📄 forgot-password-form-1.tsx - Reusable UI component.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📁 forgot-password-2 - Directory.
│   │   │   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   │   │   └── 📄 forgot-password-form-2.tsx - Reusable UI component.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📁 forgot-password-3 - Directory.
│   │   │   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   │   │   └── 📄 forgot-password-form-3.tsx - Reusable UI component.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📄 layout.tsx - Layout wrapper for this route.
│   │   │   │   ├── 📁 sign-in - Directory.
│   │   │   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   │   │   └── 📄 login-form-1.tsx - Reusable UI component.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📁 sign-in-2 - Directory.
│   │   │   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   │   │   └── 📄 login-form-2.tsx - Reusable UI component.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📁 sign-in-3 - Directory.
│   │   │   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   │   │   └── 📄 login-form-3.tsx - Reusable UI component.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📁 sign-up - Directory.
│   │   │   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   │   │   └── 📄 signup-form-1.tsx - Reusable UI component.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📁 sign-up-2 - Directory.
│   │   │   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   │   │   └── 📄 signup-form-2.tsx - Reusable UI component.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   └── 📁 sign-up-3 - Directory.
│   │   │   │       ├── 📁 components - Reusable UI and feature components.
│   │   │   │       │   └── 📄 signup-form-3.tsx - Reusable UI component.
│   │   │   │       └── 📄 page.tsx - Main page UI component.
│   │   │   ├── 📁 (dashboard) - Directory.
│   │   │   │   ├── 📁 calendar - Directory.
│   │   │   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   │   │   ├── 📄 calendar-main.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 calendar-sidebar.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 calendar-unified.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 calendar.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 calendars.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 date-picker.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 event-form.tsx - Reusable UI component.
│   │   │   │   │   │   └── 📄 quick-actions.tsx - Reusable UI component.
│   │   │   │   │   ├── 📁 data - Static or mock data.
│   │   │   │   │   │   ├── 📄 calendars.json - Mock JSON data.
│   │   │   │   │   │   ├── 📄 event-dates.json - Mock JSON data.
│   │   │   │   │   │   └── 📄 events.json - Mock JSON data.
│   │   │   │   │   ├── 📄 data.ts - TypeScript file.
│   │   │   │   │   ├── 📄 page.tsx - Main page UI component.
│   │   │   │   │   ├── 📄 types.ts - TypeScript file.
│   │   │   │   │   └── 📄 use-calendar.ts - TypeScript file.
│   │   │   │   ├── 📁 chat - Directory.
│   │   │   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   │   │   ├── 📄 chat-header.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 chat.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 conversation-list-new.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 conversation-list.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 message-input.tsx - Reusable UI component.
│   │   │   │   │   │   └── 📄 message-list.tsx - Reusable UI component.
│   │   │   │   │   ├── 📁 data - Static or mock data.
│   │   │   │   │   │   ├── 📄 conversations.json - Mock JSON data.
│   │   │   │   │   │   ├── 📄 messages.json - Mock JSON data.
│   │   │   │   │   │   └── 📄 users.json - Mock JSON data.
│   │   │   │   │   ├── 📄 page.tsx - Main page UI component.
│   │   │   │   │   └── 📄 use-chat.ts - TypeScript file.
│   │   │   │   ├── 📁 dashboard - Dashboard feature module.
│   │   │   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   │   │   ├── 📄 chart-area-interactive.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 data-table.tsx - Reusable UI component.
│   │   │   │   │   │   └── 📄 section-cards.tsx - Reusable UI component.
│   │   │   │   │   ├── 📁 data - Static or mock data.
│   │   │   │   │   │   ├── 📄 data.json - Mock JSON data.
│   │   │   │   │   │   ├── 📄 focus-documents-data.json - Mock JSON data.
│   │   │   │   │   │   ├── 📄 key-personnel-data.json - Mock JSON data.
│   │   │   │   │   │   └── 📄 past-performance-data.json - Mock JSON data.
│   │   │   │   │   ├── 📄 page.tsx - Main page UI component.
│   │   │   │   │   └── 📁 schemas - Directory.
│   │   │   │   │       └── 📄 task-schema.ts - Data validation schema.
│   │   │   │   ├── 📁 dashboard-2 - Directory.
│   │   │   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   │   │   ├── 📄 customer-insights.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 dashboard-header.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 metrics-overview.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 quick-actions.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 recent-transactions.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 revenue-breakdown.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 sales-chart.tsx - Reusable UI component.
│   │   │   │   │   │   └── 📄 top-products.tsx - Reusable UI component.
│   │   │   │   │   ├── 📁 data - Static or mock data.
│   │   │   │   │   │   └── 📄 dashboard-data.json - Mock JSON data.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📁 faqs - Directory.
│   │   │   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   │   │   ├── 📄 faq-list.tsx - Reusable UI component.
│   │   │   │   │   │   └── 📄 features-grid.tsx - Reusable UI component.
│   │   │   │   │   ├── 📁 data - Static or mock data.
│   │   │   │   │   │   ├── 📄 categories.json - Mock JSON data.
│   │   │   │   │   │   ├── 📄 faqs.json - Mock JSON data.
│   │   │   │   │   │   └── 📄 features.json - Mock JSON data.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📄 layout.tsx - Layout wrapper for this route.
│   │   │   │   ├── 📁 mail - Directory.
│   │   │   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   │   │   ├── 📄 account-switcher.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 mail-display.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 mail-list.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 mail.tsx - Reusable UI component.
│   │   │   │   │   │   └── 📄 nav.tsx - Reusable UI component.
│   │   │   │   │   ├── 📄 data.tsx - TypeScript file.
│   │   │   │   │   ├── 📄 index.tsx - TypeScript file.
│   │   │   │   │   ├── 📄 page.tsx - Main page UI component.
│   │   │   │   │   └── 📄 use-mail.ts - TypeScript file.
│   │   │   │   ├── 📁 pricing - Directory.
│   │   │   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   │   │   ├── 📄 faq-section.tsx - Reusable UI component.
│   │   │   │   │   │   └── 📄 features-grid.tsx - Reusable UI component.
│   │   │   │   │   ├── 📁 data - Static or mock data.
│   │   │   │   │   │   ├── 📄 faqs.json - Mock JSON data.
│   │   │   │   │   │   └── 📄 features.json - Mock JSON data.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📁 settings - Directory.
│   │   │   │   │   ├── 📁 account - Directory.
│   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   ├── 📁 appearance - Directory.
│   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   ├── 📁 billing - Directory.
│   │   │   │   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   │   │   │   ├── 📄 billing-history-card.tsx - Reusable UI component.
│   │   │   │   │   │   │   └── 📄 current-plan-card.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📁 data - Static or mock data.
│   │   │   │   │   │   │   ├── 📄 billing-history.json - Mock JSON data.
│   │   │   │   │   │   │   └── 📄 current-plan.json - Mock JSON data.
│   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   ├── 📁 connections - Directory.
│   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   ├── 📁 notifications - Directory.
│   │   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   │   └── 📁 user - Directory.
│   │   │   │   │       └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📁 tasks - Directory.
│   │   │   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   │   │   ├── 📄 add-task-modal.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 columns.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 data-table-column-header.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 data-table-faceted-filter.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 data-table-pagination.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 data-table-row-actions.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 data-table-toolbar.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 data-table-view-options.tsx - Reusable UI component.
│   │   │   │   │   │   ├── 📄 data-table.tsx - Reusable UI component.
│   │   │   │   │   │   └── 📄 user-nav.tsx - Reusable UI component.
│   │   │   │   │   ├── 📁 data - Static or mock data.
│   │   │   │   │   │   ├── 📄 data.tsx - TypeScript file.
│   │   │   │   │   │   ├── 📄 schema.ts - Data validation schema.
│   │   │   │   │   │   └── 📄 tasks.json - Mock JSON data.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   └── 📁 users - Directory.
│   │   │   │       ├── 📁 components - Reusable UI and feature components.
│   │   │   │       │   ├── 📄 data-table.tsx - Reusable UI component.
│   │   │   │       │   ├── 📄 stat-cards.tsx - Reusable UI component.
│   │   │   │       │   └── 📄 user-form-dialog.tsx - Reusable UI component.
│   │   │   │       ├── 📄 data.json - Mock JSON data.
│   │   │   │       └── 📄 page.tsx - Main page UI component.
│   │   │   ├── 📄 favicon.ico - File.
│   │   │   ├── 📄 globals.css - Styles / Tailwind directives.
│   │   │   ├── 📁 landing - Landing page feature module.
│   │   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   │   ├── 📄 about-section.tsx - Reusable UI component.
│   │   │   │   │   ├── 📄 blog-section.tsx - Reusable UI component.
│   │   │   │   │   ├── 📄 contact-section.tsx - Reusable UI component.
│   │   │   │   │   ├── 📄 cta-section.tsx - Reusable UI component.
│   │   │   │   │   ├── 📄 faq-section.tsx - Reusable UI component.
│   │   │   │   │   ├── 📄 features-section.tsx - Reusable UI component.
│   │   │   │   │   ├── 📄 footer.tsx - Reusable UI component.
│   │   │   │   │   ├── 📄 hero-section.tsx - Reusable UI component.
│   │   │   │   │   ├── 📄 landing-theme-customizer.tsx - Reusable UI component.
│   │   │   │   │   ├── 📄 logo-carousel.tsx - Reusable UI component.
│   │   │   │   │   ├── 📄 navbar.tsx - Reusable UI component.
│   │   │   │   │   ├── 📄 pricing-section.tsx - Reusable UI component.
│   │   │   │   │   ├── 📄 stats-section.tsx - Reusable UI component.
│   │   │   │   │   ├── 📄 team-section.tsx - Reusable UI component.
│   │   │   │   │   └── 📄 testimonials-section.tsx - Reusable UI component.
│   │   │   │   ├── 📄 landing-page-content.tsx - Main page UI component.
│   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   ├── 📄 layout.tsx - Layout wrapper for this route.
│   │   │   ├── 📄 loading.tsx - TypeScript file.
│   │   │   ├── 📄 not-found.tsx - TypeScript file.
│   │   │   └── 📄 page.tsx - Main page UI component.
│   │   ├── 📁 assets - Directory.
│   │   │   └── 📄 react.svg - File.
│   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   ├── 📄 app-sidebar.tsx - Reusable UI component.
│   │   │   ├── 📄 color-picker.tsx - Reusable UI component.
│   │   │   ├── 📄 command-search.tsx - Reusable UI component.
│   │   │   ├── 📄 dot-pattern.tsx - Reusable UI component.
│   │   │   ├── 📄 dynamic-imports.ts - Reusable UI component.
│   │   │   ├── 📄 image-3d.tsx - Reusable UI component.
│   │   │   ├── 📁 landing - Landing page feature module.
│   │   │   │   └── 📄 mega-menu.tsx - Reusable UI component.
│   │   │   ├── 📁 layouts - Directory.
│   │   │   │   └── 📄 base-layout.tsx - Layout wrapper for this route.
│   │   │   ├── 📄 logo.tsx - Reusable UI component.
│   │   │   ├── 📄 mode-toggle.tsx - Reusable UI component.
│   │   │   ├── 📄 nav-main.tsx - Reusable UI component.
│   │   │   ├── 📄 nav-secondary.tsx - Reusable UI component.
│   │   │   ├── 📄 nav-user.tsx - Reusable UI component.
│   │   │   ├── 📄 pricing-plans.tsx - Reusable UI component.
│   │   │   ├── 📄 sidebar-notification.tsx - Reusable UI component.
│   │   │   ├── 📄 site-footer.tsx - Reusable UI component.
│   │   │   ├── 📄 site-header.tsx - Reusable UI component.
│   │   │   ├── 📁 theme-customizer - Directory.
│   │   │   │   ├── 📄 circular-transition.css - Styles / Tailwind directives.
│   │   │   │   ├── 📄 import-modal.tsx - Reusable UI component.
│   │   │   │   ├── 📄 index.tsx - Reusable UI component.
│   │   │   │   ├── 📄 layout-tab.tsx - Layout wrapper for this route.
│   │   │   │   ├── 📄 main.tsx - Reusable UI component.
│   │   │   │   └── 📄 theme-tab.tsx - Reusable UI component.
│   │   │   ├── 📄 theme-customizer.tsx - Reusable UI component.
│   │   │   ├── 📄 theme-provider.tsx - Reusable UI component.
│   │   │   ├── 📁 ui - Base Shadcn UI components.
│   │   │   │   ├── 📄 accordion.tsx - Reusable UI component.
│   │   │   │   ├── 📄 avatar.tsx - Reusable UI component.
│   │   │   │   ├── 📄 badge.tsx - Reusable UI component.
│   │   │   │   ├── 📄 breadcrumb.tsx - Reusable UI component.
│   │   │   │   ├── 📄 button.tsx - Reusable UI component.
│   │   │   │   ├── 📄 calendar.tsx - Reusable UI component.
│   │   │   │   ├── 📄 card-decorator.tsx - Reusable UI component.
│   │   │   │   ├── 📄 card.tsx - Reusable UI component.
│   │   │   │   ├── 📄 chart.tsx - Reusable UI component.
│   │   │   │   ├── 📄 checkbox.tsx - Reusable UI component.
│   │   │   │   ├── 📄 collapsible.tsx - Reusable UI component.
│   │   │   │   ├── 📄 command.tsx - Reusable UI component.
│   │   │   │   ├── 📄 dialog.tsx - Reusable UI component.
│   │   │   │   ├── 📄 drawer.tsx - Reusable UI component.
│   │   │   │   ├── 📄 dropdown-menu.tsx - Reusable UI component.
│   │   │   │   ├── 📄 form.tsx - Reusable UI component.
│   │   │   │   ├── 📄 hover-card.tsx - Reusable UI component.
│   │   │   │   ├── 📄 input.tsx - Reusable UI component.
│   │   │   │   ├── 📄 label.tsx - Reusable UI component.
│   │   │   │   ├── 📄 loading-spinner.tsx - Reusable UI component.
│   │   │   │   ├── 📄 navigation-menu.tsx - Reusable UI component.
│   │   │   │   ├── 📄 popover.tsx - Reusable UI component.
│   │   │   │   ├── 📄 progress.tsx - Reusable UI component.
│   │   │   │   ├── 📄 radio-group.tsx - Reusable UI component.
│   │   │   │   ├── 📄 resizable.tsx - Reusable UI component.
│   │   │   │   ├── 📄 scroll-area.tsx - Reusable UI component.
│   │   │   │   ├── 📄 select.tsx - Reusable UI component.
│   │   │   │   ├── 📄 separator.tsx - Reusable UI component.
│   │   │   │   ├── 📄 sheet.tsx - Reusable UI component.
│   │   │   │   ├── 📄 sidebar.tsx - Reusable UI component.
│   │   │   │   ├── 📄 skeleton.tsx - Reusable UI component.
│   │   │   │   ├── 📄 sonner.tsx - Reusable UI component.
│   │   │   │   ├── 📄 switch.tsx - Reusable UI component.
│   │   │   │   ├── 📄 table.tsx - Reusable UI component.
│   │   │   │   ├── 📄 tabs.tsx - Reusable UI component.
│   │   │   │   ├── 📄 textarea.tsx - Reusable UI component.
│   │   │   │   ├── 📄 toggle-group.tsx - Reusable UI component.
│   │   │   │   ├── 📄 toggle.tsx - Reusable UI component.
│   │   │   │   └── 📄 tooltip.tsx - Reusable UI component.
│   │   │   └── 📄 upgrade-to-pro-button.tsx - Reusable UI component.
│   │   ├── 📁 config - Directory.
│   │   │   ├── 📄 theme-customizer-constants.ts - TypeScript file.
│   │   │   └── 📄 theme-data.ts - TypeScript file.
│   │   ├── 📁 contexts - React Context providers.
│   │   │   ├── 📄 sidebar-context.tsx - TypeScript file.
│   │   │   └── 📄 theme-context.ts - TypeScript file.
│   │   ├── 📁 hooks - React custom hooks.
│   │   │   ├── 📄 use-circular-transition.ts - Custom React hook logic.
│   │   │   ├── 📄 use-fullscreen.ts - Custom React hook logic.
│   │   │   ├── 📄 use-mobile.ts - Custom React hook logic.
│   │   │   ├── 📄 use-sidebar-config.ts - Custom React hook logic.
│   │   │   ├── 📄 use-theme-manager.ts - Custom React hook logic.
│   │   │   └── 📄 use-theme.ts - Custom React hook logic.
│   │   ├── 📁 lib - Utility functions and helpers.
│   │   │   ├── 📄 fonts.ts - Utility functions.
│   │   │   └── 📄 utils.ts - Utility functions.
│   │   ├── 📄 middleware.ts - TypeScript file.
│   │   ├── 📁 types - TypeScript type definitions.
│   │   │   ├── 📄 theme-customizer.ts - TypeScript file.
│   │   │   └── 📄 theme.ts - TypeScript file.
│   │   └── 📁 utils - Utility functions and helpers.
│   │       ├── 📄 shadcn-ui-theme-presets.ts - Utility functions.
│   │       └── 📄 tweakcn-theme-presets.ts - Utility functions.
│   └── 📄 tsconfig.json - JSON configuration or data file.
└── 📁 vite-version - Directory.
    ├── 📄 .env.example - File.
    ├── 📄 components.json - Shadcn UI configuration.
    ├── 📄 eslint.config.js - Configuration file.
    ├── 📄 index.html - File.
    ├── 📄 package.json - NPM dependencies and scripts.
    ├── 📄 pnpm-lock.yaml - File.
    ├── 📁 src - Directory.
    │   ├── 📄 App.css - Styles / Tailwind directives.
    │   ├── 📄 App.tsx - TypeScript file.
    │   ├── 📁 app - Next.js App Router root directory.
    │   │   ├── 📁 auth - Authentication feature module.
    │   │   │   ├── 📁 forgot-password - Directory.
    │   │   │   │   ├── 📁 components - Reusable UI and feature components.
    │   │   │   │   │   └── 📄 forgot-password-form-1.tsx - Reusable UI component.
    │   │   │   │   └── 📄 page.tsx - Main page UI component.
    │   │   │   ├── 📁 forgot-password-2 - Directory.
    │   │   │   │   ├── 📁 components - Reusable UI and feature components.
    │   │   │   │   │   └── 📄 forgot-password-form-2.tsx - Reusable UI component.
    │   │   │   │   └── 📄 page.tsx - Main page UI component.
    │   │   │   ├── 📁 forgot-password-3 - Directory.
    │   │   │   │   ├── 📁 components - Reusable UI and feature components.
    │   │   │   │   │   └── 📄 forgot-password-form-3.tsx - Reusable UI component.
    │   │   │   │   └── 📄 page.tsx - Main page UI component.
    │   │   │   ├── 📁 sign-in - Directory.
    │   │   │   │   ├── 📁 components - Reusable UI and feature components.
    │   │   │   │   │   └── 📄 login-form-1.tsx - Reusable UI component.
    │   │   │   │   └── 📄 page.tsx - Main page UI component.
    │   │   │   ├── 📁 sign-in-2 - Directory.
    │   │   │   │   ├── 📁 components - Reusable UI and feature components.
    │   │   │   │   │   └── 📄 login-form-2.tsx - Reusable UI component.
    │   │   │   │   └── 📄 page.tsx - Main page UI component.
    │   │   │   ├── 📁 sign-in-3 - Directory.
    │   │   │   │   ├── 📁 components - Reusable UI and feature components.
    │   │   │   │   │   └── 📄 login-form-3.tsx - Reusable UI component.
    │   │   │   │   └── 📄 page.tsx - Main page UI component.
    │   │   │   ├── 📁 sign-up - Directory.
    │   │   │   │   ├── 📁 components - Reusable UI and feature components.
    │   │   │   │   │   └── 📄 signup-form-1.tsx - Reusable UI component.
    │   │   │   │   └── 📄 page.tsx - Main page UI component.
    │   │   │   ├── 📁 sign-up-2 - Directory.
    │   │   │   │   ├── 📁 components - Reusable UI and feature components.
    │   │   │   │   │   └── 📄 signup-form-2.tsx - Reusable UI component.
    │   │   │   │   └── 📄 page.tsx - Main page UI component.
    │   │   │   └── 📁 sign-up-3 - Directory.
    │   │   │       ├── 📁 components - Reusable UI and feature components.
    │   │   │       │   └── 📄 signup-form-3.tsx - Reusable UI component.
    │   │   │       └── 📄 page.tsx - Main page UI component.
    │   │   ├── 📁 calendar - Directory.
    │   │   │   ├── 📁 components - Reusable UI and feature components.
    │   │   │   │   ├── 📄 calendar-main.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 calendar-sidebar.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 calendar-unified.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 calendar.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 calendars.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 date-picker.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 event-form.tsx - Reusable UI component.
    │   │   │   │   └── 📄 quick-actions.tsx - Reusable UI component.
    │   │   │   ├── 📁 data - Static or mock data.
    │   │   │   │   ├── 📄 calendars.json - Mock JSON data.
    │   │   │   │   ├── 📄 event-dates.json - Mock JSON data.
    │   │   │   │   └── 📄 events.json - Mock JSON data.
    │   │   │   ├── 📄 data.ts - TypeScript file.
    │   │   │   ├── 📄 page.tsx - Main page UI component.
    │   │   │   ├── 📄 types.ts - TypeScript file.
    │   │   │   └── 📄 use-calendar.ts - TypeScript file.
    │   │   ├── 📁 chat - Directory.
    │   │   │   ├── 📁 components - Reusable UI and feature components.
    │   │   │   │   ├── 📄 chat-header.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 chat.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 conversation-list-new.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 conversation-list.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 message-input.tsx - Reusable UI component.
    │   │   │   │   └── 📄 message-list.tsx - Reusable UI component.
    │   │   │   ├── 📁 data - Static or mock data.
    │   │   │   │   ├── 📄 conversations.json - Mock JSON data.
    │   │   │   │   ├── 📄 messages.json - Mock JSON data.
    │   │   │   │   └── 📄 users.json - Mock JSON data.
    │   │   │   ├── 📄 page.tsx - Main page UI component.
    │   │   │   └── 📄 use-chat.ts - TypeScript file.
    │   │   ├── 📁 dashboard - Dashboard feature module.
    │   │   │   ├── 📁 components - Reusable UI and feature components.
    │   │   │   │   ├── 📄 chart-area-interactive.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 data-table.tsx - Reusable UI component.
    │   │   │   │   └── 📄 section-cards.tsx - Reusable UI component.
    │   │   │   ├── 📁 data - Static or mock data.
    │   │   │   │   ├── 📄 data.json - Mock JSON data.
    │   │   │   │   ├── 📄 focus-documents-data.json - Mock JSON data.
    │   │   │   │   ├── 📄 key-personnel-data.json - Mock JSON data.
    │   │   │   │   └── 📄 past-performance-data.json - Mock JSON data.
    │   │   │   ├── 📄 page.tsx - Main page UI component.
    │   │   │   └── 📁 schemas - Directory.
    │   │   │       └── 📄 task-schema.ts - Data validation schema.
    │   │   ├── 📁 dashboard-2 - Directory.
    │   │   │   ├── 📁 components - Reusable UI and feature components.
    │   │   │   │   ├── 📄 customer-insights.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 dashboard-header.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 metrics-overview.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 quick-actions.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 recent-transactions.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 revenue-breakdown.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 sales-chart.tsx - Reusable UI component.
    │   │   │   │   └── 📄 top-products.tsx - Reusable UI component.
    │   │   │   ├── 📁 data - Static or mock data.
    │   │   │   │   └── 📄 dashboard-data.json - Mock JSON data.
    │   │   │   └── 📄 page.tsx - Main page UI component.
    │   │   ├── 📁 errors - Directory.
    │   │   │   ├── 📁 forbidden - Directory.
    │   │   │   │   ├── 📁 components - Reusable UI and feature components.
    │   │   │   │   │   └── 📄 forbidden-error.tsx - Reusable UI component.
    │   │   │   │   └── 📄 page.tsx - Main page UI component.
    │   │   │   ├── 📁 internal-server-error - Directory.
    │   │   │   │   ├── 📁 components - Reusable UI and feature components.
    │   │   │   │   │   └── 📄 internal-server-error.tsx - Reusable UI component.
    │   │   │   │   └── 📄 page.tsx - Main page UI component.
    │   │   │   ├── 📁 not-found - Directory.
    │   │   │   │   ├── 📁 components - Reusable UI and feature components.
    │   │   │   │   │   └── 📄 not-found-error.tsx - Reusable UI component.
    │   │   │   │   └── 📄 page.tsx - Main page UI component.
    │   │   │   ├── 📁 unauthorized - Directory.
    │   │   │   │   ├── 📁 components - Reusable UI and feature components.
    │   │   │   │   │   └── 📄 unauthorized-error.tsx - Reusable UI component.
    │   │   │   │   └── 📄 page.tsx - Main page UI component.
    │   │   │   └── 📁 under-maintenance - Directory.
    │   │   │       ├── 📁 components - Reusable UI and feature components.
    │   │   │       │   └── 📄 under-maintenance-error.tsx - Reusable UI component.
    │   │   │       └── 📄 page.tsx - Main page UI component.
    │   │   ├── 📁 faqs - Directory.
    │   │   │   ├── 📁 components - Reusable UI and feature components.
    │   │   │   │   ├── 📄 faq-list.tsx - Reusable UI component.
    │   │   │   │   └── 📄 features-grid.tsx - Reusable UI component.
    │   │   │   ├── 📁 data - Static or mock data.
    │   │   │   │   ├── 📄 categories.json - Mock JSON data.
    │   │   │   │   ├── 📄 faqs.json - Mock JSON data.
    │   │   │   │   └── 📄 features.json - Mock JSON data.
    │   │   │   └── 📄 page.tsx - Main page UI component.
    │   │   ├── 📁 landing - Landing page feature module.
    │   │   │   ├── 📁 components - Reusable UI and feature components.
    │   │   │   │   ├── 📄 about-section.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 blog-section.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 contact-section.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 cta-section.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 faq-section.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 features-section.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 footer.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 hero-section.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 landing-theme-customizer.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 logo-carousel.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 navbar.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 pricing-section.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 stats-section.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 team-section.tsx - Reusable UI component.
    │   │   │   │   └── 📄 testimonials-section.tsx - Reusable UI component.
    │   │   │   └── 📄 page.tsx - Main page UI component.
    │   │   ├── 📁 mail - Directory.
    │   │   │   ├── 📁 components - Reusable UI and feature components.
    │   │   │   │   ├── 📄 account-switcher.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 mail-display.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 mail-list.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 mail.tsx - Reusable UI component.
    │   │   │   │   └── 📄 nav.tsx - Reusable UI component.
    │   │   │   ├── 📄 data.tsx - TypeScript file.
    │   │   │   ├── 📄 index.tsx - TypeScript file.
    │   │   │   ├── 📄 page.tsx - Main page UI component.
    │   │   │   └── 📄 use-mail.ts - TypeScript file.
    │   │   ├── 📁 pricing - Directory.
    │   │   │   ├── 📁 components - Reusable UI and feature components.
    │   │   │   │   ├── 📄 faq-section.tsx - Reusable UI component.
    │   │   │   │   └── 📄 features-grid.tsx - Reusable UI component.
    │   │   │   ├── 📁 data - Static or mock data.
    │   │   │   │   ├── 📄 faqs.json - Mock JSON data.
    │   │   │   │   └── 📄 features.json - Mock JSON data.
    │   │   │   └── 📄 page.tsx - Main page UI component.
    │   │   ├── 📁 settings - Directory.
    │   │   │   ├── 📁 account - Directory.
    │   │   │   │   └── 📄 page.tsx - Main page UI component.
    │   │   │   ├── 📁 appearance - Directory.
    │   │   │   │   └── 📄 page.tsx - Main page UI component.
    │   │   │   ├── 📁 billing - Directory.
    │   │   │   │   ├── 📁 components - Reusable UI and feature components.
    │   │   │   │   │   ├── 📄 billing-history-card.tsx - Reusable UI component.
    │   │   │   │   │   └── 📄 current-plan-card.tsx - Reusable UI component.
    │   │   │   │   ├── 📁 data - Static or mock data.
    │   │   │   │   │   ├── 📄 billing-history.json - Mock JSON data.
    │   │   │   │   │   └── 📄 current-plan.json - Mock JSON data.
    │   │   │   │   └── 📄 page.tsx - Main page UI component.
    │   │   │   ├── 📁 connections - Directory.
    │   │   │   │   └── 📄 page.tsx - Main page UI component.
    │   │   │   ├── 📁 notifications - Directory.
    │   │   │   │   └── 📄 page.tsx - Main page UI component.
    │   │   │   └── 📁 user - Directory.
    │   │   │       └── 📄 page.tsx - Main page UI component.
    │   │   ├── 📁 tasks - Directory.
    │   │   │   ├── 📁 components - Reusable UI and feature components.
    │   │   │   │   ├── 📄 add-task-modal.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 columns.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 data-table-column-header.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 data-table-faceted-filter.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 data-table-pagination.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 data-table-row-actions.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 data-table-toolbar.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 data-table-view-options.tsx - Reusable UI component.
    │   │   │   │   ├── 📄 data-table.tsx - Reusable UI component.
    │   │   │   │   └── 📄 user-nav.tsx - Reusable UI component.
    │   │   │   ├── 📁 data - Static or mock data.
    │   │   │   │   ├── 📄 data.tsx - TypeScript file.
    │   │   │   │   ├── 📄 schema.ts - Data validation schema.
    │   │   │   │   └── 📄 tasks.json - Mock JSON data.
    │   │   │   └── 📄 page.tsx - Main page UI component.
    │   │   └── 📁 users - Directory.
    │   │       ├── 📁 components - Reusable UI and feature components.
    │   │       │   ├── 📄 data-table.tsx - Reusable UI component.
    │   │       │   ├── 📄 stat-cards.tsx - Reusable UI component.
    │   │       │   └── 📄 user-form-dialog.tsx - Reusable UI component.
    │   │       ├── 📄 data.json - Mock JSON data.
    │   │       └── 📄 page.tsx - Main page UI component.
    │   ├── 📁 assets - Directory.
    │   │   └── 📄 react.svg - File.
    │   ├── 📁 components - Reusable UI and feature components.
    │   │   ├── 📄 app-sidebar.tsx - Reusable UI component.
    │   │   ├── 📄 color-picker.tsx - Reusable UI component.
    │   │   ├── 📄 command-search.tsx - Reusable UI component.
    │   │   ├── 📄 dot-pattern.md - Markdown documentation or content.
    │   │   ├── 📄 dot-pattern.tsx - Reusable UI component.
    │   │   ├── 📄 image-3d.md - Markdown documentation or content.
    │   │   ├── 📄 image-3d.tsx - Reusable UI component.
    │   │   ├── 📁 landing - Landing page feature module.
    │   │   │   └── 📄 mega-menu.tsx - Reusable UI component.
    │   │   ├── 📁 layouts - Directory.
    │   │   │   └── 📄 base-layout.tsx - Layout wrapper for this route.
    │   │   ├── 📄 logo.tsx - Reusable UI component.
    │   │   ├── 📄 mode-toggle.tsx - Reusable UI component.
    │   │   ├── 📄 nav-main.tsx - Reusable UI component.
    │   │   ├── 📄 nav-secondary.tsx - Reusable UI component.
    │   │   ├── 📄 nav-user.tsx - Reusable UI component.
    │   │   ├── 📄 pricing-plans.tsx - Reusable UI component.
    │   │   ├── 📁 router - Directory.
    │   │   │   └── 📄 app-router.tsx - API endpoint.
    │   │   ├── 📄 sidebar-notification.tsx - Reusable UI component.
    │   │   ├── 📄 site-footer.tsx - Reusable UI component.
    │   │   ├── 📄 site-header.tsx - Reusable UI component.
    │   │   ├── 📁 theme-customizer - Directory.
    │   │   │   ├── 📄 circular-transition.css - Styles / Tailwind directives.
    │   │   │   ├── 📄 import-modal.tsx - Reusable UI component.
    │   │   │   ├── 📄 index.tsx - Reusable UI component.
    │   │   │   ├── 📄 layout-tab.tsx - Layout wrapper for this route.
    │   │   │   ├── 📄 main.tsx - Reusable UI component.
    │   │   │   └── 📄 theme-tab.tsx - Reusable UI component.
    │   │   ├── 📄 theme-customizer.tsx - Reusable UI component.
    │   │   ├── 📄 theme-provider.tsx - Reusable UI component.
    │   │   ├── 📁 ui - Base Shadcn UI components.
    │   │   │   ├── 📄 accordion.tsx - Reusable UI component.
    │   │   │   ├── 📄 avatar.tsx - Reusable UI component.
    │   │   │   ├── 📄 badge.tsx - Reusable UI component.
    │   │   │   ├── 📄 breadcrumb.tsx - Reusable UI component.
    │   │   │   ├── 📄 button.tsx - Reusable UI component.
    │   │   │   ├── 📄 calendar.tsx - Reusable UI component.
    │   │   │   ├── 📄 card-decorator.tsx - Reusable UI component.
    │   │   │   ├── 📄 card.tsx - Reusable UI component.
    │   │   │   ├── 📄 chart.tsx - Reusable UI component.
    │   │   │   ├── 📄 checkbox.tsx - Reusable UI component.
    │   │   │   ├── 📄 collapsible.tsx - Reusable UI component.
    │   │   │   ├── 📄 command.tsx - Reusable UI component.
    │   │   │   ├── 📄 dialog.tsx - Reusable UI component.
    │   │   │   ├── 📄 drawer.tsx - Reusable UI component.
    │   │   │   ├── 📄 dropdown-menu.tsx - Reusable UI component.
    │   │   │   ├── 📄 form.tsx - Reusable UI component.
    │   │   │   ├── 📄 hover-card.tsx - Reusable UI component.
    │   │   │   ├── 📄 input.tsx - Reusable UI component.
    │   │   │   ├── 📄 label.tsx - Reusable UI component.
    │   │   │   ├── 📄 loading-spinner.tsx - Reusable UI component.
    │   │   │   ├── 📄 navigation-menu.tsx - Reusable UI component.
    │   │   │   ├── 📄 popover.tsx - Reusable UI component.
    │   │   │   ├── 📄 progress.tsx - Reusable UI component.
    │   │   │   ├── 📄 radio-group.tsx - Reusable UI component.
    │   │   │   ├── 📄 resizable.tsx - Reusable UI component.
    │   │   │   ├── 📄 scroll-area.tsx - Reusable UI component.
    │   │   │   ├── 📄 select.tsx - Reusable UI component.
    │   │   │   ├── 📄 separator.tsx - Reusable UI component.
    │   │   │   ├── 📄 sheet.tsx - Reusable UI component.
    │   │   │   ├── 📄 sidebar.tsx - Reusable UI component.
    │   │   │   ├── 📄 skeleton.tsx - Reusable UI component.
    │   │   │   ├── 📄 sonner.tsx - Reusable UI component.
    │   │   │   ├── 📄 switch.tsx - Reusable UI component.
    │   │   │   ├── 📄 table.tsx - Reusable UI component.
    │   │   │   ├── 📄 tabs.tsx - Reusable UI component.
    │   │   │   ├── 📄 textarea.tsx - Reusable UI component.
    │   │   │   ├── 📄 toggle-group.tsx - Reusable UI component.
    │   │   │   ├── 📄 toggle.tsx - Reusable UI component.
    │   │   │   └── 📄 tooltip.tsx - Reusable UI component.
    │   │   └── 📄 upgrade-to-pro-button.tsx - Reusable UI component.
    │   ├── 📁 config - Directory.
    │   │   ├── 📄 routes.tsx - API endpoint.
    │   │   ├── 📄 theme-customizer-constants.ts - TypeScript file.
    │   │   └── 📄 theme-data.ts - TypeScript file.
    │   ├── 📁 contexts - React Context providers.
    │   │   ├── 📄 sidebar-context.tsx - TypeScript file.
    │   │   └── 📄 theme-context.ts - TypeScript file.
    │   ├── 📁 hooks - React custom hooks.
    │   │   ├── 📄 use-circular-transition.ts - Custom React hook logic.
    │   │   ├── 📄 use-fullscreen.ts - Custom React hook logic.
    │   │   ├── 📄 use-mobile.ts - Custom React hook logic.
    │   │   ├── 📄 use-sidebar-config.ts - Custom React hook logic.
    │   │   ├── 📄 use-theme-manager.ts - Custom React hook logic.
    │   │   └── 📄 use-theme.ts - Custom React hook logic.
    │   ├── 📄 index.css - Styles / Tailwind directives.
    │   ├── 📁 lib - Utility functions and helpers.
    │   │   ├── 📄 fonts.ts - Utility functions.
    │   │   └── 📄 utils.ts - Utility functions.
    │   ├── 📄 main.tsx - TypeScript file.
    │   ├── 📁 types - TypeScript type definitions.
    │   │   ├── 📄 theme-customizer.ts - TypeScript file.
    │   │   └── 📄 theme.ts - TypeScript file.
    │   ├── 📁 utils - Utility functions and helpers.
    │   │   ├── 📄 analytics.ts - Utility functions.
    │   │   ├── 📄 shadcn-ui-theme-presets.ts - Utility functions.
    │   │   └── 📄 tweakcn-theme-presets.ts - Utility functions.
    │   └── 📄 vite-env.d.ts - TypeScript file.
    ├── 📄 tsconfig.app.json - JSON configuration or data file.
    ├── 📄 tsconfig.json - JSON configuration or data file.
    ├── 📄 tsconfig.node.json - JSON configuration or data file.
    └── 📄 vite.config.ts - TypeScript file.
```

### Summary of `shadcnstore`
- **Primary Use:** Reference for specific UI or layout aspects.
- **Integration Strategy:** Copy the relevant components (`.tsx`) into Orbitly's `core/` or `features/` folders, updating imports to match our colocation architecture. Re-wire mock JSON data to Convex queries.

---

## SHADCN-DASHBOARD-2

```text
├── 📁 .agents - Directory.
│   └── 📁 skills - Directory.
│       ├── 📁 find-skills - Directory.
│       │   └── 📄 SKILL.md - Markdown documentation or content.
│       ├── 📁 frontend-design - Directory.
│       │   ├── 📄 LICENSE.txt - File.
│       │   └── 📄 SKILL.md - Markdown documentation or content.
│       ├── 📁 kiranism-shadcn-dashboard - Directory.
│       │   ├── 📄 SKILL.md - Markdown documentation or content.
│       │   └── 📁 references - Directory.
│       │       ├── 📄 charts-guide.md - Markdown documentation or content.
│       │       ├── 📄 forms-guide.md - Markdown documentation or content.
│       │       ├── 📄 mock-api-guide.md - Markdown documentation or content.
│       │       ├── 📄 query-abstractions.md - Markdown documentation or content.
│       │       └── 📄 theming-guide.md - Markdown documentation or content.
│       ├── 📁 next-best-practices - Directory.
│       │   ├── 📄 SKILL.md - Markdown documentation or content.
│       │   ├── 📄 async-patterns.md - Markdown documentation or content.
│       │   ├── 📄 bundling.md - Markdown documentation or content.
│       │   ├── 📄 data-patterns.md - Markdown documentation or content.
│       │   ├── 📄 debug-tricks.md - Markdown documentation or content.
│       │   ├── 📄 directives.md - Markdown documentation or content.
│       │   ├── 📄 error-handling.md - Markdown documentation or content.
│       │   ├── 📄 file-conventions.md - Markdown documentation or content.
│       │   ├── 📄 font.md - Markdown documentation or content.
│       │   ├── 📄 functions.md - Markdown documentation or content.
│       │   ├── 📄 hydration-error.md - Markdown documentation or content.
│       │   ├── 📄 image.md - Markdown documentation or content.
│       │   ├── 📄 metadata.md - Markdown documentation or content.
│       │   ├── 📄 parallel-routes.md - Markdown documentation or content.
│       │   ├── 📄 route-handlers.md - Markdown documentation or content.
│       │   ├── 📄 rsc-boundaries.md - Markdown documentation or content.
│       │   ├── 📄 runtime-selection.md - Markdown documentation or content.
│       │   ├── 📄 scripts.md - Markdown documentation or content.
│       │   ├── 📄 self-hosting.md - Markdown documentation or content.
│       │   └── 📄 suspense-boundaries.md - Markdown documentation or content.
│       ├── 📁 shadcn - Directory.
│       │   ├── 📄 SKILL.md - Markdown documentation or content.
│       │   ├── 📁 agents - Directory.
│       │   │   └── 📄 openai.yml - File.
│       │   ├── 📁 assets - Directory.
│       │   │   ├── 📄 shadcn-small.png - File.
│       │   │   └── 📄 shadcn.png - File.
│       │   ├── 📄 cli.md - Markdown documentation or content.
│       │   ├── 📄 customization.md - Markdown documentation or content.
│       │   ├── 📁 evals - Directory.
│       │   │   └── 📄 evals.json - JSON configuration or data file.
│       │   ├── 📄 mcp.md - Markdown documentation or content.
│       │   └── 📁 rules - Directory.
│       │       ├── 📄 base-vs-radix.md - Markdown documentation or content.
│       │       ├── 📄 composition.md - Markdown documentation or content.
│       │       ├── 📄 forms.md - Markdown documentation or content.
│       │       ├── 📄 icons.md - Markdown documentation or content.
│       │       └── 📄 styling.md - Markdown documentation or content.
│       ├── 📁 skill-creator - Directory.
│       │   ├── 📄 LICENSE.txt - File.
│       │   ├── 📄 SKILL.md - Markdown documentation or content.
│       │   ├── 📁 agents - Directory.
│       │   │   ├── 📄 analyzer.md - Markdown documentation or content.
│       │   │   ├── 📄 comparator.md - Markdown documentation or content.
│       │   │   └── 📄 grader.md - Markdown documentation or content.
│       │   ├── 📁 assets - Directory.
│       │   │   └── 📄 eval_review.html - File.
│       │   ├── 📁 eval-viewer - Directory.
│       │   │   ├── 📄 generate_review.py - File.
│       │   │   └── 📄 viewer.html - File.
│       │   ├── 📁 references - Directory.
│       │   │   └── 📄 schemas.md - Markdown documentation or content.
│       │   └── 📁 scripts - Directory.
│       │       ├── 📄 __init__.py - File.
│       │       ├── 📄 aggregate_benchmark.py - File.
│       │       ├── 📄 generate_report.py - File.
│       │       ├── 📄 improve_description.py - File.
│       │       ├── 📄 package_skill.py - File.
│       │       ├── 📄 quick_validate.py - File.
│       │       ├── 📄 run_eval.py - File.
│       │       ├── 📄 run_loop.py - File.
│       │       └── 📄 utils.py - File.
│       ├── 📁 tanstack-form - Directory.
│       │   └── 📄 SKILL.md - Markdown documentation or content.
│       ├── 📁 tanstack-query - Directory.
│       │   ├── 📄 SKILL.md - Markdown documentation or content.
│       │   ├── 📁 resources - Directory.
│       │   │   ├── 📄 cache-strategies.md - Markdown documentation or content.
│       │   │   ├── 📄 data-fetching.md - Markdown documentation or content.
│       │   │   └── 📄 mutation-patterns.md - Markdown documentation or content.
│       │   └── 📄 skill-rules-fragment.json - JSON configuration or data file.
│       ├── 📁 vercel-composition-patterns - Directory.
│       │   ├── 📄 AGENTS.md - Markdown documentation or content.
│       │   ├── 📄 README.md - Markdown documentation or content.
│       │   ├── 📄 SKILL.md - Markdown documentation or content.
│       │   └── 📁 rules - Directory.
│       │       ├── 📄 _sections.md - Markdown documentation or content.
│       │       ├── 📄 _template.md - Markdown documentation or content.
│       │       ├── 📄 architecture-avoid-boolean-props.md - Markdown documentation or content.
│       │       ├── 📄 architecture-compound-components.md - Markdown documentation or content.
│       │       ├── 📄 patterns-children-over-render-props.md - Markdown documentation or content.
│       │       ├── 📄 patterns-explicit-variants.md - Markdown documentation or content.
│       │       ├── 📄 react19-no-forwardref.md - Markdown documentation or content.
│       │       ├── 📄 state-context-interface.md - Markdown documentation or content.
│       │       ├── 📄 state-decouple-implementation.md - Markdown documentation or content.
│       │       └── 📄 state-lift-state.md - Markdown documentation or content.
│       ├── 📁 vercel-react-best-practices - Directory.
│       │   ├── 📄 AGENTS.md - Markdown documentation or content.
│       │   ├── 📄 README.md - Markdown documentation or content.
│       │   ├── 📄 SKILL.md - Markdown documentation or content.
│       │   └── 📁 rules - Directory.
│       │       ├── 📄 _sections.md - Markdown documentation or content.
│       │       ├── 📄 _template.md - Markdown documentation or content.
│       │       ├── 📄 advanced-event-handler-refs.md - Markdown documentation or content.
│       │       ├── 📄 advanced-init-once.md - Markdown documentation or content.
│       │       ├── 📄 advanced-use-latest.md - Markdown documentation or content.
│       │       ├── 📄 async-api-routes.md - Markdown documentation or content.
│       │       ├── 📄 async-defer-await.md - Markdown documentation or content.
│       │       ├── 📄 async-dependencies.md - Markdown documentation or content.
│       │       ├── 📄 async-parallel.md - Markdown documentation or content.
│       │       ├── 📄 async-suspense-boundaries.md - Markdown documentation or content.
│       │       ├── 📄 bundle-barrel-imports.md - Markdown documentation or content.
│       │       ├── 📄 bundle-conditional.md - Markdown documentation or content.
│       │       ├── 📄 bundle-defer-third-party.md - Markdown documentation or content.
│       │       ├── 📄 bundle-dynamic-imports.md - Markdown documentation or content.
│       │       ├── 📄 bundle-preload.md - Markdown documentation or content.
│       │       ├── 📄 client-event-listeners.md - Markdown documentation or content.
│       │       ├── 📄 client-localstorage-schema.md - Markdown documentation or content.
│       │       ├── 📄 client-passive-event-listeners.md - Markdown documentation or content.
│       │       ├── 📄 client-swr-dedup.md - Markdown documentation or content.
│       │       ├── 📄 js-batch-dom-css.md - Markdown documentation or content.
│       │       ├── 📄 js-cache-function-results.md - Markdown documentation or content.
│       │       ├── 📄 js-cache-property-access.md - Markdown documentation or content.
│       │       ├── 📄 js-cache-storage.md - Markdown documentation or content.
│       │       ├── 📄 js-combine-iterations.md - Markdown documentation or content.
│       │       ├── 📄 js-early-exit.md - Markdown documentation or content.
│       │       ├── 📄 js-flatmap-filter.md - Markdown documentation or content.
│       │       ├── 📄 js-hoist-regexp.md - Markdown documentation or content.
│       │       ├── 📄 js-index-maps.md - Markdown documentation or content.
│       │       ├── 📄 js-length-check-first.md - Markdown documentation or content.
│       │       ├── 📄 js-min-max-loop.md - Markdown documentation or content.
│       │       ├── 📄 js-set-map-lookups.md - Markdown documentation or content.
│       │       ├── 📄 js-tosorted-immutable.md - Markdown documentation or content.
│       │       ├── 📄 rendering-activity.md - Markdown documentation or content.
│       │       ├── 📄 rendering-animate-svg-wrapper.md - Markdown documentation or content.
│       │       ├── 📄 rendering-conditional-render.md - Markdown documentation or content.
│       │       ├── 📄 rendering-content-visibility.md - Markdown documentation or content.
│       │       ├── 📄 rendering-hoist-jsx.md - Markdown documentation or content.
│       │       ├── 📄 rendering-hydration-no-flicker.md - Markdown documentation or content.
│       │       ├── 📄 rendering-hydration-suppress-warning.md - Markdown documentation or content.
│       │       ├── 📄 rendering-resource-hints.md - Markdown documentation or content.
│       │       ├── 📄 rendering-script-defer-async.md - Markdown documentation or content.
│       │       ├── 📄 rendering-svg-precision.md - Markdown documentation or content.
│       │       ├── 📄 rendering-usetransition-loading.md - Markdown documentation or content.
│       │       ├── 📄 rerender-defer-reads.md - Markdown documentation or content.
│       │       ├── 📄 rerender-dependencies.md - Markdown documentation or content.
│       │       ├── 📄 rerender-derived-state-no-effect.md - Markdown documentation or content.
│       │       ├── 📄 rerender-derived-state.md - Markdown documentation or content.
│       │       ├── 📄 rerender-functional-setstate.md - Markdown documentation or content.
│       │       ├── 📄 rerender-lazy-state-init.md - Markdown documentation or content.
│       │       ├── 📄 rerender-memo-with-default-value.md - Markdown documentation or content.
│       │       ├── 📄 rerender-memo.md - Markdown documentation or content.
│       │       ├── 📄 rerender-move-effect-to-event.md - Markdown documentation or content.
│       │       ├── 📄 rerender-no-inline-components.md - Markdown documentation or content.
│       │       ├── 📄 rerender-simple-expression-in-memo.md - Markdown documentation or content.
│       │       ├── 📄 rerender-split-combined-hooks.md - Markdown documentation or content.
│       │       ├── 📄 rerender-transitions.md - Markdown documentation or content.
│       │       ├── 📄 rerender-use-deferred-value.md - Markdown documentation or content.
│       │       ├── 📄 rerender-use-ref-transient-values.md - Markdown documentation or content.
│       │       ├── 📄 server-after-nonblocking.md - Markdown documentation or content.
│       │       ├── 📄 server-auth-actions.md - Markdown documentation or content.
│       │       ├── 📄 server-cache-lru.md - Markdown documentation or content.
│       │       ├── 📄 server-cache-react.md - Markdown documentation or content.
│       │       ├── 📄 server-dedup-props.md - Markdown documentation or content.
│       │       ├── 📄 server-hoist-static-io.md - Markdown documentation or content.
│       │       ├── 📄 server-parallel-fetching.md - Markdown documentation or content.
│       │       └── 📄 server-serialization.md - Markdown documentation or content.
│       └── 📁 web-design-guidelines - Directory.
│           └── 📄 SKILL.md - Markdown documentation or content.
├── 📁 .claude - Directory.
│   └── 📁 skills - Directory.
│       ├── 📁 find-skills - Directory.
│       │   └── 📄 SKILL.md - Markdown documentation or content.
│       ├── 📁 frontend-design - Directory.
│       │   ├── 📄 LICENSE.txt - File.
│       │   └── 📄 SKILL.md - Markdown documentation or content.
│       ├── 📁 kiranism-shadcn-dashboard - Directory.
│       │   ├── 📄 SKILL.md - Markdown documentation or content.
│       │   └── 📁 references - Directory.
│       │       └── 📄 theming-guide.md - Markdown documentation or content.
│       ├── 📁 next-best-practices - Directory.
│       │   ├── 📄 SKILL.md - Markdown documentation or content.
│       │   ├── 📄 async-patterns.md - Markdown documentation or content.
│       │   ├── 📄 bundling.md - Markdown documentation or content.
│       │   ├── 📄 data-patterns.md - Markdown documentation or content.
│       │   ├── 📄 debug-tricks.md - Markdown documentation or content.
│       │   ├── 📄 directives.md - Markdown documentation or content.
│       │   ├── 📄 error-handling.md - Markdown documentation or content.
│       │   ├── 📄 file-conventions.md - Markdown documentation or content.
│       │   ├── 📄 font.md - Markdown documentation or content.
│       │   ├── 📄 functions.md - Markdown documentation or content.
│       │   ├── 📄 hydration-error.md - Markdown documentation or content.
│       │   ├── 📄 image.md - Markdown documentation or content.
│       │   ├── 📄 metadata.md - Markdown documentation or content.
│       │   ├── 📄 parallel-routes.md - Markdown documentation or content.
│       │   ├── 📄 route-handlers.md - Markdown documentation or content.
│       │   ├── 📄 rsc-boundaries.md - Markdown documentation or content.
│       │   ├── 📄 runtime-selection.md - Markdown documentation or content.
│       │   ├── 📄 scripts.md - Markdown documentation or content.
│       │   ├── 📄 self-hosting.md - Markdown documentation or content.
│       │   └── 📄 suspense-boundaries.md - Markdown documentation or content.
│       ├── 📁 shadcn - Directory.
│       │   ├── 📄 SKILL.md - Markdown documentation or content.
│       │   ├── 📁 agents - Directory.
│       │   │   └── 📄 openai.yml - File.
│       │   ├── 📁 assets - Directory.
│       │   │   ├── 📄 shadcn-small.png - File.
│       │   │   └── 📄 shadcn.png - File.
│       │   ├── 📄 cli.md - Markdown documentation or content.
│       │   ├── 📄 customization.md - Markdown documentation or content.
│       │   ├── 📁 evals - Directory.
│       │   │   └── 📄 evals.json - JSON configuration or data file.
│       │   ├── 📄 mcp.md - Markdown documentation or content.
│       │   └── 📁 rules - Directory.
│       │       ├── 📄 base-vs-radix.md - Markdown documentation or content.
│       │       ├── 📄 composition.md - Markdown documentation or content.
│       │       ├── 📄 forms.md - Markdown documentation or content.
│       │       ├── 📄 icons.md - Markdown documentation or content.
│       │       └── 📄 styling.md - Markdown documentation or content.
│       ├── 📁 skill-creator - Directory.
│       │   ├── 📄 LICENSE.txt - File.
│       │   ├── 📄 SKILL.md - Markdown documentation or content.
│       │   ├── 📁 agents - Directory.
│       │   │   ├── 📄 analyzer.md - Markdown documentation or content.
│       │   │   ├── 📄 comparator.md - Markdown documentation or content.
│       │   │   └── 📄 grader.md - Markdown documentation or content.
│       │   ├── 📁 assets - Directory.
│       │   │   └── 📄 eval_review.html - File.
│       │   ├── 📁 eval-viewer - Directory.
│       │   │   ├── 📄 generate_review.py - File.
│       │   │   └── 📄 viewer.html - File.
│       │   ├── 📁 references - Directory.
│       │   │   └── 📄 schemas.md - Markdown documentation or content.
│       │   └── 📁 scripts - Directory.
│       │       ├── 📄 __init__.py - File.
│       │       ├── 📄 aggregate_benchmark.py - File.
│       │       ├── 📄 generate_report.py - File.
│       │       ├── 📄 improve_description.py - File.
│       │       ├── 📄 package_skill.py - File.
│       │       ├── 📄 quick_validate.py - File.
│       │       ├── 📄 run_eval.py - File.
│       │       ├── 📄 run_loop.py - File.
│       │       └── 📄 utils.py - File.
│       ├── 📁 vercel-composition-patterns - Directory.
│       │   ├── 📄 AGENTS.md - Markdown documentation or content.
│       │   ├── 📄 README.md - Markdown documentation or content.
│       │   ├── 📄 SKILL.md - Markdown documentation or content.
│       │   └── 📁 rules - Directory.
│       │       ├── 📄 _sections.md - Markdown documentation or content.
│       │       ├── 📄 _template.md - Markdown documentation or content.
│       │       ├── 📄 architecture-avoid-boolean-props.md - Markdown documentation or content.
│       │       ├── 📄 architecture-compound-components.md - Markdown documentation or content.
│       │       ├── 📄 patterns-children-over-render-props.md - Markdown documentation or content.
│       │       ├── 📄 patterns-explicit-variants.md - Markdown documentation or content.
│       │       ├── 📄 react19-no-forwardref.md - Markdown documentation or content.
│       │       ├── 📄 state-context-interface.md - Markdown documentation or content.
│       │       ├── 📄 state-decouple-implementation.md - Markdown documentation or content.
│       │       └── 📄 state-lift-state.md - Markdown documentation or content.
│       ├── 📁 vercel-react-best-practices - Directory.
│       │   ├── 📄 AGENTS.md - Markdown documentation or content.
│       │   ├── 📄 README.md - Markdown documentation or content.
│       │   ├── 📄 SKILL.md - Markdown documentation or content.
│       │   └── 📁 rules - Directory.
│       │       ├── 📄 _sections.md - Markdown documentation or content.
│       │       ├── 📄 _template.md - Markdown documentation or content.
│       │       ├── 📄 advanced-event-handler-refs.md - Markdown documentation or content.
│       │       ├── 📄 advanced-init-once.md - Markdown documentation or content.
│       │       ├── 📄 advanced-use-latest.md - Markdown documentation or content.
│       │       ├── 📄 async-api-routes.md - Markdown documentation or content.
│       │       ├── 📄 async-defer-await.md - Markdown documentation or content.
│       │       ├── 📄 async-dependencies.md - Markdown documentation or content.
│       │       ├── 📄 async-parallel.md - Markdown documentation or content.
│       │       ├── 📄 async-suspense-boundaries.md - Markdown documentation or content.
│       │       ├── 📄 bundle-barrel-imports.md - Markdown documentation or content.
│       │       ├── 📄 bundle-conditional.md - Markdown documentation or content.
│       │       ├── 📄 bundle-defer-third-party.md - Markdown documentation or content.
│       │       ├── 📄 bundle-dynamic-imports.md - Markdown documentation or content.
│       │       ├── 📄 bundle-preload.md - Markdown documentation or content.
│       │       ├── 📄 client-event-listeners.md - Markdown documentation or content.
│       │       ├── 📄 client-localstorage-schema.md - Markdown documentation or content.
│       │       ├── 📄 client-passive-event-listeners.md - Markdown documentation or content.
│       │       ├── 📄 client-swr-dedup.md - Markdown documentation or content.
│       │       ├── 📄 js-batch-dom-css.md - Markdown documentation or content.
│       │       ├── 📄 js-cache-function-results.md - Markdown documentation or content.
│       │       ├── 📄 js-cache-property-access.md - Markdown documentation or content.
│       │       ├── 📄 js-cache-storage.md - Markdown documentation or content.
│       │       ├── 📄 js-combine-iterations.md - Markdown documentation or content.
│       │       ├── 📄 js-early-exit.md - Markdown documentation or content.
│       │       ├── 📄 js-flatmap-filter.md - Markdown documentation or content.
│       │       ├── 📄 js-hoist-regexp.md - Markdown documentation or content.
│       │       ├── 📄 js-index-maps.md - Markdown documentation or content.
│       │       ├── 📄 js-length-check-first.md - Markdown documentation or content.
│       │       ├── 📄 js-min-max-loop.md - Markdown documentation or content.
│       │       ├── 📄 js-set-map-lookups.md - Markdown documentation or content.
│       │       ├── 📄 js-tosorted-immutable.md - Markdown documentation or content.
│       │       ├── 📄 rendering-activity.md - Markdown documentation or content.
│       │       ├── 📄 rendering-animate-svg-wrapper.md - Markdown documentation or content.
│       │       ├── 📄 rendering-conditional-render.md - Markdown documentation or content.
│       │       ├── 📄 rendering-content-visibility.md - Markdown documentation or content.
│       │       ├── 📄 rendering-hoist-jsx.md - Markdown documentation or content.
│       │       ├── 📄 rendering-hydration-no-flicker.md - Markdown documentation or content.
│       │       ├── 📄 rendering-hydration-suppress-warning.md - Markdown documentation or content.
│       │       ├── 📄 rendering-resource-hints.md - Markdown documentation or content.
│       │       ├── 📄 rendering-script-defer-async.md - Markdown documentation or content.
│       │       ├── 📄 rendering-svg-precision.md - Markdown documentation or content.
│       │       ├── 📄 rendering-usetransition-loading.md - Markdown documentation or content.
│       │       ├── 📄 rerender-defer-reads.md - Markdown documentation or content.
│       │       ├── 📄 rerender-dependencies.md - Markdown documentation or content.
│       │       ├── 📄 rerender-derived-state-no-effect.md - Markdown documentation or content.
│       │       ├── 📄 rerender-derived-state.md - Markdown documentation or content.
│       │       ├── 📄 rerender-functional-setstate.md - Markdown documentation or content.
│       │       ├── 📄 rerender-lazy-state-init.md - Markdown documentation or content.
│       │       ├── 📄 rerender-memo-with-default-value.md - Markdown documentation or content.
│       │       ├── 📄 rerender-memo.md - Markdown documentation or content.
│       │       ├── 📄 rerender-move-effect-to-event.md - Markdown documentation or content.
│       │       ├── 📄 rerender-no-inline-components.md - Markdown documentation or content.
│       │       ├── 📄 rerender-simple-expression-in-memo.md - Markdown documentation or content.
│       │       ├── 📄 rerender-split-combined-hooks.md - Markdown documentation or content.
│       │       ├── 📄 rerender-transitions.md - Markdown documentation or content.
│       │       ├── 📄 rerender-use-deferred-value.md - Markdown documentation or content.
│       │       ├── 📄 rerender-use-ref-transient-values.md - Markdown documentation or content.
│       │       ├── 📄 server-after-nonblocking.md - Markdown documentation or content.
│       │       ├── 📄 server-auth-actions.md - Markdown documentation or content.
│       │       ├── 📄 server-cache-lru.md - Markdown documentation or content.
│       │       ├── 📄 server-cache-react.md - Markdown documentation or content.
│       │       ├── 📄 server-dedup-props.md - Markdown documentation or content.
│       │       ├── 📄 server-hoist-static-io.md - Markdown documentation or content.
│       │       ├── 📄 server-parallel-fetching.md - Markdown documentation or content.
│       │       └── 📄 server-serialization.md - Markdown documentation or content.
│       └── 📁 web-design-guidelines - Directory.
│           └── 📄 SKILL.md - Markdown documentation or content.
├── 📄 .dockerignore - File.
├── 📁 .github - Directory.
│   └── 📄 FUNDING.yml - File.
├── 📄 .gitignore - File.
├── 📁 .husky - Directory.
│   ├── 📄 pre-commit - File.
│   └── 📄 pre-push - File.
├── 📄 .npmrc - File.
├── 📄 .nvmrc - File.
├── 📄 .oxfmtrc.json - JSON configuration or data file.
├── 📄 .oxlintrc.json - JSON configuration or data file.
├── 📄 .vercelignore - File.
├── 📁 .vscode - Directory.
│   └── 📄 launch.json - JSON configuration or data file.
├── 📄 AGENTS.md - Markdown documentation or content.
├── 📄 CLAUDE.md - Markdown documentation or content.
├── 📄 Dockerfile - File.
├── 📄 Dockerfile.bun - File.
├── 📄 LICENSE - File.
├── 📄 README.md - Markdown documentation or content.
├── 📄 bun.lock - File.
├── 📄 components.json - Shadcn UI configuration.
├── 📁 docs - Directory.
│   ├── 📄 clerk_setup.md - Markdown documentation or content.
│   ├── 📄 forms.md - Markdown documentation or content.
│   ├── 📄 nav-rbac.md - Markdown documentation or content.
│   └── 📄 themes.md - Markdown documentation or content.
├── 📄 env.example.txt - File.
├── 📄 next.config.ts - TypeScript file.
├── 📄 package-lock.json - JSON configuration or data file.
├── 📄 package.json - NPM dependencies and scripts.
├── 📄 postcss.config.js - Configuration file.
├── 📁 scripts - Directory.
│   ├── 📄 cleanup.js - Configuration file.
│   └── 📄 postinstall.js - Configuration file.
├── 📄 skills-lock.json - JSON configuration or data file.
├── 📁 src - Directory.
│   ├── 📁 app - Next.js App Router root directory.
│   │   ├── 📁 about - Directory.
│   │   │   └── 📄 page.tsx - Main page UI component.
│   │   ├── 📁 api - Directory.
│   │   │   ├── 📁 products - Directory.
│   │   │   │   ├── 📁 [id] - Directory.
│   │   │   │   │   └── 📄 route.ts - API endpoint.
│   │   │   │   └── 📄 route.ts - API endpoint.
│   │   │   └── 📁 users - Directory.
│   │   │       ├── 📁 [id] - Directory.
│   │   │       │   └── 📄 route.ts - API endpoint.
│   │   │       └── 📄 route.ts - API endpoint.
│   │   ├── 📁 auth - Authentication feature module.
│   │   │   ├── 📄 layout.tsx - Layout wrapper for this route.
│   │   │   ├── 📄 page.tsx - Main page UI component.
│   │   │   ├── 📁 sign-in - Directory.
│   │   │   │   └── 📁 [[...sign-in]] - Directory.
│   │   │   │       └── 📄 page.tsx - Main page UI component.
│   │   │   └── 📁 sign-up - Directory.
│   │   │       └── 📁 [[...sign-up]] - Directory.
│   │   │           └── 📄 page.tsx - Main page UI component.
│   │   ├── 📁 dashboard - Dashboard feature module.
│   │   │   ├── 📁 billing - Directory.
│   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   ├── 📁 chat - Directory.
│   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   ├── 📁 elements - Directory.
│   │   │   │   └── 📁 icons - Directory.
│   │   │   │       └── 📄 page.tsx - Main page UI component.
│   │   │   ├── 📁 exclusive - Directory.
│   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   ├── 📁 forms - Directory.
│   │   │   │   ├── 📁 advanced - Directory.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📁 basic - Directory.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📁 multi-step - Directory.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📄 page.tsx - Main page UI component.
│   │   │   │   └── 📁 sheet-form - Directory.
│   │   │   │       └── 📄 page.tsx - Main page UI component.
│   │   │   ├── 📁 kanban - Directory.
│   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   ├── 📄 layout.tsx - Layout wrapper for this route.
│   │   │   ├── 📁 notifications - Directory.
│   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   ├── 📁 overview - Directory.
│   │   │   │   ├── 📁 @area_stats - Directory.
│   │   │   │   │   ├── 📄 default.tsx - TypeScript file.
│   │   │   │   │   ├── 📄 error.tsx - TypeScript file.
│   │   │   │   │   ├── 📄 loading.tsx - TypeScript file.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📁 @bar_stats - Directory.
│   │   │   │   │   ├── 📄 default.tsx - TypeScript file.
│   │   │   │   │   ├── 📄 error.tsx - TypeScript file.
│   │   │   │   │   ├── 📄 loading.tsx - TypeScript file.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📁 @pie_stats - Directory.
│   │   │   │   │   ├── 📄 default.tsx - TypeScript file.
│   │   │   │   │   ├── 📄 error.tsx - TypeScript file.
│   │   │   │   │   ├── 📄 loading.tsx - TypeScript file.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📁 @sales - Directory.
│   │   │   │   │   ├── 📄 default.tsx - TypeScript file.
│   │   │   │   │   ├── 📄 error.tsx - TypeScript file.
│   │   │   │   │   ├── 📄 loading.tsx - TypeScript file.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   ├── 📄 error.tsx - TypeScript file.
│   │   │   │   └── 📄 layout.tsx - Layout wrapper for this route.
│   │   │   ├── 📄 page.tsx - Main page UI component.
│   │   │   ├── 📁 product - Directory.
│   │   │   │   ├── 📁 [productId] - Directory.
│   │   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   ├── 📁 profile - Directory.
│   │   │   │   └── 📁 [[...profile]] - Directory.
│   │   │   │       └── 📄 page.tsx - Main page UI component.
│   │   │   ├── 📁 react-query - Directory.
│   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   ├── 📁 users - Directory.
│   │   │   │   └── 📄 page.tsx - Main page UI component.
│   │   │   └── 📁 workspaces - Directory.
│   │   │       ├── 📄 page.tsx - Main page UI component.
│   │   │       └── 📁 team - Directory.
│   │   │           └── 📁 [[...rest]] - Directory.
│   │   │               └── 📄 page.tsx - Main page UI component.
│   │   ├── 📄 favicon.ico - File.
│   │   ├── 📄 global-error.tsx - TypeScript file.
│   │   ├── 📄 layout.tsx - Layout wrapper for this route.
│   │   ├── 📄 not-found.tsx - TypeScript file.
│   │   ├── 📄 page.tsx - Main page UI component.
│   │   ├── 📁 privacy-policy - Directory.
│   │   │   └── 📄 page.tsx - Main page UI component.
│   │   └── 📁 terms-of-service - Directory.
│   │       └── 📄 page.tsx - Main page UI component.
│   ├── 📁 components - Reusable UI and feature components.
│   │   ├── 📄 breadcrumbs.tsx - Reusable UI component.
│   │   ├── 📄 file-uploader.tsx - Reusable UI component.
│   │   ├── 📄 form-card-skeleton.tsx - Reusable UI component.
│   │   ├── 📁 forms - Directory.
│   │   │   ├── 📄 demo-form.tsx - Reusable UI component.
│   │   │   └── 📁 fields - Directory.
│   │   │       ├── 📄 checkbox-field.tsx - Reusable UI component.
│   │   │       ├── 📄 file-upload-field.tsx - Reusable UI component.
│   │   │       ├── 📄 index.tsx - Reusable UI component.
│   │   │       ├── 📄 radio-group-field.tsx - Reusable UI component.
│   │   │       ├── 📄 select-field.tsx - Reusable UI component.
│   │   │       ├── 📄 slider-field.tsx - Reusable UI component.
│   │   │       ├── 📄 switch-field.tsx - Reusable UI component.
│   │   │       ├── 📄 text-field.tsx - Reusable UI component.
│   │   │       └── 📄 textarea-field.tsx - Reusable UI component.
│   │   ├── 📄 github-stars-button.tsx - Reusable UI component.
│   │   ├── 📄 icons.tsx - Reusable UI component.
│   │   ├── 📁 kbar - Directory.
│   │   │   ├── 📄 index.tsx - Reusable UI component.
│   │   │   ├── 📄 render-result.tsx - Reusable UI component.
│   │   │   ├── 📄 result-item.tsx - Reusable UI component.
│   │   │   └── 📄 use-theme-switching.tsx - Reusable UI component.
│   │   ├── 📁 layout - Directory.
│   │   │   ├── 📄 app-sidebar.tsx - Reusable UI component.
│   │   │   ├── 📄 cta-github.tsx - Reusable UI component.
│   │   │   ├── 📄 header.tsx - Reusable UI component.
│   │   │   ├── 📄 info-sidebar.tsx - Reusable UI component.
│   │   │   ├── 📄 page-container.tsx - Main page UI component.
│   │   │   ├── 📄 providers.tsx - Reusable UI component.
│   │   │   ├── 📄 query-provider.tsx - Reusable UI component.
│   │   │   └── 📄 user-nav.tsx - Reusable UI component.
│   │   ├── 📁 modal - Directory.
│   │   │   └── 📄 alert-modal.tsx - Reusable UI component.
│   │   ├── 📄 nav-main.tsx - Reusable UI component.
│   │   ├── 📄 nav-projects.tsx - Reusable UI component.
│   │   ├── 📄 nav-user.tsx - Reusable UI component.
│   │   ├── 📄 org-switcher.tsx - Reusable UI component.
│   │   ├── 📄 search-input.tsx - Reusable UI component.
│   │   ├── 📁 themes - Directory.
│   │   │   ├── 📄 active-theme.tsx - Reusable UI component.
│   │   │   ├── 📄 font.config.ts - Reusable UI component.
│   │   │   ├── 📄 theme-mode-toggle.tsx - Reusable UI component.
│   │   │   ├── 📄 theme-provider.tsx - Reusable UI component.
│   │   │   ├── 📄 theme-selector.tsx - Reusable UI component.
│   │   │   └── 📄 theme.config.ts - Reusable UI component.
│   │   ├── 📁 ui - Base Shadcn UI components.
│   │   │   ├── 📄 accordion.tsx - Reusable UI component.
│   │   │   ├── 📄 alert-dialog.tsx - Reusable UI component.
│   │   │   ├── 📄 alert.tsx - Reusable UI component.
│   │   │   ├── 📄 aspect-ratio.tsx - Reusable UI component.
│   │   │   ├── 📄 avatar.tsx - Reusable UI component.
│   │   │   ├── 📄 badge.tsx - Reusable UI component.
│   │   │   ├── 📄 breadcrumb.tsx - Reusable UI component.
│   │   │   ├── 📄 button-group.tsx - Reusable UI component.
│   │   │   ├── 📄 button.tsx - Reusable UI component.
│   │   │   ├── 📄 calendar.tsx - Reusable UI component.
│   │   │   ├── 📄 card.tsx - Reusable UI component.
│   │   │   ├── 📄 chart.tsx - Reusable UI component.
│   │   │   ├── 📄 checkbox.tsx - Reusable UI component.
│   │   │   ├── 📄 collapsible.tsx - Reusable UI component.
│   │   │   ├── 📄 command.tsx - Reusable UI component.
│   │   │   ├── 📄 context-menu.tsx - Reusable UI component.
│   │   │   ├── 📄 dialog.tsx - Reusable UI component.
│   │   │   ├── 📄 drawer.tsx - Reusable UI component.
│   │   │   ├── 📄 dropdown-menu.tsx - Reusable UI component.
│   │   │   ├── 📄 field.tsx - Reusable UI component.
│   │   │   ├── 📄 file-preview.tsx - Reusable UI component.
│   │   │   ├── 📄 form-context.tsx - Reusable UI component.
│   │   │   ├── 📄 frame.tsx - Reusable UI component.
│   │   │   ├── 📄 heading.tsx - Reusable UI component.
│   │   │   ├── 📄 hover-card.tsx - Reusable UI component.
│   │   │   ├── 📄 info-button.tsx - Reusable UI component.
│   │   │   ├── 📄 infobar.tsx - Reusable UI component.
│   │   │   ├── 📄 input-group.tsx - Reusable UI component.
│   │   │   ├── 📄 input-otp.tsx - Reusable UI component.
│   │   │   ├── 📄 input.tsx - Reusable UI component.
│   │   │   ├── 📄 kanban.tsx - Reusable UI component.
│   │   │   ├── 📄 kbd.tsx - Reusable UI component.
│   │   │   ├── 📄 label.tsx - Reusable UI component.
│   │   │   ├── 📄 menubar.tsx - Reusable UI component.
│   │   │   ├── 📄 modal.tsx - Reusable UI component.
│   │   │   ├── 📄 navigation-menu.tsx - Reusable UI component.
│   │   │   ├── 📄 notification-card.tsx - Reusable UI component.
│   │   │   ├── 📄 pagination.tsx - Reusable UI component.
│   │   │   ├── 📄 popover.tsx - Reusable UI component.
│   │   │   ├── 📄 progress.tsx - Reusable UI component.
│   │   │   ├── 📄 radio-group.tsx - Reusable UI component.
│   │   │   ├── 📄 resizable.tsx - Reusable UI component.
│   │   │   ├── 📄 scroll-area.tsx - Reusable UI component.
│   │   │   ├── 📄 select.tsx - Reusable UI component.
│   │   │   ├── 📄 separator.tsx - Reusable UI component.
│   │   │   ├── 📄 sheet.tsx - Reusable UI component.
│   │   │   ├── 📄 sidebar.tsx - Reusable UI component.
│   │   │   ├── 📄 skeleton.tsx - Reusable UI component.
│   │   │   ├── 📄 slider.tsx - Reusable UI component.
│   │   │   ├── 📄 sonner.tsx - Reusable UI component.
│   │   │   ├── 📄 spinner.tsx - Reusable UI component.
│   │   │   ├── 📄 switch.tsx - Reusable UI component.
│   │   │   ├── 📁 table - Directory.
│   │   │   │   ├── 📄 data-table-column-header.tsx - Reusable UI component.
│   │   │   │   ├── 📄 data-table-date-filter.tsx - Reusable UI component.
│   │   │   │   ├── 📄 data-table-faceted-filter.tsx - Reusable UI component.
│   │   │   │   ├── 📄 data-table-pagination.tsx - Reusable UI component.
│   │   │   │   ├── 📄 data-table-skeleton.tsx - Reusable UI component.
│   │   │   │   ├── 📄 data-table-slider-filter.tsx - Reusable UI component.
│   │   │   │   ├── 📄 data-table-toolbar.tsx - Reusable UI component.
│   │   │   │   ├── 📄 data-table-view-options.tsx - Reusable UI component.
│   │   │   │   └── 📄 data-table.tsx - Reusable UI component.
│   │   │   ├── 📄 table.tsx - Reusable UI component.
│   │   │   ├── 📄 tabs.tsx - Reusable UI component.
│   │   │   ├── 📄 tanstack-form.tsx - Reusable UI component.
│   │   │   ├── 📄 textarea.tsx - Reusable UI component.
│   │   │   ├── 📄 toggle-group.tsx - Reusable UI component.
│   │   │   ├── 📄 toggle.tsx - Reusable UI component.
│   │   │   └── 📄 tooltip.tsx - Reusable UI component.
│   │   └── 📄 user-avatar-profile.tsx - Reusable UI component.
│   ├── 📁 config - Directory.
│   │   ├── 📄 data-table.ts - TypeScript file.
│   │   ├── 📄 infoconfig.ts - TypeScript file.
│   │   └── 📄 nav-config.ts - TypeScript file.
│   ├── 📁 constants - Directory.
│   │   ├── 📄 mock-api-users.ts - TypeScript file.
│   │   └── 📄 mock-api.ts - TypeScript file.
│   ├── 📁 features - Directory.
│   │   ├── 📁 auth - Authentication feature module.
│   │   │   └── 📁 components - Reusable UI and feature components.
│   │   │       ├── 📄 github-auth-button.tsx - Reusable UI component.
│   │   │       ├── 📄 interactive-grid.tsx - Reusable UI component.
│   │   │       ├── 📄 sign-in-view.tsx - Reusable UI component.
│   │   │       ├── 📄 sign-up-view.tsx - Reusable UI component.
│   │   │       └── 📄 user-auth-form.tsx - Reusable UI component.
│   │   ├── 📁 chat - Directory.
│   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   ├── 📄 chat-area.tsx - Reusable UI component.
│   │   │   │   ├── 📄 chat-header.tsx - Reusable UI component.
│   │   │   │   ├── 📄 chat-view-page.tsx - Main page UI component.
│   │   │   │   ├── 📄 conversation-list.tsx - Reusable UI component.
│   │   │   │   ├── 📄 conversation-select.tsx - Reusable UI component.
│   │   │   │   ├── 📄 message-bubble.tsx - Reusable UI component.
│   │   │   │   ├── 📄 message-composer.tsx - Reusable UI component.
│   │   │   │   └── 📄 messenger.tsx - Reusable UI component.
│   │   │   └── 📁 utils - Utility functions and helpers.
│   │   │       ├── 📄 data.ts - Utility functions.
│   │   │       ├── 📄 store.ts - Utility functions.
│   │   │       └── 📄 types.ts - Utility functions.
│   │   ├── 📁 elements - Directory.
│   │   │   └── 📁 components - Reusable UI and feature components.
│   │   │       └── 📄 icons-view-page.tsx - Main page UI component.
│   │   ├── 📁 forms - Directory.
│   │   │   └── 📁 components - Reusable UI and feature components.
│   │   │       ├── 📄 advanced-form-patterns.tsx - Reusable UI component.
│   │   │       ├── 📄 forms-showcase-page.tsx - Main page UI component.
│   │   │       ├── 📄 multi-step-product-form.tsx - Reusable UI component.
│   │   │       ├── 📄 sheet-form-demo.tsx - Reusable UI component.
│   │   │       └── 📄 sheet-product-form.tsx - Reusable UI component.
│   │   ├── 📁 kanban - Directory.
│   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   ├── 📄 board-column.tsx - Reusable UI component.
│   │   │   │   ├── 📄 kanban-board.tsx - Reusable UI component.
│   │   │   │   ├── 📄 kanban-view-page.tsx - Main page UI component.
│   │   │   │   ├── 📄 new-task-dialog.tsx - Reusable UI component.
│   │   │   │   └── 📄 task-card.tsx - Reusable UI component.
│   │   │   └── 📁 utils - Utility functions and helpers.
│   │   │       ├── 📄 restrict-to-container.ts - Utility functions.
│   │   │       └── 📄 store.ts - Utility functions.
│   │   ├── 📁 notifications - Directory.
│   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   ├── 📄 notification-center.tsx - Reusable UI component.
│   │   │   │   └── 📄 notifications-page.tsx - Main page UI component.
│   │   │   └── 📁 utils - Utility functions and helpers.
│   │   │       └── 📄 store.ts - Utility functions.
│   │   ├── 📁 overview - Directory.
│   │   │   └── 📁 components - Reusable UI and feature components.
│   │   │       ├── 📄 area-graph-skeleton.tsx - Reusable UI component.
│   │   │       ├── 📄 area-graph.tsx - Reusable UI component.
│   │   │       ├── 📄 bar-graph-skeleton.tsx - Reusable UI component.
│   │   │       ├── 📄 bar-graph.tsx - Reusable UI component.
│   │   │       ├── 📄 overview.tsx - Reusable UI component.
│   │   │       ├── 📄 pie-graph-skeleton.tsx - Reusable UI component.
│   │   │       ├── 📄 pie-graph.tsx - Reusable UI component.
│   │   │       ├── 📄 recent-sales-skeleton.tsx - Reusable UI component.
│   │   │       └── 📄 recent-sales.tsx - Reusable UI component.
│   │   ├── 📁 products - Directory.
│   │   │   ├── 📁 api - Directory.
│   │   │   │   ├── 📄 mutations.ts - TypeScript file.
│   │   │   │   ├── 📄 queries.ts - TypeScript file.
│   │   │   │   ├── 📄 service.ts - TypeScript file.
│   │   │   │   └── 📄 types.ts - TypeScript file.
│   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   ├── 📄 product-form.tsx - Reusable UI component.
│   │   │   │   ├── 📄 product-listing.tsx - Reusable UI component.
│   │   │   │   ├── 📁 product-tables - Directory.
│   │   │   │   │   ├── 📄 cell-action.tsx - Reusable UI component.
│   │   │   │   │   ├── 📄 columns.tsx - Reusable UI component.
│   │   │   │   │   ├── 📄 index.tsx - Reusable UI component.
│   │   │   │   │   └── 📄 options.tsx - Reusable UI component.
│   │   │   │   └── 📄 product-view-page.tsx - Main page UI component.
│   │   │   ├── 📁 constants - Directory.
│   │   │   │   └── 📄 product-options.ts - TypeScript file.
│   │   │   └── 📁 schemas - Directory.
│   │   │       └── 📄 product.ts - TypeScript file.
│   │   ├── 📁 profile - Directory.
│   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   └── 📄 profile-view-page.tsx - Main page UI component.
│   │   │   └── 📁 utils - Utility functions and helpers.
│   │   │       └── 📄 form-schema.ts - Utility functions.
│   │   ├── 📁 react-query-demo - Directory.
│   │   │   ├── 📁 api - Directory.
│   │   │   │   └── 📄 queries.ts - TypeScript file.
│   │   │   ├── 📁 components - Reusable UI and feature components.
│   │   │   │   ├── 📄 pokemon-info.tsx - Reusable UI component.
│   │   │   │   └── 📄 pokemon-skeleton.tsx - Reusable UI component.
│   │   │   └── 📄 info-content.ts - TypeScript file.
│   │   └── 📁 users - Directory.
│   │       ├── 📁 api - Directory.
│   │       │   ├── 📄 mutations.ts - TypeScript file.
│   │       │   ├── 📄 queries.ts - TypeScript file.
│   │       │   ├── 📄 service.ts - TypeScript file.
│   │       │   └── 📄 types.ts - TypeScript file.
│   │       ├── 📁 components - Reusable UI and feature components.
│   │       │   ├── 📄 user-form-sheet.tsx - Reusable UI component.
│   │       │   ├── 📄 user-listing.tsx - Reusable UI component.
│   │       │   └── 📁 users-table - Directory.
│   │       │       ├── 📄 cell-action.tsx - Reusable UI component.
│   │       │       ├── 📄 columns.tsx - Reusable UI component.
│   │       │       ├── 📄 index.tsx - Reusable UI component.
│   │       │       └── 📄 options.tsx - Reusable UI component.
│   │       ├── 📄 info-content.ts - TypeScript file.
│   │       └── 📁 schemas - Directory.
│   │           └── 📄 user.ts - TypeScript file.
│   ├── 📁 hooks - React custom hooks.
│   │   ├── 📄 use-breadcrumbs.tsx - Custom React hook logic.
│   │   ├── 📄 use-callback-ref.tsx - Custom React hook logic.
│   │   ├── 📄 use-controllable-state.tsx - Custom React hook logic.
│   │   ├── 📄 use-data-table.ts - Custom React hook logic.
│   │   ├── 📄 use-debounce.tsx - Custom React hook logic.
│   │   ├── 📄 use-debounced-callback.ts - Custom React hook logic.
│   │   ├── 📄 use-media-query.ts - Custom React hook logic.
│   │   ├── 📄 use-mobile.tsx - Custom React hook logic.
│   │   ├── 📄 use-nav.ts - Custom React hook logic.
│   │   └── 📄 use-stepper.tsx - Custom React hook logic.
│   ├── 📄 instrumentation-client.ts - TypeScript file.
│   ├── 📄 instrumentation.ts - TypeScript file.
│   ├── 📁 lib - Utility functions and helpers.
│   │   ├── 📄 api-client.ts - Utility functions.
│   │   ├── 📄 compose-refs.ts - Utility functions.
│   │   ├── 📄 data-table.ts - Utility functions.
│   │   ├── 📄 format.ts - Utility functions.
│   │   ├── 📄 parsers.ts - Utility functions.
│   │   ├── 📄 query-client.ts - Utility functions.
│   │   ├── 📄 searchparams.ts - Utility functions.
│   │   └── 📄 utils.ts - Utility functions.
│   ├── 📄 proxy.ts - TypeScript file.
│   ├── 📁 styles - Global stylesheets.
│   │   ├── 📄 globals.css - Styles / Tailwind directives.
│   │   ├── 📄 theme.css - Styles / Tailwind directives.
│   │   └── 📁 themes - Directory.
│   │       ├── 📄 astro-vista.css - Styles / Tailwind directives.
│   │       ├── 📄 claude.css - Styles / Tailwind directives.
│   │       ├── 📄 light-green.css - Styles / Tailwind directives.
│   │       ├── 📄 mono.css - Styles / Tailwind directives.
│   │       ├── 📄 neobrutualism.css - Styles / Tailwind directives.
│   │       ├── 📄 notebook.css - Styles / Tailwind directives.
│   │       ├── 📄 supabase.css - Styles / Tailwind directives.
│   │       ├── 📄 vercel.css - Styles / Tailwind directives.
│   │       ├── 📄 whatsapp.css - Styles / Tailwind directives.
│   │       └── 📄 zen.css - Styles / Tailwind directives.
│   └── 📁 types - TypeScript type definitions.
│       ├── 📄 data-table.ts - TypeScript file.
│       └── 📄 index.ts - TypeScript file.
└── 📄 tsconfig.json - JSON configuration or data file.
```

### Summary of `shadcn-dashboard-2`
- **Primary Use:** Reference for specific UI or layout aspects.
- **Integration Strategy:** Copy the relevant components (`.tsx`) into Orbitly's `core/` or `features/` folders, updating imports to match our colocation architecture. Re-wire mock JSON data to Convex queries.

---

