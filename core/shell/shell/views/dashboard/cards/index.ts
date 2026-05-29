/**
 * Dashboard cards barrel — single import path.
 *
 * Each card lives in its own file (per AGENTS.md "no monolith view"
 * rule) and is re-exported here so `DashboardHomeView` can grab them
 * with one tidy import block.
 */

export { AIBriefingCard } from "./AIBriefingCard";
export { AICockpitSection } from "./AICockpitSection";
export { AIPinnedRow } from "./AIPinnedRow";
export { AIPulseRibbon } from "./AIPulseRibbon";
export { AIQuickComposerCard } from "./AIQuickComposerCard";
export { ARRCohortWidget } from "./ARRCohortWidget";
export { DailyBriefingCard } from "./DailyBriefingCard";
export { DashboardAnnotationChips } from "./DashboardAnnotationChip";
export { InvoiceAgingWidget } from "./InvoiceAgingWidget";
export { LiveTasksWidget } from "./LiveTasksWidget";
export { MetricStrip } from "./MetricStrip";
export { MockDataBanner } from "./MockDataBanner";
export { NextTaskFallback } from "./NextTaskFallback";
export { PropertyFunnelWidget } from "./PropertyFunnelWidget";
export { RecentActivityCard } from "./RecentActivityCard";
export { RecentActivityWidget } from "./RecentActivityWidget";
export { RevenueEstimateHero } from "./RevenueEstimateHero";
export { SalesPipelinePanel } from "./SalesPipelinePanel";
export { StatTile } from "./StatTile";
export { TasksCard } from "./TasksCard";
export { WeeklyInsightCard } from "./WeeklyInsightCard";
