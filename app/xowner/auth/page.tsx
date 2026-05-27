import { OtpEntryView } from "@/owner/views/auth/OtpEntryView";

/**
 * Owner-panel OTP entry route — `/xowner/auth`.
 *
 * Reachable only after layers 1-3 of the gate pass (slug match, auth
 * token, email allow-list + super-admin role). The layout sends the
 * user here when the `owner_otp_verified` cookie is missing or
 * expired. The view sends a code via `requestOtp`, captures the typed
 * code, and on success the verify server action sets the cookie and
 * client redirects to `OWNER_PATHS.overview`.
 *
 * Spec: PLATFORM-OWNER-PANEL.md §10 stage 1-F.
 */
export default function OtpEntryPage() {
	return <OtpEntryView />;
}
