"use client";

/**
 * MockDataPreview — read-only JSON viewer for `definition.mockData`.
 *
 * Per L3 of INDUSTRY-TEMPLATES-DB-MIGRATION.md (locked 2026-05-27),
 * full mock-data editing is deferred to v2. v1 surfaces the seeded
 * blob as read-only so operators can audit what new orgs onboard with.
 *
 * Buckets shown: leads / contacts / companies / deals / notes / tasks
 * — each with a row count + the raw JSON. Cross-references (companyKey,
 * stageCode, anchorTo) are validated server-side at write time via
 * `validateDefinition`; the editor doesn't need to surface them here
 * because there's no edit path.
 */

import { Eye } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Doc } from "@/convex/_generated/dataModel";
import { OwnerSettingsCard } from "../../../components/OwnerSettingsCard";

type Bucket = "leads" | "contacts" | "companies" | "deals" | "notes" | "tasks";
const BUCKETS: Bucket[] = ["leads", "contacts", "companies", "deals", "notes", "tasks"];

export function MockDataPreview({ template }: { template: Doc<"platformTemplates"> }) {
	const mockData = useMemo(() => {
		const raw = template.definition?.mockData;
		return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
	}, [template.definition]);

	if (!mockData) {
		return (
			<OwnerSettingsCard
				title="Mock data"
				description="Sample records seeded into new orgs alongside this template: leads, contacts, companies, deals, notes, tasks. Read-only in v1."
			>
				<p className="text-sm text-muted-foreground">
					No mock data configured for this template.
				</p>
			</OwnerSettingsCard>
		);
	}

	return (
		<OwnerSettingsCard
			title="Mock data"
			description="Sample records seeded into new orgs alongside this template. Read-only in v1. Full cross-reference editor lands in v2 (see Future-Enhancements §B for the plan)."
		>
			<Alert variant="default" className="mb-4 border-muted-foreground/20 bg-muted/40">
				<AlertDescription className="text-xs leading-relaxed">
					Edits require running a migration; the platform has no UI to add/remove rows
					here yet. To change a built-in template's mock data, edit the seed file + re-run
					the seeder. To stop new orgs from getting any mock data on this template, delete
					the <code>mockData</code> key via the JSON-edit fallback.
				</AlertDescription>
			</Alert>

			<div className="space-y-3">
				{BUCKETS.map((bucket) => (
					<BucketRow key={bucket} bucket={bucket} value={mockData[bucket]} />
				))}
			</div>
		</OwnerSettingsCard>
	);
}

function BucketRow({ bucket, value }: { bucket: Bucket; value: unknown }) {
	const [expanded, setExpanded] = useState(false);
	const arr = Array.isArray(value) ? value : null;
	const count = arr?.length ?? 0;

	return (
		<div className="rounded-[var(--radius)] border border-border/60">
			<button
				type="button"
				className="flex w-full items-center justify-between gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted/40"
				onClick={() => setExpanded((v) => !v)}
				aria-expanded={expanded}
			>
				<span className="flex items-center gap-2">
					<span className="font-mono text-xs uppercase text-muted-foreground">
						{bucket}
					</span>
					<span className="rounded-[var(--radius)] bg-muted px-1.5 py-0.5 text-[10px] font-medium">
						{count} row{count === 1 ? "" : "s"}
					</span>
				</span>
				<Button type="button" size="sm" variant="ghost" className="pointer-events-none">
					<Eye className="h-3.5 w-3.5" />
					{expanded ? "Hide" : "View JSON"}
				</Button>
			</button>
			{expanded ? (
				<pre className="max-h-96 overflow-auto border-t border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11px]">
					{JSON.stringify(value, null, 2)}
				</pre>
			) : null}
		</div>
	);
}
