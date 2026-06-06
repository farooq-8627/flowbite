/**
 * Unit tests for `makeResolverFromLookup` — the pure rewrite logic
 * behind `buildCustomFieldKeyResolver`. Exercising the helper directly
 * lets us verify behaviour without spinning up an `internalQuery`.
 */
import { describe, expect, it } from "vitest";
import { makeResolverFromLookup } from "./customFieldKeys";

describe("makeResolverFromLookup", () => {
	const lookup = new Map<string, string>([
		["property_type", "property_type"],
		["property type", "property_type"],
		["budget_aed", "budget_aed"],
		["budget (aed)", "budget_aed"],
	]);

	it("rewrites label-shaped keys to canonical names", () => {
		const r = makeResolverFromLookup(lookup);
		expect(r({ "Property Type": "Apartment" })).toEqual({ property_type: "Apartment" });
		expect(r({ "Budget (AED)": 250000 })).toEqual({ budget_aed: 250000 });
	});

	it("passes canonical-name keys through unchanged", () => {
		const r = makeResolverFromLookup(lookup);
		expect(r({ property_type: "Villa", budget_aed: 1_000_000 })).toEqual({
			property_type: "Villa",
			budget_aed: 1_000_000,
		});
	});

	it("passes unknown keys through unchanged so unknownFields surfacing still works", () => {
		const r = makeResolverFromLookup(lookup);
		// "industry_vertical" isn't in the lookup — it should arrive at the
		// mutation as-is so the validator can reject it as an unknown field.
		expect(r({ industry_vertical: "FinTech", "Property Type": "Apartment" })).toEqual({
			industry_vertical: "FinTech",
			property_type: "Apartment",
		});
	});

	it("is case-insensitive for both names and labels", () => {
		const r = makeResolverFromLookup(lookup);
		expect(r({ PROPERTY_TYPE: "Apartment" })).toEqual({ property_type: "Apartment" });
		expect(r({ "property type": "Apartment" })).toEqual({ property_type: "Apartment" });
		expect(r({ "PROPERTY TYPE": "Apartment" })).toEqual({ property_type: "Apartment" });
	});

	it("returns undefined for null / non-object / empty inputs", () => {
		const r = makeResolverFromLookup(lookup);
		expect(r(null)).toBeUndefined();
		expect(r(undefined)).toBeUndefined();
		expect(r("string")).toBeUndefined();
		expect(r(42)).toBeUndefined();
		expect(r({})).toBeUndefined();
	});

	it("preserves value types (numbers, booleans, arrays) on rewrite", () => {
		const r = makeResolverFromLookup(lookup);
		expect(
			r({
				"Property Type": "Apartment",
				"Budget (AED)": 250_000,
				flagged: true,
				tags: ["a", "b"],
			}),
		).toEqual({
			property_type: "Apartment",
			budget_aed: 250_000,
			flagged: true,
			tags: ["a", "b"],
		});
	});

	it("preserves the LAST value when both label + name appear in input", () => {
		// Edge case — model emits both "Property Type" and "property_type"
		// in the same row. Both keys map to the same canonical name; the
		// later iteration order wins (Object.entries preserves insertion).
		const r = makeResolverFromLookup(lookup);
		const out = r({ "Property Type": "Apartment", property_type: "Villa" });
		expect(out).toEqual({ property_type: "Villa" });
	});
});
