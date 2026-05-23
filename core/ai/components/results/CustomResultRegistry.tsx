"use client";

/**
 * core/ai/components/results/CustomResultRegistry.tsx
 *
 * Escape hatch for the `display: { kind: "custom", componentKey, props }` tool
 * payload. Adding a new componentKey REQUIRES landing the matching component
 * in this file — the model cannot inject keys that aren't here.
 *
 * The registry is intentionally empty by default. Adding an entry is a
 * deliberate code-review action: the new component gets wired here, the
 * tool author sets `kind: "custom"` with the registered key, and that's
 * the contract. No runtime extension.
 */

import type { ComponentType } from "react";

type CustomComponent = ComponentType<{ props: Record<string, unknown> }>;

const CUSTOM_REGISTRY: Record<string, CustomComponent> = {
	// Add entries here — see TOOL-RESULT-RENDERING.md §6 for the rules.
	// Example:
	//   "deal-pipeline-summary": DealPipelineSummary,
};

type CustomResultRegistryProps = {
	componentKey: string;
	props: Record<string, unknown>;
};

export function CustomResultRegistry({ componentKey, props }: CustomResultRegistryProps) {
	const Component = CUSTOM_REGISTRY[componentKey];
	if (!Component) {
		// Unknown key — render a safe fallback so the chat doesn't crash.
		return (
			<div className="rounded-[var(--radius)] border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
				Unknown component: <code className="font-mono">{componentKey}</code>
			</div>
		);
	}
	return <Component props={props} />;
}
