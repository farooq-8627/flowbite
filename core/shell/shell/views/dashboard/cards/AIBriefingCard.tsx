"use client";
/**
 * core/shell/shell/views/dashboard/cards/AIBriefingCard.tsx
 *
 * Sprint 5 — back-compat shim. The real component is now
 * `DailyBriefingCard` (which reads scope="daily-user" rows and
 * renders the structured payload). This shim keeps the original
 * import path working so any external mounts don't break.
 *
 * Prefer `DailyBriefingCard` directly in new code.
 */
export { DailyBriefingCard as AIBriefingCard } from "./DailyBriefingCard";
