/**
 * Dashboard cards barrel — single import path.
 *
 * Each card lives in its own file (per AGENTS.md "no monolith view"
 * rule) and is re-exported here so `DashboardHomeView` can grab them
 * with one tidy import block.
 */

export { NextReminderFallback } from "./NextReminderFallback";
export { PipelineCard } from "./PipelineCard";
export { RecentActivityCard } from "./RecentActivityCard";
export { RemindersCard } from "./RemindersCard";
export { StatStrip } from "./StatStrip";
export { StatTile } from "./StatTile";
export { TodaySummaryCard } from "./TodaySummaryCard";
