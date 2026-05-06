/**
 * ModuleGuard — conditionally renders children based on module availability.
 *
 * Checks if a CRM module is enabled for the current workspace.
 * If disabled, renders fallback (default: "Module not available" message).
 *
 * Usage:
 *   <ModuleGuard module="leads">
 *     <LeadsList />
 *   </ModuleGuard>
 */
"use client";

import type { ReactNode } from "react";
import { useModuleEnabled } from "@/core/shell/hooks/useModuleEnabled";

interface ModuleGuardProps {
	/** Module slug or entity type to check */
	module: string;
	/** Content to render if module is enabled */
	children: ReactNode;
	/** Content to render if module is disabled */
	fallback?: ReactNode;
}

export function ModuleGuard({ module, children, fallback }: ModuleGuardProps) {
	const enabled = useModuleEnabled(module);

	if (!enabled) {
		return (
			<>{fallback ?? (
				<div className="flex h-[50vh] items-center justify-center">
					<p className="text-muted-foreground">This module is not available in your workspace.</p>
				</div>
			)}</>
		);
	}

	return <>{children}</>;
}
