/**
 * convex/_shared/aiEntityPatch.test.ts
 *
 * Pure unit tests for the patch-splitting + (un)known-field routing
 * logic used by the AI's `commit_update_entity` family.
 *
 * 2026-06-06 (evening) — refactored after `splitPatchForEntity` was
 * rewritten to use the unified `dynamicFieldDispatch.ts` dispatcher.
 * The dispatcher reads the org's LIVE `fieldDefinitions` rows for ALL
 * routing decisions — there are no hardcoded "lead has displayName as
 * a column" assumptions anywhere in code. Tests therefore seed system
 * column fields explicitly via `defs([...])`, matching what
 * `convex/orgs/templates/fields.ts` writes to every new org.
 */

import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import { splitPatchForEntity } from "./aiEntityPatch";

function fieldDef(
	name: string,
	storage: "fieldValues" | "column" | "join" = "fieldValues",
	columnKey?: string,
): Doc<"fieldDefinitions"> {
	return {
		_id: `field_${name}` as unknown as Id<"fieldDefinitions">,
		_creationTime: 0,
		orgId: "" as unknown as Id<"orgs">,
		entityType: "lead",
		name,
		label: name,
		type: storage === "fieldValues" ? "select" : "text",
		required: false,
		order: 0,
		storage,
		columnKey: storage === "column" ? (columnKey ?? name) : undefined,
		createdAt: 0,
		updatedAt: 0,
	} as Doc<"fieldDefinitions">;
}

function defs(
	pairs: Array<[string, ("fieldValues" | "column" | "join")?, string?]>,
): Map<string, Doc<"fieldDefinitions">> {
	const map = new Map<string, Doc<"fieldDefinitions">>();
	for (const [name, storage, columnKey] of pairs) {
		map.set(name, fieldDef(name, storage, columnKey));
	}
	return map;
}

/** System lead columns that every new org gets seeded with. Mirrors
 * `convex/orgs/templates/fields.ts:BUILT_IN_LEAD_FIELDS`. */
function systemLeadDefs(): Map<string, Doc<"fieldDefinitions">> {
	return defs([
		["displayName", "column"],
		["email", "column"],
		["phone", "column"],
		["status", "column"],
		["source", "column"],
		["assignedTo", "column"],
	]);
}

/** System deal columns that every new org gets seeded with. */
function systemDealDefs(): Map<string, Doc<"fieldDefinitions">> {
	const m = new Map<string, Doc<"fieldDefinitions">>();
	for (const [name, columnKey] of [
		["title", "title"],
		["value", "value"],
		["currency", "currency"],
		["assignedTo", "assignedTo"],
	]) {
		// Override entityType to "deal" for the doc.
		const d = fieldDef(name, "column", columnKey) as Doc<"fieldDefinitions">;
		(d as { entityType: string }).entityType = "deal";
		m.set(name, d);
	}
	return m;
}

/** System company columns. */
function systemCompanyDefs(): Map<string, Doc<"fieldDefinitions">> {
	const m = new Map<string, Doc<"fieldDefinitions">>();
	for (const name of ["name", "industry", "website", "size", "assignedTo"]) {
		const d = fieldDef(name, "column", name);
		(d as { entityType: string }).entityType = "company";
		m.set(name, d);
	}
	return m;
}

