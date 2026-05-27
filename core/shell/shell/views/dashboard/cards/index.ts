/**
 * Dashboard cards barrel — single import path.
 *
 * Each card lives in its own file (per AGENTS.md "no monolith view"
 * rule) and is re-exported here so `DashboardHomeView` can grab them
 * with one tidy import block.
 */

export { AIBriefingCard } from "./AIBriefingCard";
export { AIPulseRibbon } from "./AIPulseRibbon";
export { AIQuickComposerCard } from "./AIQuickComposerCard";
export { DailyBriefingCard } from "./DailyBriefingCard";
export { MetricStrip } from "./MetricStrip";
export { MockDataBanner } from "./MockDataBanner";
export { NextTaskFallback } from "./NextTaskFallback";
export { PipelineCard } from "./PipelineCard";
export { PipelineVelocityCard } from "./PipelineVelocityCard";
export { ProactiveWorkspaceSection } from "./ProactiveWorkspaceSection";
export { RecentActivityCard } from "./RecentActivityCard";
export { StatTile } from "./StatTile";
export { TasksCard } from "./TasksCard";
export { TodaySummaryCard } from "./TodaySummaryCard";
export { WeeklyInsightCard } from "./WeeklyInsightCard";
