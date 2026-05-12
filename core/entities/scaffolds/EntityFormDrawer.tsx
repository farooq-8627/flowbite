"use client";

/**
 * EntityFormDrawer — thin wrapper over FormDrawer adding RHF + zod + dedup banner + toast.
 * Each entity's Add drawer passes its own schema + fields.
 */

import type { ReactNode } from "react";
import { DedupBanner } from "../shared/components/DedupBanner";
import { FormDrawer } from "../shared/components/FormDrawer";
import type { DedupResult } from "../shared/hooks/useDedup";

interface EntityFormDrawerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: string;
	size?: "sm" | "md" | "lg" | "xl";
	onSubmit: () => void;
	isSubmitting: boolean;
	submitLabel?: string;
	submitDisabled?: boolean;
	duplicates?: DedupResult[];
	onDismissDuplicates?: () => void;
	children: ReactNode;
}

export function EntityFormDrawer({
	open,
	onOpenChange,
	title,
	description,
	size = "md",
	onSubmit,
	isSubmitting,
	submitLabel,
	submitDisabled,
	duplicates,
	onDismissDuplicates,
	children,
}: EntityFormDrawerProps) {
	return (
		<FormDrawer
			open={open}
			onOpenChange={onOpenChange}
			title={title}
			description={description}
			size={size}
			onSubmit={onSubmit}
			isSubmitting={isSubmitting}
			submitLabel={submitLabel}
			submitDisabled={submitDisabled}
		>
			{duplicates && duplicates.length > 0 && (
				<DedupBanner duplicates={duplicates} onDismiss={onDismissDuplicates} />
			)}
			{children}
		</FormDrawer>
	);
}
