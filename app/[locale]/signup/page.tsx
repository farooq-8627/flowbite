/**
 * Signup page — redirects to signin with the signUp flow pre-selected.
 *
 * WHY REDIRECT:
 *   The signin page already handles both signIn and signUp flows via a toggle.
 *   This page exists as a convenience URL (/signup) that sets the flow to signUp.
 *
 * Sources:
 * - app/[locale]/signin/page.tsx — handles both flows
 */
import { redirect } from "next/navigation";

export default function SignUpPage() {
	redirect("/signin");
}
