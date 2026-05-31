import type { ReactNode } from "react";

/**
 * Minimal root layout for the `(root)/page.tsx` redirect. The redirect
 * throws `NEXT_REDIRECT` before this body renders, so the response is an
 * HTTP 307 — this layout exists only so Next.js can compile the segment.
 */
export default function RootRedirectLayout({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body>{children}</body>
		</html>
	);
}
