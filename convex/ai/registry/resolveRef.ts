/**
 * Real ref resolver. Convention-based — looks for code-shaped fields in
 * the parsed args (`personCode`, `leadCode`, `dealCode`, `companyCode`,
 * generic `code`) and resolves them via `internal.ai.aiEntityPatch
 * .resolveEntityCode` (which normalises P-001 / p001 / etc. and indexes
 * by_org_and_*Code).
 *
 * Returns args augmented with the resolved row's `_id` under both the
 * generic key (`entityId`) and the entity-typed key (`leadId`/`dealId`/…),
 * plus the canonical code under the original field name. A miss becomes
 * `not_found` (the wrapper turns it into the failed envelope).
 *
 * For generic `code`, the entity type is inferred from the capability's
 * `group` (leads/contacts/deals/companies) so the model can call
 * `update_entity({ code: "P-007", … })` against any entity uniformly.
 */
import { ConvexError } from "convex/values";
import { internal } from "../../_generated/api";
import type { RefResolver } from "./wrapper";

type EntityType = "lead" | "contact" | "deal" | "company";

const ENTITY_FROM_FIELD: Record<string, EntityType> = {
	personCode: "lead", // person codes attach to leads — convertToContact passes through.
	leadCode: "lead",
	dealCode: "deal",
	companyCode: "company",
};

const GROUP_TO_ENTITY: Record<string, EntityType> = {
	leads: "lead",
	contacts: "contact",
	deals: "deal",
	companies: "company",
};

export const resolveRef: RefResolver = async (cap, args, ctx) => {
	const fields = ["personCode", "leadCode", "dealCode", "companyCode", "code"] as const;
	for (const field of fields) {
		const value = args[field];
		if (typeof value !== "string" || value.length === 0) continue;

		// Resolution order: explicit `args.entityType` (e.g. update_entity)
		// → field-name → capability group. So `update_entity({entityType:"deal", code:"D-001"})`
		// resolves as a deal, not as whatever cap.group is.
		const argsEntityType =
			typeof args.entityType === "string" ? (args.entityType as EntityType) : undefined;
		const entityType: EntityType | undefined =
			argsEntityType ?? ENTITY_FROM_FIELD[field] ?? GROUP_TO_ENTITY[cap.group];
		if (!entityType) continue;

		try {
			const resolved = (await ctx.ctx.runMutation(
				internal.ai.aiEntityPatch.resolveEntityCode,
				{
					orgId: ctx.principal.orgId,
					userId: ctx.principal.userId,
					entityType,
					code: value,
				},
			)) as {
				entityType: EntityType;
				entityId: string;
				canonicalCode: string;
				displayName: string;
			};

			const idKey = `${entityType}Id`;
			return {
				status: "ok",
				args: {
					...args,
					entityId: resolved.entityId,
					entityType: resolved.entityType,
					[idKey]: resolved.entityId,
					[field]: resolved.canonicalCode,
					_resolvedDisplayName: resolved.displayName,
				},
			};
		} catch (err) {
			// `resolveEntityCode` throws ConvexError({code:"NOT_FOUND",...}) on miss.
			// Anything else (e.g. permission denied on the AI twin) bubbles up to
			// the wrapper's classifyRunError so it becomes a typed envelope.
			if (err instanceof ConvexError) {
				const data = err.data as { code?: string; message?: string };
				if (data?.code === "NOT_FOUND") {
					return {
						status: "not_found",
						headline: `No ${entityType} found with code ${value}.`,
					};
				}
			}
			throw err;
		}
	}

	return { status: "ok", args };
};
