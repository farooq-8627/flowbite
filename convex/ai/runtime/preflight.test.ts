/**
 * Unit tests for the pure `entityTypesForGroups` + `renderPreflightContext`
 * helpers. The DB-touching `loadPreflightContext` is exercised by the
 * end-to-end host tests; here we just verify the rendering shape +
 * group→entity mapping in isolation.
 */
import { describe, expect, it } from "vitest";
import { entityTypesForGroups, type PreflightContext, renderPreflightContext } from "./preflight";

describe("entityTypesForGroups", () => {
	it("maps entity-related groups to entity types and dedupes", () => {
		expect(entityTypesForGroups(["leads"])).toEqual(["contact", "lead"]);
		expect(entityTypesForGroups(["contacts"])).toEqual(["contact"]);
		expect(entityTypesForGroups(["deals"])).toEqual(["deal"]);
		expect(entityTypesForGroups(["companies"])).toEqual(["company"]);
		expect(entityTypesForGroups(["bulk"])).toEqual(["company", "contact", "deal", "lead"]);
		expect(entityTypesForGroups(["leads", "deals"])).toEqual(["contact", "deal", "lead"]);
		expect(entityTypesForGroups(["leads", "leads"])).toEqual(["contact", "lead"]);
	});

	it("returns an empty array for non-entity groups", () => {
		expect(entityTypesForGroups([])).toEqual([]);
		expect(entityTypesForGroups(["notes"])).toEqual([]);
		expect(entityTypesForGroups(["tasks", "messaging", "timeline"])).toEqual([]);
	});

	it("ignores unknown / typo group keys without throwing", () => {
		expect(entityTypesForGroups(["leeds", "deal", "company"])).toEqual([]);
	});
});

describe("renderPreflightContext", () => {
	it("returns empty string for an empty context", () => {
		const ctx: PreflightContext = { byEntity: {} };
		expect(renderPreflightContext(ctx)).toBe("");
	});

	it("returns empty string when every entity has zero rows", () => {
		const ctx: PreflightContext = { byEntity: { lead: [], deal: [] } };
		expect(renderPreflightContext(ctx)).toBe("");
	});

	it("renders one heading per entity type with each field on its own line", () => {
		const ctx: PreflightContext = {
			byEntity: {
				lead: [
					{
						name: "property_type",
						label: "Property Type",
						type: "select",
						required: true,
						options: ["Apartment", "Villa"],
					},
					{ name: "budget_aed", label: "Budget (AED)", type: "number", required: false },
				],
				deal: [{ name: "stage_note", label: "Stage Note", type: "text", required: false }],
			},
		};
		const out = renderPreflightContext(ctx);
		expect(out).toContain("## Custom fields");
		expect(out).toContain("### Lead");
		expect(out).toContain("### Deal");
		expect(out).toContain("key:`property_type`");
		expect(out).toContain('label:"Property Type"');
		expect(out).toContain("type:select");
		expect(out).toContain("required");
		expect(out).toContain("options:[Apartment, Villa]");
		expect(out).toContain("key:`budget_aed`");
		expect(out).toContain("type:number");
		// budget_aed isn't required → "required" must appear EXACTLY once
		expect(out.match(/ required\b/g)?.length).toBe(1);
	});

	it("includes the key vs label reminder line", () => {
		const ctx: PreflightContext = {
			byEntity: { lead: [{ name: "x", label: "X", type: "text", required: false }] },
		};
		const out = renderPreflightContext(ctx);
		expect(out).toContain("Use the `key` (NOT the `label`)");
	});

	it("truncates options lists past 12 entries with an ellipsis", () => {
		const opts = Array.from({ length: 20 }, (_, i) => `opt${i}`);
		const ctx: PreflightContext = {
			byEntity: {
				lead: [{ name: "x", label: "X", type: "select", required: false, options: opts }],
			},
		};
		const out = renderPreflightContext(ctx);
		expect(out).toContain("opt0");
		expect(out).toContain("opt11");
		expect(out).toContain(", …]");
		expect(out).not.toContain("opt12");
	});
});
