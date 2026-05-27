import { redirect } from "next/navigation";
import { ownerPublicPath } from "@/owner/lib/owner-public-prefix";

/**
 * Owner-panel root — redirects to `/<slug>/overview`.
 *
 * The redirect target MUST be the public slug-prefixed path, NOT the
 * internal `/xowner/...` segment. Browsers see a 30x with the public
 * URL, follow it through middleware, which rewrites back to `/xowner/...`
 * for the actual render. Sending the browser to `/xowner/overview`
 * directly would bounce off middleware's direct-hit block (404).
 *
 * Spec: PLATFORM-OWNER-PANEL.md §3.2.
 */
export default async function OwnerRootPage() {
	redirect(await ownerPublicPath("/overview"));
}
