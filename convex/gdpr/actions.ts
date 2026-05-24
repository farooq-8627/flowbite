"use node";

/**
 * GDPR data export — Phase 3A.
 *
 * Compiles every org-scoped record into a curated zip bundle:
 *   - One CSV per table (leads.csv, contacts.csv, …, activityLogs.csv)
 *   - One metadata.json describing org name, plan, member count, export
 *     timestamp, schema version, file inventory.
 *
 * The zip is uploaded to Convex Storage; the action returns a 1-hour
 * signed download URL the UI redirects the user to. Convex Storage
 * objects auto-expire — we don't need a deletion cron.
 *
 * Permission: `data.export` (Owner-only by default).
 *
 * Why "use node": fflate works in both edge and node runtimes but the
 * zip-build is deterministic per-orgId so we keep it on the heavier
 * Node action where memory budgets are larger.
 */

import { ConvexError, v } from "convex/values";
import { strToU8, zipSync } from "fflate";
import { api, internal } from "../_generated/api";
import { action } from "../_generated/server";

/** Escape a value for CSV — quote-wrap when it contains commas/quotes/newlines. */
function csvCell(v: unknown): string {
	if (v === null || v === undefined) return "";
	if (typeof v === "object") return csvCell(JSON.stringify(v));
	const s = String(v);
	if (/[,"\n\r]/.test(s)) {
		return `"${s.replace(/"/g, '""')}"`;
	}
	return s;
}

/** Build a CSV string from an array of objects with a stable column order. */
function rowsToCsv(rows: Array<Record<string, unknown>>): string {
	if (rows.length === 0) return "";
	// Union of all keys, sorted for determinism.
	const keySet = new Set<string>();
	for (const r of rows) {
		for (const k of Object.keys(r)) keySet.add(k);
	}
	const cols = Array.from(keySet).sort();
	const header = cols.join(",");
	const body = rows
		.map((r) => cols.map((c) => csvCell((r as Record<string, unknown>)[c])).join(","))
		.join("\n");
	return `${header}\n${body}`;
}

export const exportOrgData = action({
	args: { orgId: v.id("orgs") },
	handler: async (
		ctx,
		args,
	): Promise<{ downloadUrl: string; storageId: string; bytes: number }> => {
		// Auth + permission check — actions don't have ctx.userId, so we
		// hop through a query that already does the auth.
		const membership = await ctx.runQuery(api.orgs.queries.getMyMembership, {
			orgId: args.orgId,
		});
		if (!membership) {
			throw new ConvexError({
				code: "ORG_MEMBER_NOT_FOUND",
				message: "You are not a member of this workspace.",
			});
		}
		if (!membership.permissions.includes("data.export")) {
			throw new ConvexError({
				code: "PERMISSION_DENIED",
				message: "You don't have permission to export data.",
			});
		}

		// Pull every relevant table in one shot.
		const all = await ctx.runQuery(internal.gdpr.internal.collectAll, { orgId: args.orgId });
		if (!all.org) {
			throw new ConvexError({ code: "ORG_NOT_FOUND", message: "Workspace not found." });
		}

		const now = Date.now();
		const files: Record<string, Uint8Array> = {};

		// Convert each table to CSV (skip empty tables to keep the bundle clean).
		const tables: Array<[string, Array<Record<string, unknown>>]> = [
			["leads", all.leads],
			["contacts", all.contacts],
			["companies", all.companies],
			["deals", all.deals],
			["notes", all.notes],
			["reminders", all.reminders],
			["messages", all.messages],
			["conversations", all.conversations],
			["tags", all.tags],
			["entityTags", all.entityTags],
			["fieldDefinitions", all.fieldDefinitions],
			["fieldValues", all.fieldValues],
			["pipelines", all.pipelines],
			["savedViews", all.savedViews],
			["activityLogs", all.activityLogs],
			["members", all.members],
			["files", all.files],
		];

		const inventory: Array<{ table: string; rowCount: number; bytes: number }> = [];
		for (const [name, rows] of tables) {
			if (rows.length === 0) continue;
			const csv = rowsToCsv(rows as Array<Record<string, unknown>>);
			const bytes = strToU8(csv);
			files[`${name}.csv`] = bytes;
			inventory.push({ table: name, rowCount: rows.length, bytes: bytes.length });
		}

		// metadata.json — points at the bundle's contents, schema version,
		// and basic org descriptors so the user can reload into another
		// system or audit later.
		const metadata = {
			schemaVersion: 1,
			exportedAt: now,
			exportedAtIso: new Date(now).toISOString(),
			org: {
				id: all.org._id,
				name: all.org.name,
				slug: all.org.slug,
				industry: all.org.industry,
				plan: all.org.plan,
				createdAt: all.org.createdAt,
			},
			memberCount: all.members.length,
			inventory,
			notes: [
				"This bundle contains every record stored in your workspace at export time.",
				"CSV files use UTF-8 encoding and quote-escaped values per RFC 4180.",
				"`fieldValues.csv` references `fieldDefinitions.csv` via fieldId.",
				"`entityTags.csv` joins `tags.csv` to the 4 CRM entity tables via entityId.",
			],
		};
		files["metadata.json"] = strToU8(JSON.stringify(metadata, null, 2));

		// Synchronous zip — fflate's `zipSync` is fine here (org payloads
		// are small enough that we don't need streaming compression).
		const zipped = zipSync(files, { level: 6 });

		// Upload to Convex Storage.
		const blob = new Blob([zipped as BlobPart], { type: "application/zip" });
		const storageId = await ctx.storage.store(blob);
		const downloadUrl = await ctx.storage.getUrl(storageId);
		if (!downloadUrl) {
			throw new ConvexError({
				code: "STORAGE_URL_FAILED",
				message: "Failed to mint download URL for the export bundle.",
			});
		}

		return {
			downloadUrl,
			storageId,
			bytes: zipped.length,
		};
	},
});
