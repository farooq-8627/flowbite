/**
 * DEPRECATED PATH — use `@/core/shared/hooks/useEntityLabels` instead.
 *
 * This module is a thin re-export of the canonical hook so existing imports
 * keep working. The canonical version lives in `core/shared/` because entity
 * labels are used across ALL modules (shell, entities, settings, AI prompts,
 * breadcrumbs) — not just the shell.
 *
 * New code should import from `@/core/shared/hooks/useEntityLabels`.
 */

export {
	ENTITY_LABEL_DEFAULTS,
	type EntityLabel,
	type EntityLabels,
	type EntitySlot,
	useEntityLabel,
	useEntityLabels,
} from "@/core/shared/hooks/useEntityLabels";
