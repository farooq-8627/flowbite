/**
 * Tests for `partitionRowKeys` — the bulk_create_entities row dispatcher.
 *
 * 2026-06-06 (evening) — refactored to exercise the unified
 * `dynamicFieldDispatch.ts` dispatcher. The dispatcher reads the org's
 * live `fieldDefinitions` rows (seeded here as `FieldDefRow[]`) and
 * routes by `def.storage` + `def.columnKey` exclusively. NO hardcoded
 * column lists anywhere — admin-added column-backed fields work
 * automatically.
 *
 * Hero case is the user's verbatim real-estate payload (Alice Johnson):
 * confirms every top-level key lands in the right bucket when the org's
 * fieldDefinitions match what the field manager seeded.
 */

import { describe, expect, it } from "vitest";
import { partitionRowKeys } from "./bulkRowPartition";
import { buildFieldDefLookup, type FieldDefRow } from "./dynamicFieldDispatch";

/**
 * The lead-entity field definitions for a real-estate org. Mirrors what
 * the templates seeder writes: system fields (storage:"column" with
 * `columnKey`) + admin-added customs (storage:"fieldValues"). This is
 * the exact shape `loadFieldDefinitionsForEntity` returns from the live
 * DB — no test-only mocking needed.
 */
function realEstateLeadDefs(): FieldDefRow[] {
	return [
		// System columns (always seeded by `convex/orgs/templates/fields.ts`)
		{
			name: "displayName",
			label: "Name",
			storage: "column",
			columnKey: "displayName",
			system: true,
		},
		{ name: "email", label: "Email", storage: "column", columnKey: "email", system: true },
		{ name: "phone", label: "Phone", storage: "column", columnKey: "phone", system: true },
		{ name: "source", label: "Source", storage: "column", columnKey: "source", system: true },
		{ name: "status", label: "Status", storage: "column", columnKey: "status", system: true },
		{
			name: "assignedTo",
			label: "Assignee",
			storage: "column",
			columnKey: "assignedTo",
			system: true,
		},
		{ name: "tags", label: "Tags", storage: "join", system: true },
		// Real-estate industry custom fields
		{ name: "bedrooms", label: "Bedrooms", storage: "fieldValues" },
		{ name: "budget_aed", label: "Budget (AED)", storage: "fieldValues" },
		{ name: "budget_range", label: "Budget Range", storage: "fieldValues" },
		{ name: "company_size", label: "Company Size", storage: "fieldValues" },
		{ name: "deadline", label: "Desired Deadline", storage: "fieldValues" },
		{ name: "industry_vertical", label: "Industry Vertical", storage: "fieldValues" },
		{ name: "intent", label: "Buy or Rent", storage: "fieldValues" },
		{ name: "lead_source_detail", label: "Source Detail", storage: "fieldValues" },
		{ name: "preferred_area", label: "Preferred Area", storage: "fieldValues" },
		{ name: "project_type", label: "Project Type", storage: "fieldValues" },
		{ name: "property_type", label: "Property Type", storage: "fieldValues" },
		{ name: "referral_source", label: "How they found you", storage: "fieldValues" },
	];
}

