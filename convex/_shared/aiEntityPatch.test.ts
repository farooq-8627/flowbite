/**
 * convex/_shared/aiEntityPatch.test.ts
 *
 * Pure unit tests for the patch-splitting + (un)known-field routing
 * logic used by the AI's `commit_update_entity` family.
 *
 * The full applyEntityPatchByCodeImpl path (DB writes + activity log)
 * lives in agentScorer.test.ts under the convex-test runner — those
 * need a real schema / db context. These pure tests guard the SSOT
 * that decides which keys go where.
 */

import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import { splitPatchForEntity } from "./aiEntityPatch";

function fieldDef(
	name: string,
	storage: "fieldValues" | "column" | "join" = "fieldValues",
): Doc<"fieldDefinitions"> {
	// Cast: tests don't care about every required field on the doc,
	// only the four properties splitPatchForEntity reads.
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
		createdAt: 0,
		updatedAt: 0,
	} as Doc<"fieldDefinitions">;
}

function defs(
	pairs: Array<[string, ("fieldValues" | "column" | "join")?]>,
): Map<string, Doc<"fieldDefinitions">> {
	const map = new Map<string, Doc<"fieldDefinitions">>();
	for (const [name, storage] of pairs) {
		map.set(name, fieldDef(name, storage));
	}
	return map;
}

describe("splitPatchForEntity", () => {
	it("routes canonical lead column fields to columnPatch", () => {
		const result = splitPatchForEntity({
			entityType: "lead",
			patch: { displayName: "Sara Khan", email: "s@a.co", phone: "+1234" },
			definitionsByName: defs([]),
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
		const result = splitPatchForEntity({
			entityType: "lead",
			patch: { company_size: "11-50", industry_vertical: "SaaS" },
			definitionsByName: defs([
				["company_size", "fieldValues"],
				["industry_vertical", "fieldValues"],
			]),
		});
		expect(result.columnPatch).toEqual({});
		expect(result.customFields.map((f) => f.name)).toEqual([
			"company_size",
			"industry_vertical",
		]);
		expect(result.unknownFields).toEqual([]);
	});

	it("surfaces unknown fields", () => {
		const result = splitPatchForEntity({
			entityType: "lead",
			patch: { mystery: "value" },
			definitionsByName: defs([]),
		});
		expect(result.columnPatch).toEqual({});
		expect(result.customFields).toEqual([]);
		expect(result.unknownFields).toEqual(["mystery"]);
	});

	it("strips id-shaped keys defensively (Bug 2 root-cause)", () => {
		// PHASE-3-AI-AUDIT.md §6.5 incident-class B — `code` was being
		// passed straight through to the leads update mutation, which
		// only accepts `leadId`. The helper now strips these keys.
		const result = splitPatchForEntity({
			entityType: "lead",
			patch: {
				code: "P-001",
				personCode: "P-001",
				leadId: "leads:abc",
				displayName: "Sara",
			},
			definitionsByName: defs([]),
		});
		expect(result.columnPatch).toEqual({ displayName: "Sara" });
		expect(result.customFields).toEqual([]);
		expect(result.unknownFields).toEqual([]);
	});

	it("ignores undefined values", () => {
		const result = splitPatchForEntity({
			entityType: "lead",
			patch: { displayName: undefined, email: "s@a.co" },
			definitionsByName: defs([]),
		});
		expect(result.columnPatch).toEqual({ email: "s@a.co" });
	});

	it("mixes column + custom + unknown in one pass", () => {
		const result = splitPatchForEntity({
			entityType: "lead",
			patch: {
				displayName: "Sara",
				company_size: "11-50",
				lead_source_detail: "Inbound — website",
				phantom: "value",
			},
			definitionsByName: defs([
				["company_size", "fieldValues"],
				["lead_source_detail", "fieldValues"],
			]),
		});
		expect(result.columnPatch).toEqual({ displayName: "Sara" });
		expect(result.customFields.map((f) => f.name).sort()).toEqual([
			"company_size",
			"lead_source_detail",
		]);
		expect(result.unknownFields).toEqual(["phantom"]);
	});

	it("handles each entity type's column whitelist", () => {
		const dealResult = splitPatchForEntity({
			entityType: "deal",
			patch: { title: "Big Deal", value: 50000, displayName: "shouldBeUnknown" },
			definitionsByName: defs([]),
		});
		expect(dealResult.columnPatch).toEqual({ title: "Big Deal", value: 50000 });
		expect(dealResult.unknownFields).toEqual(["displayName"]);

		const companyResult = splitPatchForEntity({
			entityType: "company",
			patch: { name: "Acme", website: "https://acme.co" },
			definitionsByName: defs([]),
		});
		expect(companyResult.columnPatch).toEqual({
			name: "Acme",
			website: "https://acme.co",
		});
	});

	it("treats join-storage definitions as unknown for the column/value split", () => {
		// Tags live in a join table — they're written via attach/detach,
		// not via a fieldValue upsert. The helper currently surfaces them
		// as "unknown" so the AI gets a clear signal to pick the right
		// tag tool instead of silently dropping the value.
		const result = splitPatchForEntity({
			entityType: "lead",
			patch: { tags: ["Hot"] },
			definitionsByName: defs([["tags", "join"]]),
		});
		expect(result.columnPatch).toEqual({});
		expect(result.customFields).toEqual([]);
		expect(result.unknownFields).toEqual(["tags"]);
	});
});
