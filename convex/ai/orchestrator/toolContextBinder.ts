"use node";
/**
 * convex/ai/orchestrator/toolContextBinder.ts
 *
 * One-call helper that wires the per-request `ToolContext` into every
 * tool module. Each tool file owns a module-level `_ctx` variable that
 * its `execute` function reads — see §7.4 of the AI module decisions log
 * for why we do this instead of threading ctx through tool args.
 *
 * Keeping this in a single file means: when a new tool group is added,
 * exactly ONE place needs the new `setXContext` import. Previously the
 * 16 setter calls were duplicated between `processChat.run` and
 * `processChat.resume` — now they share `bindAllToolContexts(toolCtx)`.
 */
import type { ToolContext } from "../tools/_shared";
import { setAnalyticsContext } from "../tools/analytics";
import { setCompaniesContext } from "../tools/companies";
import { setContextBagToolContext } from "../tools/contextBag";
import { setCreativeContext } from "../tools/creative";
import { setCreateEntitiesContext } from "../tools/crud";
import { setDashboardContext } from "../tools/dashboard";
import { setFilesContext } from "../tools/files";
import { setAskChoiceContext } from "../tools/interaction/askChoice";
import { setAskInputContext } from "../tools/interaction/askInput";
import { setIntrospectContext } from "../tools/introspect";
import { setBulkContext } from "../tools/layers/bulk";
import { setCategoriesContext } from "../tools/layers/categories";
import { setCsvImportContext } from "../tools/layers/csvImport";
import { setDataContext } from "../tools/layers/data";
import { setEnrichmentContext } from "../tools/layers/enrichment";
import { setFieldsContext } from "../tools/layers/fields";
import { setFileAnalysisContext } from "../tools/layers/fileAnalysis";
import { setMembersContext } from "../tools/layers/members";
import { setPipelinesContext } from "../tools/layers/pipelines";
import { setSettingsContext } from "../tools/layers/settings";
import { setTagsContext } from "../tools/layers/tags";
import { setTemplatesContext } from "../tools/layers/templates";
import { setViewsContext } from "../tools/layers/views";
import { setMessagingContext } from "../tools/messaging";
import { setNotesContext } from "../tools/notes";
import { setNotificationsContext } from "../tools/notifications";
import { setPersonaContextToolContext } from "../tools/personaContext";
import { setProactiveContext } from "../tools/proactive";
import { setSchedulingContext } from "../tools/scheduling";
import { setSearchToolContext } from "../tools/search";
import { setTasksContext } from "../tools/tasks";
import { setTimelineContext } from "../tools/timeline";
import { setUpdateEntityContext } from "../tools/updateEntity";
import { setWebSearchToolContext } from "../tools/webSearch";

/**
 * Bind a ToolContext to every tool module so their `execute` functions
 * can find ctx, orgId, userId, permissions, and conversationId.
 *
 * Layer-tool contexts are bound eagerly even when the layer isn't
 * expanded — toolRegistry filters out unloaded layer tools before they
 * reach the model, so binding a context that's never consulted is a
 * no-op. The eager binding lets `processChat.resume` (which doesn't
 * know which layers were active during the original turn) invoke any
 * commit tool without re-binding.
 */
export function bindAllToolContexts(toolCtx: ToolContext): void {
	setSearchToolContext(toolCtx);
	setIntrospectContext(toolCtx);
	setContextBagToolContext(toolCtx);
	setPersonaContextToolContext(toolCtx);
	setCreateEntitiesContext(toolCtx);
	setUpdateEntityContext(toolCtx);
	setNotesContext(toolCtx);
	setTasksContext(toolCtx);
	setAskChoiceContext(toolCtx);
	setAskInputContext(toolCtx);
	setPipelinesContext(toolCtx);
	setTagsContext(toolCtx);
	setViewsContext(toolCtx);
	setCategoriesContext(toolCtx);
	setMembersContext(toolCtx);
	setSettingsContext(toolCtx);
	setBulkContext(toolCtx);
	setCsvImportContext(toolCtx);
	setEnrichmentContext(toolCtx);
	setFileAnalysisContext(toolCtx);
	setTemplatesContext(toolCtx);
	setDataContext(toolCtx);
	setFieldsContext(toolCtx);
	setWebSearchToolContext(toolCtx);
	setMessagingContext(toolCtx);
	setSchedulingContext(toolCtx);
	setCompaniesContext(toolCtx);
	setFilesContext(toolCtx);
	setTimelineContext(toolCtx);
	setNotificationsContext(toolCtx);
	setProactiveContext(toolCtx);
	setAnalyticsContext(toolCtx);
	setCreativeContext(toolCtx);
	setDashboardContext(toolCtx);
}