describe("partitionRowKeys (dispatcher-backed)", () => {
	it("the user's actual bulk_create_entities payload — every field lands in the right bucket", () => {
		const lookup = buildFieldDefLookup(realEstateLeadDefs());
		const row = {
			bedrooms: "2BR",
			budget_aed: 1200000,
			budget_range: "$15K–$50K",
			company_size: "11-50",
			customFields: {},
			deadline: "2024-12-31",
			displayName: "Alice Johnson",
			email: "alice.johnson@example.com",
			industry_vertical: "SaaS",
			intent: "Buy",
			lead_source_detail: "Inbound — website",
			phone: "+971500111222",
			preferred_area: "Dubai Marina",
			project_type: "Consulting",
			property_type: "Apartment",
			referral_source: "Referral",
			source: "web",
			status: "new",
		};
		const result = partitionRowKeys("lead", row, lookup);

		// columnArgs = exactly the storage:"column" seeded keys
		expect(result.columnArgs).toEqual({
			displayName: "Alice Johnson",
			email: "alice.johnson@example.com",
			phone: "+971500111222",
			source: "web",
			status: "new",
		});

		// customFields = every storage:"fieldValues" seeded key, lifted
		// from top level (model didn't nest them) into the bucket.
		expect(result.customFields).toEqual({
			bedrooms: "2BR",
			budget_aed: 1200000,
			budget_range: "$15K–$50K",
			company_size: "11-50",
			deadline: "2024-12-31",
			industry_vertical: "SaaS",
			intent: "Buy",
			lead_source_detail: "Inbound — website",
			preferred_area: "Dubai Marina",
			project_type: "Consulting",
			property_type: "Apartment",
			referral_source: "Referral",
		});

		// Nothing dropped — every top-level key matched a live fieldDef.
		expect(result.dropped).toEqual([]);
	});

	it("admin-added column-backed field (e.g. lead `industry`) is routed to columnArgs", () => {
		// Mirrors what happens when an admin uses the field manager to
		// add a NEW column-backed field. Pre-dispatcher, this would land
		// in `dropped[]` because the hardcoded ENTITY_COLUMN_KEYS missed
		// it. Now: storage:"column" → columnArgs verbatim.
		const lookup = buildFieldDefLookup([
			{ name: "displayName", storage: "column", columnKey: "displayName", system: true },
			{
				name: "industry",
				label: "Industry",
				storage: "column",
				columnKey: "industry",
				system: false,
			},
		]);
		const row = { displayName: "X", industry: "Real Estate" };
		const result = partitionRowKeys("lead", row, lookup);
		expect(result.columnArgs).toEqual({ displayName: "X", industry: "Real Estate" });
		expect(result.customFields).toBeNull();
		expect(result.dropped).toEqual([]);
	});

	it("def.columnKey overrides def.name for column-backed fields", () => {
		// Some seeded fields have `name` ≠ `columnKey` (e.g. legacy
		// renames). The dispatcher MUST honour `columnKey` so the value
		// lands on the right entity-table column.
		const lookup = buildFieldDefLookup([
			{ name: "fullName", storage: "column", columnKey: "displayName", system: true },
		]);
		const row = { fullName: "Sarah" };
		const result = partitionRowKeys("lead", row, lookup);
		expect(result.columnArgs).toEqual({ displayName: "Sarah" });
	});

	it("rewrites label-shaped top-level keys to canonical column / customField slots", () => {
		const lookup = buildFieldDefLookup(realEstateLeadDefs());
		const row = {
			Name: "Sarah", // label form of `displayName`
			"Property Type": "Villa", // label form of `property_type`
			"buy or rent": "Rent — Annual", // case-insensitive label of `intent`
		};
		const result = partitionRowKeys("lead", row, lookup);
		expect(result.columnArgs).toEqual({ displayName: "Sarah" });
		expect(result.customFields).toEqual({
			property_type: "Villa",
			intent: "Rent — Annual",
		});
		expect(result.dropped).toEqual([]);
	});

	it("drops keys that match no fieldDefinition", () => {
		const lookup = buildFieldDefLookup(realEstateLeadDefs());
		const row = {
			displayName: "X",
			completelyBogusKey: "value",
			anotherJunkField: 42,
		};
		const result = partitionRowKeys("lead", row, lookup);
		expect(result.columnArgs).toEqual({ displayName: "X" });
		expect(result.customFields).toBeNull();
		expect(result.dropped.sort()).toEqual(["anotherJunkField", "completelyBogusKey"]);
	});

	it("explicit customFields nesting beats top-level lift on conflict", () => {
		const lookup = buildFieldDefLookup(realEstateLeadDefs());
		const row = {
			displayName: "Y",
			property_type: "Apartment",
			customFields: { property_type: "Villa" },
		};
		const result = partitionRowKeys("lead", row, lookup);
		expect(result.columnArgs).toEqual({ displayName: "Y" });
		// Explicit customFields applied LAST — wins over top-level lift.
		expect(result.customFields).toEqual({ property_type: "Villa" });
	});

	it("explicit customFields with label-shaped keys still get rewritten", () => {
		const lookup = buildFieldDefLookup(realEstateLeadDefs());
		const row = {
			displayName: "Z",
			customFields: { "Property Type": "Office", "Budget Range": "$50K+" },
		};
		const result = partitionRowKeys("lead", row, lookup);
		expect(result.customFields).toEqual({
			property_type: "Office",
			budget_range: "$50K+",
		});
	});

	it("explicit customFields with no fieldDefinitions match passes through under raw key (legacy unknown surfacing)", () => {
		// applyCustomFieldsForRecordImpl will detect the unknown name
		// and surface it via `unknownFields[]` in its return value —
		// preserving the existing UX where a model that emits a real
		// typo gets a clear "I don't know what to do with this" signal.
		const lookup = buildFieldDefLookup(realEstateLeadDefs());
		const row = {
			displayName: "W",
			customFields: { real_typo_here: "value" },
		};
		const result = partitionRowKeys("lead", row, lookup);
		expect(result.customFields).toEqual({ real_typo_here: "value" });
	});

	it("storage:'join' fields (tags) flow through dropped — bulk-create runs them via dedicated tools", () => {
		const lookup = buildFieldDefLookup(realEstateLeadDefs());
		const row = { displayName: "X", tags: ["hot-lead", "vip"] };
		const result = partitionRowKeys("lead", row, lookup);
		expect(result.columnArgs).toEqual({ displayName: "X" });
		// `tags` lands in dropped (the legacy partition shape collapses
		// joinFields into dropped — see bulkRowPartition.ts shim).
		expect(result.dropped).toEqual(["tags"]);
	});

	it("storage missing (legacy fieldDefinitions) falls back to fieldValues bucket", () => {
		const lookup = buildFieldDefLookup([
			{ name: "displayName", storage: "column", columnKey: "displayName", system: true },
			// Pre-storage-flag legacy field — should still route correctly.
			{ name: "legacy_note", label: "Legacy Note" },
		]);
		const row = { displayName: "X", legacy_note: "carry-over" };
		const result = partitionRowKeys("lead", row, lookup);
		expect(result.columnArgs).toEqual({ displayName: "X" });
		expect(result.customFields).toEqual({ legacy_note: "carry-over" });
	});

	it("hidden fields are excluded from the lookup → drop", () => {
		const lookup = buildFieldDefLookup([
			{ name: "displayName", storage: "column", columnKey: "displayName", system: true },
			{ name: "secret_field", storage: "fieldValues", hidden: true },
		]);
		const row = { displayName: "X", secret_field: "should drop" };
		const result = partitionRowKeys("lead", row, lookup);
		expect(result.columnArgs).toEqual({ displayName: "X" });
		expect(result.customFields).toBeNull();
		expect(result.dropped).toEqual(["secret_field"]);
	});

	it("empty row → empty result", () => {
		const lookup = buildFieldDefLookup(realEstateLeadDefs());
		const result = partitionRowKeys("lead", {}, lookup);
		expect(result.columnArgs).toEqual({});
		expect(result.customFields).toBeNull();
		expect(result.dropped).toEqual([]);
	});

	it("non-object customFields slot is ignored (defensive against malformed model output)", () => {
		const lookup = buildFieldDefLookup(realEstateLeadDefs());
		const row = { displayName: "X", customFields: "not-an-object" };
		const result = partitionRowKeys("lead", row, lookup);
		expect(result.columnArgs).toEqual({ displayName: "X" });
		expect(result.customFields).toBeNull();
		expect(result.dropped).toEqual([]);
	});

	it("array customFields slot is ignored", () => {
		const lookup = buildFieldDefLookup(realEstateLeadDefs());
		const row = { displayName: "X", customFields: ["a", "b"] };
		const result = partitionRowKeys("lead", row, lookup);
		expect(result.columnArgs).toEqual({ displayName: "X" });
		expect(result.customFields).toBeNull();
		expect(result.dropped).toEqual([]);
	});
});
