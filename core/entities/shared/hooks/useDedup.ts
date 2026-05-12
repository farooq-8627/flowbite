"use client";

/**
 * useDedup — catches ConvexError{code:"DUPLICATE"} from lead creation
 * and returns structured duplicate info for the DedupBanner.
 */

import { ConvexError } from "convex/values";
import { useCallback, useState } from "react";

export type DedupResult = {
	personCode: string;
	message: string;
};

export function useDedup() {
	const [duplicates, setDuplicates] = useState<DedupResult[]>([]);

	const handleError = useCallback((err: unknown) => {
		if (err instanceof ConvexError) {
			const data = err.data as Record<string, unknown>;
			if (data?.code === "DUPLICATE" && typeof data.personCode === "string") {
				setDuplicates([{ personCode: data.personCode, message: data.message as string }]);
				return true;
			}
		}
		return false;
	}, []);

	const clearDuplicates = useCallback(() => setDuplicates([]), []);

	return { duplicates, handleError, clearDuplicates };
}