describe("splitPatchForEntity", () => {
	it("routes canonical lead column fields to columnPatch (via fieldDefinitions storage:'column')", () => {
		const result = splitPatchForEntity({
			entityType: "lead",
			patch: { displayName: "Sara Khan", email: "s@a.co", phone: "+1234" },
			definitionsByName: systemLeadDefs(),
		});
		expect(result.columnPatch).toEqual({
			displayName: "Sara Khan",
			email: "s@a.co",
			phone: "+1234",
		});
		expect(result.customFields).toEqual([]);
		expect(result.unknownFields).toEqual([]);
	});

	it("routes fieldValues-storage keys to customFields", () => {
		const seeded = systemLeadDefs();
		seeded.set("company_size", fieldDef("company_size", "fieldValues"));
		seeded.set("industry_vertical", fieldDef("industry_vertical", "fieldValues"));
		const result = splitPatchForEntity({
			entityType: "lead",
			patch: { company_size: "11-50", industry_vertical: "SaaS" },
			definitionsByName: seeded,
		});
		expect(result.columnPatch).toEqual({});
		expect(result.customFields.map((f) => f.name).sort()).toEqual([
			"company_size",
			"industry_vertical",
		]);
		expect(result.unknownFields).toEqual([]);
	});

	it("surfaces unknown fields (no fieldDefinition match)", () => {
		const result = splitPatchForEntity({
			entityType: "lead",
			patch: { mystery: "value" },
			definitionsByName: systemLeadDefs(),
		});
		expect(result.columnPatch).toEqual({});
		expect(result.customFields).toEqual([]);
		expect(result.unknownFields).toEqual(["mystery"]);
	});

	it("strips id-shaped keys defensively (Bug 2 root-cause)", () => {
		// `code` / `personCode` / `leadId` etc. NEVER reach the
		// dispatcher — they're dropped by the BLOCKED_KEYS pre-filter
		// so they don't accidentally surface as `unknownFields[]` either.
		const result = splitPatchForEntity({
			entityType: "lead",
			patch: {
				code: "P-001",
				personCode: "P-001",
				leadId: "leads:abc",
				displayName: "Sara",
			},
			definitionsByName: systemLeadDefs(),
		});
		expect(result.columnPatch).toEqual({ displayName: "Sara" });
		expect(result.customFields).toEqual([]);
		expect(result.unknownFields).toEqual([]);
	});

	it("ignores undefined values", () => {
		const result = splitPatchForEntity({
			entityType: "lead",
			patch: { displayName: undefined, email: "s@a.co" },
			definitionsByName: systemLeadDefs(),
		});
		expect(result.columnPatch).toEqual({ email: "s@a.co" });
	});

	it("mixes column + custom + unknown in one pass", () => {
		const seeded = systemLeadDefs();
		seeded.set("company_size", fieldDef("company_size", "fieldValues"));
		seeded.set("lead_source_detail", fieldDef("lead_source_detail", "fieldValues"));
		const result = splitPatchForEntity({
			entityType: "lead",
			patch: {
				displayName: "Sara",
				company_size: "11-50",
				lead_source_detail: "Inbound — website",
				phantom: "value",
			},
			definitionsByName: seeded,
		});
		expect(result.columnPatch).toEqual({ displayName: "Sara" });
		expect(result.customFields.map((f) => f.name).sort()).toEqual([
			"company_size",
			"lead_source_detail",
		]);
		expect(result.unknownFields).toEqual(["phantom"]);
	});

	it("handles each entity type's column whitelist via seeded fieldDefinitions", () => {
		// Deal — `displayName` is NOT a deal column, so it lands as unknown.
		const dealResult = splitPatchForEntity({
			entityType: "deal",
			patch: { title: "Big Deal", value: 50000, displayName: "shouldBeUnknown" },
			definitionsByName: systemDealDefs(),
		});
		expect(dealResult.columnPatch).toEqual({ title: "Big Deal", value: 50000 });
		expect(dealResult.unknownFields).toEqual(["displayName"]);

		const companyResult = splitPatchForEntity({
			entityType: "company",
			patch: { name: "Acme", website: "https://acme.co" },
			definitionsByName: systemCompanyDefs(),
		});
		expect(companyResult.columnPatch).toEqual({
			name: "Acme",
			website: "https://acme.co",
		});
	});

	it("treats join-storage definitions as unknown for the column/value split", () => {
		// Tags live in a join table — written via attach/detach, not
		// via a fieldValue upsert. The helper surfaces them as "unknown"
		// so the AI gets a clear signal to pick the right tag tool
		// instead of silently dropping the value.
		const seeded = systemLeadDefs();
		seeded.set("tags", fieldDef("tags", "join"));
		const result = splitPatchForEntity({
			entityType: "lead",
			patch: { tags: ["Hot"] },
			definitionsByName: seeded,
		});
		expect(result.columnPatch).toEqual({});
		expect(result.customFields).toEqual([]);
		expect(result.unknownFields).toEqual(["tags"]);
	});

	it("admin-added column-backed field (e.g. lead `industry`) flows through correctly", () => {
		// This is the test that proves "everything dynamic" — admin adds
		// a new column-backed field via the field manager, AI can write
		// to it on the next turn with NO code change here.
		const seeded = systemLeadDefs();
		seeded.set("industry", fieldDef("industry", "column", "industry"));
		const result = splitPatchForEntity({
			entityType: "lead",
			patch: { displayName: "Sarah", industry: "Real Estate" },
			definitionsByName: seeded,
		});
		expect(result.columnPatch).toEqual({ displayName: "Sarah", industry: "Real Estate" });
		expect(result.customFields).toEqual([]);
		expect(result.unknownFields).toEqual([]);
	});

	it("respects def.columnKey when name differs from columnKey", () => {
		const seeded = new Map<string, Doc<"fieldDefinitions">>();
		// Some legacy templates expose the column under a different name.
		seeded.set("fullName", fieldDef("fullName", "column", "displayName"));
		const result = splitPatchForEntity({
			entityType: "lead",
			patch: { fullName: "Sarah" },
			definitionsByName: seeded,
		});
		expect(result.columnPatch).toEqual({ displayName: "Sarah" });
	});
});
