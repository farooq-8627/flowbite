import * as React from "react";

/**
 * Breakpoint at which the dashboard shell switches from the inline desktop
 * sidebar to the mobile-style Sheet sidebar.
 *
 * Matches Tailwind's `xl` (1280px). Everything below — phones, iPad portrait,
 * iPad landscape, iPad Pro — uses the Sheet treatment so the inline sidebar
 * and AI chat panel don't push the dashboard content out of view on smaller
 * form factors.
 */
const MOBILE_BREAKPOINT = 1280;

export function useIsMobile() {
	const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

	React.useEffect(() => {
		const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
		const onChange = () => {
			setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
		};
		mql.addEventListener("change", onChange);
		setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
		return () => mql.removeEventListener("change", onChange);
	}, []);

	return !!isMobile;
}
