/**
 * Mock-data seeder — Phase 3A.
 *
 * Called from `setupWorkspaceFromTemplate` AFTER the structural seed
 * completes (pipelines, fields, tags, modules, etc.). Inserts a small
 * bundle of sample records so a brand-new workspace doesn't feel empty.
 *
 * GUARANTEES:
 *   1. No-op when `org.settings.mockDataSeededAt` is already set (the user
 *      has either kept the seed or cleared it explicitly — re-applying the
 *      template should not re-insert mock records).
 *   2. No-op when any leads OR deals already exist for the org (defensive
 *      guard — if real data is here, we don't pollute it).
 *   3. Every inserted record carries `source: "template_seed"` and
 *      `excludeFromAI: true` so the Phase 3B AI runtime never trains on
 *      fake names.
 *   4. Stamps `org.settings.mockDataSeededAt` at the end so subsequent
 *      runs are no-ops.
 *
 * RESOLUTION RULES:
 *   - `companyKey` (in MockContact / MockDeal) → looks up the company
 *     inserted earlier in THIS seed pass. Resolution map is built in-memory
 *     (we never re-query the DB during the same seed).
 *   - `contactDisplayName` → looks up the contact by displayName.
 *   - `stageCode` → resolved against the seed's pipeline stage map.
 *   - `categoryName` (notes) → queries noteCategories by name. Falls back
 *     to the org's default category if none matches.
 *   - `anchorTo` (notes / tasks) → resolves the entity's code/id at
 *     seed time and links via the appropriate field (personCode, dealCode).
 */

import type { Id } from "../../../_generated/dataModel";
import type { MutationCtx } from "../../../_generated/server";
import { applyOrgStat } from "../../../_shared/orgStats";
import { generateEntityCode, generatePersonCode } from "../../../_shared/recordCodes";
import type { IndustryTemplate, MockDataSeed } from "./types";

function normalizePhone(phone: string | undefined): string | undefined {
	return phone?.replace(/\D/g, "");
}

/**
 * Seed the template's mock-data bundle for a newly-set-up org. Returns the
 * total count of records inserted (zero if any guard tripped).
 *
 * The seeder is idempotent — calling it twice without clearing in between
 * inserts zero rows the second time.
 */
