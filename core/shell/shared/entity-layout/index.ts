/**
 * Shared entity-layout barrel.
 *
 * Use:
 *   import { EntityPageLayout, type PrimaryActionConfig, type ViewKind }
 *     from "@/core/shell/shared/entity-layout";
 *
 * `EntityListPage` and `EntityFormDrawer` deliberately stay in
 * `core/entities/scaffolds/` — they depend on entity-specific helpers
 * (DataTable + Kanban entity-card rendering, dedup banner, form drawer).
 * Only the chrome / generic primitives live here.
 */

export { EmptyState } from "./EmptyState";
export { EntityPageLayout, type PrimaryActionConfig } from "./EntityPageLayout";
export type { ViewKind } from "./types";
export { ViewToggleIcons } from "./ViewToggleIcons";
