/**
 * Centralized toast utility — same pattern as notifications/activityLogs.
 * Import and call from anywhere: toast.error("message")
 *
 * Error normalization (`normalizeError`) lives in `lib/normalizeError.ts` so
 * any caller can use it without going through this wrapper.
 */
import { toast as sonner } from "sonner";
import { normalizeError } from "./normalizeError";

// ─── Public API ───────────────────────────────────────────────────────────────

export const toast = {
	success: (message: string, description?: string) => sonner.success(message, { description }),

	error: (message: string, description?: string) => sonner.error(message, { description }),

	info: (message: string, description?: string) => sonner.info(message, { description }),

	warning: (message: string, description?: string) => sonner.warning(message, { description }),

	/** Maps a Convex auth error to a human-readable message and shows it as an error toast. */
	authError: (err: unknown) => sonner.error(normalizeError(err)),

	/** Maps any Convex mutation error to a human-readable message and shows it as an error toast. */
	mutationError: (err: unknown, fallback = "Something went wrong. Please try again.") => {
		sonner.error(normalizeError(err, fallback));
	},

	/** Re-export raw sonner for advanced use (promise toasts, custom JSX, etc.) */
	raw: sonner,
};