export async function seedMockEntities(
	ctx: MutationCtx,
	orgId: Id<"orgs">,
	actorUserId: Id<"users">,
	template: IndustryTemplate,
	now: number,
): Promise<{ inserted: number }> {
	const data: MockDataSeed | undefined = template.mockData;
	if (!data) return { inserted: 0 };

	// ── Guard 1: already seeded? ──────────────────────────────────────
	const org = await ctx.db.get(orgId);
	if (!org) return { inserted: 0 };
	if (org.settings?.mockDataSeededAt !== undefined) return { inserted: 0 };

	// ── Guard 2: real data already present? ───────────────────────────
	const anyLead = await ctx.db
		.query("leads")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.first();
	const anyDeal = await ctx.db
		.query("deals")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.first();
	if (anyLead || anyDeal) return { inserted: 0 };

	// ── Resolve the org's deal pipeline + stage codes → ids ───────────
	const pipelines = await ctx.db
		.query("pipelines")
		.withIndex("by_org_and_entity", (q) => q.eq("orgId", orgId).eq("entityType", "deal"))
		.collect();
	const dealPipeline = pipelines.find((p) => p.isDefault) ?? pipelines[0];
	const stageCodeToId = new Map<string, string>();
	if (dealPipeline) {
		for (const stage of dealPipeline.stages) {
			stageCodeToId.set(stage.code, stage.id);
		}
	}

	// ── Resolve tag names → ids ──────────────────────────────────────
	const tags = await ctx.db
		.query("tags")
		.withIndex("by_org", (q) => q.eq("orgId", orgId))
		.collect();
	const tagNameToId = new Map<string, Id<"tags">>();
	for (const t of tags) tagNameToId.set(t.name.toLowerCase(), t._id);

	// ── Resolve note categories ──────────────────────────────────────
	const cats = await ctx.db
		.query("noteCategories")
		.withIndex("by_org_and_position", (q) => q.eq("orgId", orgId))
		.collect();
	const catNameToId = new Map<string, Id<"noteCategories">>();
	for (const c of cats) catNameToId.set(c.name.toLowerCase(), c._id);
	const defaultCategoryId = cats.find((c) => c.isDefault && !c.isArchived)?._id ?? cats[0]?._id;

	let inserted = 0;

	// ── Insert companies ─────────────────────────────────────────────
	const companyKeyToId = new Map<string, Id<"companies">>();
	const companyKeyToCode = new Map<string, string>();
	for (const seed of data.companies ?? []) {
		const companyCode = await generateEntityCode(ctx, orgId, "company");
		const id = await ctx.db.insert("companies", {
			orgId,
			companyCode,
			name: seed.name,
			industry: seed.industry,
			website: seed.website,
			excludeFromAI: true,
			createdAt: now,
			updatedAt: now,
		});
		companyKeyToId.set(seed.key, id);
		companyKeyToCode.set(seed.key, companyCode);
		await applyOrgStat(ctx, orgId, "companies.active", +1);
		inserted += 1;
	}

	// ── Insert leads ─────────────────────────────────────────────────
	const leadDisplayNameToCode = new Map<string, string>();
	const leadDisplayNameToId = new Map<string, Id<"leads">>();
	for (const seed of data.leads ?? []) {
		const personCode = await generatePersonCode(ctx, orgId);
		const id = await ctx.db.insert("leads", {
			orgId,
			personCode,
			displayName: seed.displayName,
			email: seed.email,
			phone: seed.phone,
			normalizedPhone: normalizePhone(seed.phone),
			status: seed.status ?? "new",
			source: "template_seed",
			excludeFromAI: true,
			createdAt: now,
			updatedAt: now,
		});
		leadDisplayNameToCode.set(seed.displayName, personCode);
		leadDisplayNameToId.set(seed.displayName, id);
		await applyOrgStat(ctx, orgId, "leads.open", +1);
		await applyOrgStat(ctx, orgId, "leads.total", +1);
		inserted += 1;

		// Attach tags via entityTags table.
		for (const tagName of seed.tags ?? []) {
			const tagId = tagNameToId.get(tagName.toLowerCase());
			if (!tagId) continue;
			await ctx.db.insert("entityTags", {
				orgId,
				entityType: "lead",
				entityId: id,
				tagId,
				createdAt: now,
			});
		}
	}

	// ── Insert contacts ──────────────────────────────────────────────
	const contactDisplayNameToCode = new Map<string, string>();
	const contactDisplayNameToId = new Map<string, Id<"contacts">>();
	for (const seed of data.contacts ?? []) {
		const personCode = await generatePersonCode(ctx, orgId);
		const companyId = seed.companyKey ? companyKeyToId.get(seed.companyKey) : undefined;
		const companyCode = seed.companyKey ? companyKeyToCode.get(seed.companyKey) : undefined;
		const id = await ctx.db.insert("contacts", {
			orgId,
			personCode,
			displayName: seed.displayName,
			email: seed.email,
			phone: seed.phone,
			normalizedPhone: normalizePhone(seed.phone),
			companyId,
			companyCode,
			excludeFromAI: true,
			createdAt: now,
			updatedAt: now,
		});
		contactDisplayNameToCode.set(seed.displayName, personCode);
		contactDisplayNameToId.set(seed.displayName, id);
		await applyOrgStat(ctx, orgId, "contacts.active", +1);
		inserted += 1;

		for (const tagName of seed.tags ?? []) {
			const tagId = tagNameToId.get(tagName.toLowerCase());
			if (!tagId) continue;
			await ctx.db.insert("entityTags", {
				orgId,
				entityType: "contact",
				entityId: id,
				tagId,
				createdAt: now,
			});
		}
	}

	// ── Insert deals ─────────────────────────────────────────────────
	const dealTitleToCode = new Map<string, string>();
	const dealTitleToId = new Map<string, Id<"deals">>();
	if (dealPipeline) {
		for (const seed of data.deals ?? []) {
			const stageId = stageCodeToId.get(seed.stageCode);
			if (!stageId) continue; // Skip if the template author referenced a stage that doesn't exist.

			const dealCode = await generateEntityCode(ctx, orgId, "deal");
			const contactId = seed.contactDisplayName
				? contactDisplayNameToId.get(seed.contactDisplayName)
				: undefined;
			const personCode = seed.contactDisplayName
				? contactDisplayNameToCode.get(seed.contactDisplayName)
				: undefined;
			const companyId = seed.companyKey ? companyKeyToId.get(seed.companyKey) : undefined;
			const companyCode = seed.companyKey ? companyKeyToCode.get(seed.companyKey) : undefined;

			const id = await ctx.db.insert("deals", {
				orgId,
				dealCode,
				title: seed.title,
				value: seed.value,
				currency: org.settings?.defaultCurrency,
				pipelineId: dealPipeline._id,
				currentStageId: stageId,
				stageEnteredAt: now,
				contactId,
				companyId,
				personCode,
				companyCode,
				source: "template_seed",
				excludeFromAI: true,
				createdAt: now,
				updatedAt: now,
			});
			dealTitleToCode.set(seed.title, dealCode);
			dealTitleToId.set(seed.title, id);
			await applyOrgStat(ctx, orgId, "deals.open", +1);
			await applyOrgStat(ctx, orgId, "deals.total", +1);
			if (seed.value) {
				await applyOrgStat(ctx, orgId, "deals.pipelineValue", seed.value);
			}
			inserted += 1;

			for (const tagName of seed.tags ?? []) {
				const tagId = tagNameToId.get(tagName.toLowerCase());
				if (!tagId) continue;
				await ctx.db.insert("entityTags", {
					orgId,
					entityType: "deal",
					entityId: id,
					tagId,
					createdAt: now,
				});
			}
		}
	}

	// ── Insert notes ─────────────────────────────────────────────────
	for (const seed of data.notes ?? []) {
		// Anchor: pick entityType + entityId + personCode by lookup.
		let entityType: string = "org";
		let entityId: string = orgId;
		let personCode: string | undefined;
		if (seed.anchorTo) {
			switch (seed.anchorTo.kind) {
				case "lead": {
					const id = leadDisplayNameToId.get(seed.anchorTo.displayName);
					const code = leadDisplayNameToCode.get(seed.anchorTo.displayName);
					if (id) {
						entityType = "lead";
						entityId = id;
						personCode = code;
					}
					break;
				}
				case "contact": {
					const id = contactDisplayNameToId.get(seed.anchorTo.displayName);
					const code = contactDisplayNameToCode.get(seed.anchorTo.displayName);
					if (id) {
						entityType = "contact";
						entityId = id;
						personCode = code;
					}
					break;
				}
				case "deal": {
					const id = dealTitleToId.get(seed.anchorTo.title);
					if (id) {
						entityType = "deal";
						entityId = id;
					}
					break;
				}
				case "company": {
					const id = companyKeyToId.get(seed.anchorTo.companyKey);
					if (id) {
						entityType = "company";
						entityId = id;
					}
					break;
				}
			}
		}

		const categoryId =
			(seed.categoryName ? catNameToId.get(seed.categoryName.toLowerCase()) : undefined) ??
			defaultCategoryId;

		await ctx.db.insert("notes", {
			orgId,
			entityType,
			entityId,
			personCode,
			content: seed.content,
			categoryId,
			authorId: actorUserId,
			authorType: "system",
			isPinned: false,
			isInternal: false,
			createdAt: now,
			updatedAt: now,
			excludeFromAI: true,
		});
		inserted += 1;
	}

	// ── Insert tasks ─────────────────────────────────────────────────
	for (const seed of data.tasks ?? []) {
		// Anchor lookup — tasks need both a personCode AND an entityType+entityId.
		let entityType: string = "org";
		let entityId: string = orgId;
		let personCode: string = "";
		let dealCode: string | undefined;
		if (seed.anchorTo) {
			switch (seed.anchorTo.kind) {
				case "lead": {
					const id = leadDisplayNameToId.get(seed.anchorTo.displayName);
					const code = leadDisplayNameToCode.get(seed.anchorTo.displayName);
					if (id && code) {
						entityType = "lead";
						entityId = id;
						personCode = code;
					}
					break;
				}
				case "contact": {
					const id = contactDisplayNameToId.get(seed.anchorTo.displayName);
					const code = contactDisplayNameToCode.get(seed.anchorTo.displayName);
					if (id && code) {
						entityType = "contact";
						entityId = id;
						personCode = code;
					}
					break;
				}
				case "deal": {
					const id = dealTitleToId.get(seed.anchorTo.title);
					const code = dealTitleToCode.get(seed.anchorTo.title);
					if (id && code) {
						entityType = "deal";
						entityId = id;
						dealCode = code;
					}
					break;
				}
			}
		}

		// Tasks may have a personCode or be deal-only. Skip the seed if
		// we couldn't resolve any anchor — better than violating the
		// schema's entityType/entityId requirements.
		if (!personCode && entityType !== "deal") continue;

		const taskCode = await generateEntityCode(ctx, orgId, "task");
		const dueAt = now + seed.dueOffsetDays * 86_400_000;

		// Map the legacy seed `source` to the new closed `type` union.
		// "followup" stays on the cadence type; everything else lands as a
		// generic todo so the seeded mock remains valid under the new shape.
		const seedType: "todo" | "followup" = seed.source === "followup" ? "followup" : "todo";

		await ctx.db.insert("tasks", {
			orgId,
			taskCode,
			type: seedType,
			personCode: personCode || undefined,
			dealCode,
			entityType,
			entityId,
			title: seed.title,
			dueAt,
			assignedTo: actorUserId,
			status: "pending",
			priority: seed.priority,
			createdAt: now,
			updatedAt: now,
			excludeFromAI: true,
		});
		inserted += 1;
	}

	// ── Stamp the seed timestamp ─────────────────────────────────────
	await ctx.db.patch(orgId, {
		settings: {
			...(org.settings ?? {}),
			mockDataSeededAt: now,
		},
		updatedAt: now,
	});

	return { inserted };
}
