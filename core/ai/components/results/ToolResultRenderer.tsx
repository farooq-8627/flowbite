"use client";

/**
 * core/ai/components/results/ToolResultRenderer.tsx
 *
 * Dispatcher for `display: ToolDisplay` payloads emitted by AI tool results.
 * Reads `display.kind` and mounts the right card from this folder.
 *
 * The renderer is intentionally NOT pluggable beyond the discriminated
 * union — every kind maps to ONE component file, so jumping from a tool
 * authoring question ("how should this render?") to the rendering code
 * is a single grep away. New kinds REQUIRE a code review for the new
 * component PLUS the new union variant in `convex/ai/tools/_shared.ts`.
 *
 * String `display` values are coerced into `{ kind: "text", text }` for
 * backwards compatibility with tools that haven't migrated yet — they
 * render as Markdown via the existing `<Markdown>` component.
 */

import { Markdown } from "@/core/ai/components/markdown/Markdown";
import { DealCodeCard, PersonCodeCard } from "./CodeLookupCard";
import { CustomResultRegistry } from "./CustomResultRegistry";
import { DiffResultCard } from "./DiffResultCard";
import { EntityListResultCard } from "./EntityListResultCard";
import { EntityResultCard } from "./EntityResultCard";
import { InsightResultCard } from "./InsightResultCard";
import { NoteResultCard } from "./NoteResultCard";
import { SettingsResultCard } from "./SettingsResultCard";
import { TaskResultCard } from "./TaskResultCard";

// Local re-statement of the discriminated union the backend declares in
// `convex/ai/tools/_shared.ts`. We re-state here to avoid a frontend ↔
// Convex cross-import that would pull Convex types into the bundle.
export type ToolDisplay =
	| { kind: "text"; text: string }
	| {
			kind: "entity";
			entityType: "lead" | "contact" | "deal" | "company";
			entityId: string;
			/**
			 * P1.9 — when present, EntityResultCard surfaces these fields
			 * instead of the hardcoded default 5. Tools that return a
			 * {@link ToolSummary} with `cardFields` get this spliced in
			 * by `TimelineRow` before the renderer is mounted.
			 */
			cardFields?: string[];
	  }
	| {
			kind: "entityList";
			entityType: "lead" | "contact" | "deal" | "company";
			entityIds: string[];
	  }
	| { kind: "personCode"; personCode: string }
	| { kind: "dealCode"; dealCode: string }
	| { kind: "note"; noteId: string }
	| { kind: "task"; taskId: string }
	| {
			kind: "diff";
			entityType: "lead" | "contact" | "deal" | "company";
			entityId: string;
			before: Record<string, unknown>;
			after: Record<string, unknown>;
	  }
	| { kind: "insight"; insightId: string }
	| { kind: "settings"; sectionId: string }
	| { kind: "custom"; componentKey: string; props: Record<string, unknown> };

type ToolResultRendererProps = {
	display: ToolDisplay | string | undefined;
	orgId: string;
};

export function ToolResultRenderer({ display, orgId }: ToolResultRendererProps) {
	if (display === undefined || display === null) return null;

	// Backwards compat: tools that haven't migrated still emit a plain
	// string. Treat as `{ kind: "text" }`.
	if (typeof display === "string") {
		return <Markdown source={display} />;
	}

	switch (display.kind) {
		case "text":
			return <Markdown source={display.text} />;
		case "entity":
			return (
				<EntityResultCard
					entityType={display.entityType}
					entityId={display.entityId}
					orgId={orgId}
					cardFields={display.cardFields}
				/>
			);
		case "entityList":
			return (
				<EntityListResultCard
					entityType={display.entityType}
					entityIds={display.entityIds}
					orgId={orgId}
				/>
			);
		case "personCode":
			return <PersonCodeCard personCode={display.personCode} orgId={orgId} />;
		case "dealCode":
			return <DealCodeCard dealCode={display.dealCode} orgId={orgId} />;
		case "note":
			return <NoteResultCard noteId={display.noteId} orgId={orgId} />;
		case "task":
			return <TaskResultCard taskId={display.taskId} orgId={orgId} />;
		case "diff":
			return (
				<DiffResultCard
					entityType={display.entityType}
					entityId={display.entityId}
					before={display.before}
					after={display.after}
					orgId={orgId}
				/>
			);
		case "insight":
			return <InsightResultCard insightId={display.insightId} orgId={orgId} />;
		case "settings":
			return <SettingsResultCard sectionId={display.sectionId} orgId={orgId} />;
		case "custom":
			return (
				<CustomResultRegistry componentKey={display.componentKey} props={display.props} />
			);
		default: {
			// Exhaustiveness check — TypeScript catches new kinds at compile
			// time. The fallthrough renders nothing so an unknown kind is
			// quietly suppressed instead of crashing the chat.
			const _exhaustive: never = display;
			return null;
		}
	}
}

// Re-export the slot-card components so consumers can use them in isolation
// (e.g. previews, tests).
export {
	CustomResultRegistry,
	DealCodeCard,
	DiffResultCard,
	EntityListResultCard,
	EntityResultCard,
	InsightResultCard,
	NoteResultCard,
	PersonCodeCard,
	SettingsResultCard,
	TaskResultCard,
	// Direct CodeLookupCard import is rare — keep it discoverable.
};
