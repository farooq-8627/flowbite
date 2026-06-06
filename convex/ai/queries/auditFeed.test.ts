/**
 * B.39 — pure-helper tests for `convex/ai/queries/auditFeed.ts`.
 * Convex DB is mocked at the helper boundary; the listAuditFeedImpl scan
 * itself is exercised via the broader integration suite (it composes the
 * same indexed query the trace UI uses).
 */
import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../../_generated/dataModel";
import {
	type AuditFeedRow,
	applyAuditFilters,
	extractCapabilityFromAction,
	projectAuditRow,
	readMetaNumber,
	readMetaString,
} from "./auditFeed";

function makeRow(over: Partial<Doc<"activityLogs">> = {}): Doc<"activityLogs"> {
	return {
		_id: "a1" as unknown as Id<"activityLogs">,
		_creationTime: 1,
		orgId: "o1" as unknown as Id<"orgs">,
		userId: "u1" as unknown as Id<"users">,
		actorType: "ai",
		action: "ai.cap.create_lead",
		entityType: "ai_capability",
		entityId: "create_lead",
		description: "AI ran create_lead: Created P-001",
		createdAt: 1,
		metadata: {
			status: "ok",
			channel: "chat",
			source: "chat",
			riskTier: "reversible",
			module: "leads",
			group: "leads",
			argKeys: "displayName",
			argSummary: "displayName=Sara",
		},
		...over,
	} as Doc<"activityLogs">;
}

describe("extractCapabilityFromAction", () => {
	it("strips the ai.cap. prefix", () => {
		expect(extractCapabilityFromAction("ai.cap.create_lead")).toBe("create_lead");
		expect(extractCapabilityFromAction("ai.cap.bulk_delete_entities")).toBe(
			"bulk_delete_entities",
		);
	});
	it("returns the input unchanged when no prefix matches", () => {
		expect(extractCapabilityFromAction("ai.autonomous.turn")).toBe("ai.autonomous.turn");
		expect(extractCapabilityFromAction("manual.action")).toBe("manual.action");
	});
});

describe("readMetaString / readMetaNumber", () => {
	it("returns the fallback when metadata is undefined", () => {
		expect(readMetaString(undefined, "source")).toBe("");
		expect(readMetaString(undefined, "source", "chat")).toBe("chat");
		expect(readMetaNumber(undefined, "errorCount")).toBeUndefined();
	});
	it("returns the typed value when present", () => {
		const meta = { source: "autonomous", errorCount: 3 };
		expect(readMetaString(meta, "source", "fallback")).toBe("autonomous");
		expect(readMetaNumber(meta, "errorCount")).toBe(3);
	});
	it("returns the fallback when the type does not match", () => {
		const meta = { source: 42 };
		expect(readMetaString(meta, "source", "chat")).toBe("chat");
		expect(readMetaNumber({ errorCount: "lots" }, "errorCount")).toBeUndefined();
	});
});

describe("projectAuditRow", () => {
	it("projects the canonical row shape", () => {
		const row = makeRow();
		const projected = projectAuditRow(row);
		expect(projected.capability).toBe("create_lead");
		expect(projected.action).toBe("ai.cap.create_lead");
		expect(projected.status).toBe("ok");
		expect(projected.source).toBe("chat");
		expect(projected.riskTier).toBe("reversible");
		expect(projected.argSummary).toBe("displayName=Sara");
	});

	it("preserves the autonomous source override (B.38 round-trip)", () => {
		const row = makeRow({
			metadata: {
				status: "ok",
				channel: "whatsapp",
				source: "autonomous",
				riskTier: "reversible",
				module: "leads",
				group: "leads",
			},
		});
		const projected = projectAuditRow(row);
		expect(projected.source).toBe("autonomous");
		expect(projected.channel).toBe("whatsapp");
	});

	it("captures errorCount + conversationId + personCode when present", () => {
		const row = makeRow({
			personCode: "P-007",
			metadata: {
				status: "partial",
				channel: "chat",
				source: "chat",
				riskTier: "irreversible",
				module: "bulk",
				group: "bulk",
				errorCount: 3,
				conversationId: "c1",
			},
		});
		const projected = projectAuditRow(row);
		expect(projected.errorCount).toBe(3);
		expect(projected.conversationId).toBe("c1");
		expect(projected.personCode).toBe("P-007");
	});
});

describe("applyAuditFilters", () => {
	const sample: AuditFeedRow[] = [
		{
			id: "a" as unknown as Id<"activityLogs">,
			createdAt: 1000,
			userId: "u1" as unknown as Id<"users">,
			capability: "create_lead",
			action: "ai.cap.create_lead",
			description: "ok",
			status: "ok",
			channel: "chat",
			source: "chat",
			riskTier: "reversible",
			module: "leads",
			group: "leads",
		},
		{
			id: "b" as unknown as Id<"activityLogs">,
			createdAt: 2000,
			userId: "u2" as unknown as Id<"users">,
			capability: "create_lead",
			action: "ai.cap.create_lead",
			description: "ok",
			status: "ok",
			channel: "whatsapp",
			source: "autonomous",
			riskTier: "reversible",
			module: "leads",
			group: "leads",
		},
		{
			id: "c" as unknown as Id<"activityLogs">,
			createdAt: 3000,
			userId: "u1" as unknown as Id<"users">,
			capability: "bulk_delete_entities",
			action: "ai.cap.bulk_delete_entities",
			description: "fail",
			status: "denied",
			channel: "chat",
			source: "chat",
			riskTier: "irreversible",
			module: "bulk",
			group: "bulk",
		},
	];

	it("filters by source", () => {
		const result = applyAuditFilters(sample, { source: "autonomous" });
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(sample[1].id);
	});

	it("filters by status", () => {
		const result = applyAuditFilters(sample, { status: "denied" });
		expect(result).toHaveLength(1);
		expect(result[0].capability).toBe("bulk_delete_entities");
	});

	it("filters by riskTier", () => {
		const result = applyAuditFilters(sample, { riskTier: "irreversible" });
		expect(result).toHaveLength(1);
		expect(result[0].capability).toBe("bulk_delete_entities");
	});

	it("intersects multiple filters", () => {
		const result = applyAuditFilters(sample, {
			source: "chat",
			capability: "create_lead",
		});
		expect(result).toHaveLength(1);
		expect(result[0].id).toBe(sample[0].id);
	});

	it("filters by since/until window", () => {
		const onlyMid = applyAuditFilters(sample, { since: 1500, until: 2500 });
		expect(onlyMid).toHaveLength(1);
		expect(onlyMid[0].id).toBe(sample[1].id);
	});

	it("returns the input unchanged when no filters are passed", () => {
		expect(applyAuditFilters(sample, {})).toHaveLength(sample.length);
	});
});
