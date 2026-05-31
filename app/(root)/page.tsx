import { redirect } from "next/navigation";
import { routing } from "@/i18n/routing";

/**
 * Root page (`/`) — redirects bare-domain traffic to the default locale,
 * where the marketing landing page lives (`app/[locale]/page.tsx`).
 */
export default function Page() {
	redirect(`/${routing.defaultLocale}`);
}
