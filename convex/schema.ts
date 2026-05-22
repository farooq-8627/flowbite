/**
 * Convex Schema — FlowBite B2B SaaS.
 *
 * Tables are split per domain under `convex/schema/` for maintainability.
 * To add or modify a table:
 *   1. Edit (or add) the appropriate domain file in `convex/schema/`.
 *   2. Re-export it from this file via `defineSchema({...})`.
 *   3. Run `npx convex dev` to regenerate `_generated/`.
 *
 * Adding a new table that doesn't fit any existing domain — create a new
 * file under `convex/schema/`, then add a `...newDomain` line below.
 *
 * Sources:
 *   - https://github.com/get-convex/convex-saas/blob/main/convex/schema.ts
 *   - .github/agents/base/schema.md
 */

import { authTables } from "@convex-dev/auth/server";
import { defineSchema } from "convex/server";

import * as ai from "./schema/ai";
import * as crmEntities from "./schema/crmEntities";
import * as crmFields from "./schema/crmFields";
import * as crmShared from "./schema/crmShared";
import * as identity from "./schema/identity";
import * as platform from "./schema/platform";
import * as system from "./schema/system";

export default defineSchema({
	// Convex Auth managed tables (DO NOT TOUCH)
	...authTables,

	// Identity
	users: identity.users,
	orgs: identity.orgs,
	orgRoles: identity.orgRoles,
	orgMembers: identity.orgMembers,
	invitations: identity.invitations,

	// Platform
	platformTemplates: platform.platformTemplates,
	featureFlags: platform.featureFlags,
	rateLimits: platform.rateLimits,
	platformContext: platform.platformContext,

	// CRM — entities
	leads: crmEntities.leads,
	contacts: crmEntities.contacts,
	companies: crmEntities.companies,
	deals: crmEntities.deals,

	// CRM — fields & code generation
	pipelines: crmFields.pipelines,
	entityCodeCounters: crmFields.entityCodeCounters,
	orbitLinks: crmFields.orbitLinks,
	fieldDefinitions: crmFields.fieldDefinitions,
	fieldValues: crmFields.fieldValues,

	// CRM — shared (notes, conversations, messages, reminders, tags, savedViews)
	notes: crmShared.notes,
	noteCategories: crmShared.noteCategories,
	conversations: crmShared.conversations,
	conversationMembers: crmShared.conversationMembers,
	messages: crmShared.messages,
	reminders: crmShared.reminders,
	tags: crmShared.tags,
	entityTags: crmShared.entityTags,
	savedViews: crmShared.savedViews,
	companyMembers: crmShared.companyMembers,

	// System (notifications, activity logs, files, orgStats)
	notifications: system.notifications,
	activityLogs: system.activityLogs,
	files: system.files,
	orgStats: system.orgStats,

	// AI (Phase 3)
	aiConversations: ai.aiConversations,
	aiMessages: ai.aiMessages,
	orgAiKeys: ai.orgAiKeys,
	aiBriefings: ai.aiBriefings,
});
