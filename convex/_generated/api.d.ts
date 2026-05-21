/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _functions_admin from "../_functions/admin.js";
import type * as _functions_authenticated from "../_functions/authenticated.js";
import type * as _migrations_2026_05_21_invitationRoleToRoleId from "../_migrations/2026_05_21_invitationRoleToRoleId.js";
import type * as _migrations_addDefaultStage from "../_migrations/addDefaultStage.js";
import type * as _migrations_addNotesColorAndType from "../_migrations/addNotesColorAndType.js";
import type * as _migrations_allowAudioUploads from "../_migrations/allowAudioUploads.js";
import type * as _migrations_consolidatePersonConversations from "../_migrations/consolidatePersonConversations.js";
import type * as _migrations_fixCompanyAssignedToColumnKey from "../_migrations/fixCompanyAssignedToColumnKey.js";
import type * as _migrations_pinDealFieldsToDefaultStage from "../_migrations/pinDealFieldsToDefaultStage.js";
import type * as _migrations_recomputeOrgStats from "../_migrations/recomputeOrgStats.js";
import type * as _migrations_renameRealEstateToDubai from "../_migrations/renameRealEstateToDubai.js";
import type * as _migrations_seedNoteCategories from "../_migrations/seedNoteCategories.js";
import type * as _migrations_seedSortOrder from "../_migrations/seedSortOrder.js";
import type * as _migrations_seedTemplateDefaults from "../_migrations/seedTemplateDefaults.js";
import type * as _migrations_setOrgDefaultCurrency from "../_migrations/setOrgDefaultCurrency.js";
import type * as _migrations_setOrgPlan from "../_migrations/setOrgPlan.js";
import type * as _migrations_tightenReminderSourceAndAddPriority from "../_migrations/tightenReminderSourceAndAddPriority.js";
import type * as _platform_limits from "../_platform/limits.js";
import type * as _shared_constants from "../_shared/constants.js";
import type * as _shared_entityCodes from "../_shared/entityCodes.js";
import type * as _shared_errors from "../_shared/errors.js";
import type * as _shared_fieldUpdateLog from "../_shared/fieldUpdateLog.js";
import type * as _shared_notificationKeys from "../_shared/notificationKeys.js";
import type * as _shared_orgStats from "../_shared/orgStats.js";
import type * as _shared_permissions_catalog from "../_shared/permissions/catalog.js";
import type * as _shared_permissions_derive from "../_shared/permissions/derive.js";
import type * as _shared_permissions_helpers from "../_shared/permissions/helpers.js";
import type * as _shared_permissions_index from "../_shared/permissions/index.js";
import type * as _shared_rateLimit from "../_shared/rateLimit.js";
import type * as _shared_recordCodes from "../_shared/recordCodes.js";
import type * as _shared_reservedSlugs from "../_shared/reservedSlugs.js";
import type * as _shared_types from "../_shared/types.js";
import type * as _shared_validators from "../_shared/validators.js";
import type * as _test_helpers from "../_test/helpers.js";
import type * as activityLogs_helpers from "../activityLogs/helpers.js";
import type * as ai_internal from "../ai/internal.js";
import type * as auth from "../auth.js";
import type * as crm_entities_companies_mutations from "../crm/entities/companies/mutations.js";
import type * as crm_entities_companies_queries from "../crm/entities/companies/queries.js";
import type * as crm_entities_contacts_mutations from "../crm/entities/contacts/mutations.js";
import type * as crm_entities_contacts_queries from "../crm/entities/contacts/queries.js";
import type * as crm_entities_deals_mutations from "../crm/entities/deals/mutations.js";
import type * as crm_entities_deals_queries from "../crm/entities/deals/queries.js";
import type * as crm_entities_leads_mutations from "../crm/entities/leads/mutations.js";
import type * as crm_entities_leads_queries from "../crm/entities/leads/queries.js";
import type * as crm_fields_dedup_helpers from "../crm/fields/dedup/helpers.js";
import type * as crm_fields_fieldDefinitions_internal from "../crm/fields/fieldDefinitions/internal.js";
import type * as crm_fields_fieldDefinitions_migrations from "../crm/fields/fieldDefinitions/migrations.js";
import type * as crm_fields_fieldDefinitions_mutations from "../crm/fields/fieldDefinitions/mutations.js";
import type * as crm_fields_fieldDefinitions_queries from "../crm/fields/fieldDefinitions/queries.js";
import type * as crm_fields_fieldValues_mutations from "../crm/fields/fieldValues/mutations.js";
import type * as crm_fields_fieldValues_queries from "../crm/fields/fieldValues/queries.js";
import type * as crm_fields_pipelines_helpers from "../crm/fields/pipelines/helpers.js";
import type * as crm_fields_pipelines_mutations from "../crm/fields/pipelines/mutations.js";
import type * as crm_fields_pipelines_queries from "../crm/fields/pipelines/queries.js";
import type * as crm_fields_templates_definitions_agency_freelance from "../crm/fields/templates/definitions/agency_freelance.js";
import type * as crm_fields_templates_definitions_b2b_saas from "../crm/fields/templates/definitions/b2b_saas.js";
import type * as crm_fields_templates_definitions_dubai_real_estate from "../crm/fields/templates/definitions/dubai_real_estate.js";
import type * as crm_fields_templates_definitions_freelancer from "../crm/fields/templates/definitions/freelancer.js";
import type * as crm_fields_templates_definitions_generic from "../crm/fields/templates/definitions/generic.js";
import type * as crm_fields_templates_definitions_real_estate from "../crm/fields/templates/definitions/real_estate.js";
import type * as crm_fields_templates_definitions_recruiting from "../crm/fields/templates/definitions/recruiting.js";
import type * as crm_fields_templates_mutations from "../crm/fields/templates/mutations.js";
import type * as crm_fields_templates_queries from "../crm/fields/templates/queries.js";
import type * as crm_fields_templates_registry from "../crm/fields/templates/registry.js";
import type * as crm_fields_templates_types from "../crm/fields/templates/types.js";
import type * as crm_people_queries from "../crm/people/queries.js";
import type * as crm_shared_calendar_queries from "../crm/shared/calendar/queries.js";
import type * as crm_shared_conversations_internal from "../crm/shared/conversations/internal.js";
import type * as crm_shared_conversations_mutations from "../crm/shared/conversations/mutations.js";
import type * as crm_shared_conversations_queries from "../crm/shared/conversations/queries.js";
import type * as crm_shared_messages_mutations from "../crm/shared/messages/mutations.js";
import type * as crm_shared_messages_queries from "../crm/shared/messages/queries.js";
import type * as crm_shared_noteCategories_internal from "../crm/shared/noteCategories/internal.js";
import type * as crm_shared_noteCategories_mutations from "../crm/shared/noteCategories/mutations.js";
import type * as crm_shared_noteCategories_queries from "../crm/shared/noteCategories/queries.js";
import type * as crm_shared_notes_mutations from "../crm/shared/notes/mutations.js";
import type * as crm_shared_notes_queries from "../crm/shared/notes/queries.js";
import type * as crm_shared_reminders_mutations from "../crm/shared/reminders/mutations.js";
import type * as crm_shared_reminders_queries from "../crm/shared/reminders/queries.js";
import type * as crm_shared_savedViews_mutations from "../crm/shared/savedViews/mutations.js";
import type * as crm_shared_savedViews_queries from "../crm/shared/savedViews/queries.js";
import type * as crm_shared_tags_internal from "../crm/shared/tags/internal.js";
import type * as crm_shared_tags_mutations from "../crm/shared/tags/mutations.js";
import type * as crm_shared_tags_queries from "../crm/shared/tags/queries.js";
import type * as crm_shared_timeline_queries from "../crm/shared/timeline/queries.js";
import type * as crons from "../crons.js";
import type * as featureFlags_queries from "../featureFlags/queries.js";
import type * as files_mutations from "../files/mutations.js";
import type * as files_queries from "../files/queries.js";
import type * as http from "../http.js";
import type * as invitations_actions from "../invitations/actions.js";
import type * as invitations_index from "../invitations/index.js";
import type * as invitations_mutations from "../invitations/mutations.js";
import type * as invitations_queries from "../invitations/queries.js";
import type * as notifications_helpers from "../notifications/helpers.js";
import type * as notifications_mutations from "../notifications/mutations.js";
import type * as notifications_queries from "../notifications/queries.js";
import type * as orgRoles_index from "../orgRoles/index.js";
import type * as orgRoles_mutations from "../orgRoles/mutations.js";
import type * as orgRoles_queries from "../orgRoles/queries.js";
import type * as orgs_helpers from "../orgs/helpers.js";
import type * as orgs_mutations from "../orgs/mutations.js";
import type * as orgs_queries from "../orgs/queries.js";
import type * as orgs_templates_fields from "../orgs/templates/fields.js";
import type * as orgs_templates_pipelineStages from "../orgs/templates/pipelineStages.js";
import type * as schema_ai from "../schema/ai.js";
import type * as schema_crmEntities from "../schema/crmEntities.js";
import type * as schema_crmFields from "../schema/crmFields.js";
import type * as schema_crmShared from "../schema/crmShared.js";
import type * as schema_identity from "../schema/identity.js";
import type * as schema_platform from "../schema/platform.js";
import type * as schema_system from "../schema/system.js";
import type * as users_helpers from "../users/helpers.js";
import type * as users_mutations from "../users/mutations.js";
import type * as users_queries from "../users/queries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_functions/admin": typeof _functions_admin;
  "_functions/authenticated": typeof _functions_authenticated;
  "_migrations/2026_05_21_invitationRoleToRoleId": typeof _migrations_2026_05_21_invitationRoleToRoleId;
  "_migrations/addDefaultStage": typeof _migrations_addDefaultStage;
  "_migrations/addNotesColorAndType": typeof _migrations_addNotesColorAndType;
  "_migrations/allowAudioUploads": typeof _migrations_allowAudioUploads;
  "_migrations/consolidatePersonConversations": typeof _migrations_consolidatePersonConversations;
  "_migrations/fixCompanyAssignedToColumnKey": typeof _migrations_fixCompanyAssignedToColumnKey;
  "_migrations/pinDealFieldsToDefaultStage": typeof _migrations_pinDealFieldsToDefaultStage;
  "_migrations/recomputeOrgStats": typeof _migrations_recomputeOrgStats;
  "_migrations/renameRealEstateToDubai": typeof _migrations_renameRealEstateToDubai;
  "_migrations/seedNoteCategories": typeof _migrations_seedNoteCategories;
  "_migrations/seedSortOrder": typeof _migrations_seedSortOrder;
  "_migrations/seedTemplateDefaults": typeof _migrations_seedTemplateDefaults;
  "_migrations/setOrgDefaultCurrency": typeof _migrations_setOrgDefaultCurrency;
  "_migrations/setOrgPlan": typeof _migrations_setOrgPlan;
  "_migrations/tightenReminderSourceAndAddPriority": typeof _migrations_tightenReminderSourceAndAddPriority;
  "_platform/limits": typeof _platform_limits;
  "_shared/constants": typeof _shared_constants;
  "_shared/entityCodes": typeof _shared_entityCodes;
  "_shared/errors": typeof _shared_errors;
  "_shared/fieldUpdateLog": typeof _shared_fieldUpdateLog;
  "_shared/notificationKeys": typeof _shared_notificationKeys;
  "_shared/orgStats": typeof _shared_orgStats;
  "_shared/permissions/catalog": typeof _shared_permissions_catalog;
  "_shared/permissions/derive": typeof _shared_permissions_derive;
  "_shared/permissions/helpers": typeof _shared_permissions_helpers;
  "_shared/permissions/index": typeof _shared_permissions_index;
  "_shared/rateLimit": typeof _shared_rateLimit;
  "_shared/recordCodes": typeof _shared_recordCodes;
  "_shared/reservedSlugs": typeof _shared_reservedSlugs;
  "_shared/types": typeof _shared_types;
  "_shared/validators": typeof _shared_validators;
  "_test/helpers": typeof _test_helpers;
  "activityLogs/helpers": typeof activityLogs_helpers;
  "ai/internal": typeof ai_internal;
  auth: typeof auth;
  "crm/entities/companies/mutations": typeof crm_entities_companies_mutations;
  "crm/entities/companies/queries": typeof crm_entities_companies_queries;
  "crm/entities/contacts/mutations": typeof crm_entities_contacts_mutations;
  "crm/entities/contacts/queries": typeof crm_entities_contacts_queries;
  "crm/entities/deals/mutations": typeof crm_entities_deals_mutations;
  "crm/entities/deals/queries": typeof crm_entities_deals_queries;
  "crm/entities/leads/mutations": typeof crm_entities_leads_mutations;
  "crm/entities/leads/queries": typeof crm_entities_leads_queries;
  "crm/fields/dedup/helpers": typeof crm_fields_dedup_helpers;
  "crm/fields/fieldDefinitions/internal": typeof crm_fields_fieldDefinitions_internal;
  "crm/fields/fieldDefinitions/migrations": typeof crm_fields_fieldDefinitions_migrations;
  "crm/fields/fieldDefinitions/mutations": typeof crm_fields_fieldDefinitions_mutations;
  "crm/fields/fieldDefinitions/queries": typeof crm_fields_fieldDefinitions_queries;
  "crm/fields/fieldValues/mutations": typeof crm_fields_fieldValues_mutations;
  "crm/fields/fieldValues/queries": typeof crm_fields_fieldValues_queries;
  "crm/fields/pipelines/helpers": typeof crm_fields_pipelines_helpers;
  "crm/fields/pipelines/mutations": typeof crm_fields_pipelines_mutations;
  "crm/fields/pipelines/queries": typeof crm_fields_pipelines_queries;
  "crm/fields/templates/definitions/agency_freelance": typeof crm_fields_templates_definitions_agency_freelance;
  "crm/fields/templates/definitions/b2b_saas": typeof crm_fields_templates_definitions_b2b_saas;
  "crm/fields/templates/definitions/dubai_real_estate": typeof crm_fields_templates_definitions_dubai_real_estate;
  "crm/fields/templates/definitions/freelancer": typeof crm_fields_templates_definitions_freelancer;
  "crm/fields/templates/definitions/generic": typeof crm_fields_templates_definitions_generic;
  "crm/fields/templates/definitions/real_estate": typeof crm_fields_templates_definitions_real_estate;
  "crm/fields/templates/definitions/recruiting": typeof crm_fields_templates_definitions_recruiting;
  "crm/fields/templates/mutations": typeof crm_fields_templates_mutations;
  "crm/fields/templates/queries": typeof crm_fields_templates_queries;
  "crm/fields/templates/registry": typeof crm_fields_templates_registry;
  "crm/fields/templates/types": typeof crm_fields_templates_types;
  "crm/people/queries": typeof crm_people_queries;
  "crm/shared/calendar/queries": typeof crm_shared_calendar_queries;
  "crm/shared/conversations/internal": typeof crm_shared_conversations_internal;
  "crm/shared/conversations/mutations": typeof crm_shared_conversations_mutations;
  "crm/shared/conversations/queries": typeof crm_shared_conversations_queries;
  "crm/shared/messages/mutations": typeof crm_shared_messages_mutations;
  "crm/shared/messages/queries": typeof crm_shared_messages_queries;
  "crm/shared/noteCategories/internal": typeof crm_shared_noteCategories_internal;
  "crm/shared/noteCategories/mutations": typeof crm_shared_noteCategories_mutations;
  "crm/shared/noteCategories/queries": typeof crm_shared_noteCategories_queries;
  "crm/shared/notes/mutations": typeof crm_shared_notes_mutations;
  "crm/shared/notes/queries": typeof crm_shared_notes_queries;
  "crm/shared/reminders/mutations": typeof crm_shared_reminders_mutations;
  "crm/shared/reminders/queries": typeof crm_shared_reminders_queries;
  "crm/shared/savedViews/mutations": typeof crm_shared_savedViews_mutations;
  "crm/shared/savedViews/queries": typeof crm_shared_savedViews_queries;
  "crm/shared/tags/internal": typeof crm_shared_tags_internal;
  "crm/shared/tags/mutations": typeof crm_shared_tags_mutations;
  "crm/shared/tags/queries": typeof crm_shared_tags_queries;
  "crm/shared/timeline/queries": typeof crm_shared_timeline_queries;
  crons: typeof crons;
  "featureFlags/queries": typeof featureFlags_queries;
  "files/mutations": typeof files_mutations;
  "files/queries": typeof files_queries;
  http: typeof http;
  "invitations/actions": typeof invitations_actions;
  "invitations/index": typeof invitations_index;
  "invitations/mutations": typeof invitations_mutations;
  "invitations/queries": typeof invitations_queries;
  "notifications/helpers": typeof notifications_helpers;
  "notifications/mutations": typeof notifications_mutations;
  "notifications/queries": typeof notifications_queries;
  "orgRoles/index": typeof orgRoles_index;
  "orgRoles/mutations": typeof orgRoles_mutations;
  "orgRoles/queries": typeof orgRoles_queries;
  "orgs/helpers": typeof orgs_helpers;
  "orgs/mutations": typeof orgs_mutations;
  "orgs/queries": typeof orgs_queries;
  "orgs/templates/fields": typeof orgs_templates_fields;
  "orgs/templates/pipelineStages": typeof orgs_templates_pipelineStages;
  "schema/ai": typeof schema_ai;
  "schema/crmEntities": typeof schema_crmEntities;
  "schema/crmFields": typeof schema_crmFields;
  "schema/crmShared": typeof schema_crmShared;
  "schema/identity": typeof schema_identity;
  "schema/platform": typeof schema_platform;
  "schema/system": typeof schema_system;
  "users/helpers": typeof users_helpers;
  "users/mutations": typeof users_mutations;
  "users/queries": typeof users_queries;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
