/**
 * Centralized toast utility — same pattern as notifications/activityLogs.
 * Import and call from anywhere: toast.error("message")
 *
 * Error code mapping handles Convex auth errors → human-readable messages.
 */
import { toast as sonner } from "sonner";

// ─── Auth error code → human-readable message ─────────────────────────────────

const AUTH_ERROR_MAP: Record<string, string> = {
	// Convex Auth / Password provider
	InvalidAccountId: "No account found with that email address.",
	InvalidSecret: "Incorrect password. Please try again.",
	AccountAlreadyExists: "An account with this email already exists. Try signing in instead.",
	OAuthAccountNotLinked: "This email is linked to a different sign-in method.",
	// Generic
	"Failed to fetch": "Network error. Check your connection and try again.",
	"Load failed": "Network error. Check your connection and try again.",
};

function mapAuthError(err: unknown): string {
	const msg = err instanceof Error ? err.message : String(err);
	// Check known codes first
	for (const [code, human] of Object.entries(AUTH_ERROR_MAP)) {
		if (msg.includes(code)) return human;
	}
	// Strip Convex noise: "[Request ID: xxx] Server Error\nUncaught TypeError: ..."
	const clean = msg
		.replace(/\[Request ID:[^\]]+\]\s*/g, "")
		.replace(/^Server Error\s*/i, "")
		.trim();
	return clean || "Something went wrong. Please try again.";
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const toast = {
	success: (message: string, description?: string) => sonner.success(message, { description }),

	error: (message: string, description?: string) => sonner.error(message, { description }),

	info: (message: string, description?: string) => sonner.info(message, { description }),

	warning: (message: string, description?: string) => sonner.warning(message, { description }),

	/** Maps a Convex auth error to a human-readable message and shows it as an error toast. */
	authError: (err: unknown) => sonner.error(mapAuthError(err)),

	/** Maps any Convex mutation error to a human-readable message and shows it as an error toast. */
	mutationError: (err: unknown, fallback = "Something went wrong. Please try again.") => {
		const msg = err instanceof Error ? err.message : String(err);
		const clean = msg
			.replace(/\[Request ID:[^\]]+\]\s*/g, "")
			.replace(/^Server Error\s*/i, "")
			.trim();
		sonner.error(clean || fallback);
	},

	/** Re-export raw sonner for advanced use (promise toasts, custom JSX, etc.) */
	raw: sonner,
};
