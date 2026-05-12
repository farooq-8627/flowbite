import * as React from "react";

const TABLET_BREAKPOINT = 1024;
/**
 * Tailwind's `xl` breakpoint. Used by the dashboard shell to decide when to
 * render the sidebar and AI chat panel as a Sheet instead of inline: every
 * viewport below `xl` (phones, iPad portrait/landscape, iPad Pro) gets the
 * sheet treatment so the inline panels don't push content out of view.
 */
const BELOW_XL_BREAKPOINT = 1280;

export function useIsTablet() {
	const [isTablet, setIsTablet] = React.useState(false);

	React.useEffect(() => {
		const mql = window.matchMedia(`(max-width: ${TABLET_BREAKPOINT - 1}px)`);
		const onChange = () => setIsTablet(window.innerWidth < TABLET_BREAKPOINT);
		mql.addEventListener("change", onChange);
		setIsTablet(window.innerWidth < TABLET_BREAKPOINT);
		return () => mql.removeEventListener("change", onChange);
	}, []);

	return isTablet;
}

/**
 * True when the viewport is narrower than Tailwind's `xl` (1280px).
 *
 * Returns `false` during SSR so the server render reflects the "laptop" path
 * by default — the client `useEffect` corrects it on first paint. Any layout
 * jump is a non-issue because the sheet is hidden by default anyway.
 */
export function useIsBelowXl() {
	const [isBelowXl, setIsBelowXl] = React.useState(false);

	React.useEffect(() => {
		const mql = window.matchMedia(`(max-width: ${BELOW_XL_BREAKPOINT - 1}px)`);
		const onChange = () => setIsBelowXl(window.innerWidth < BELOW_XL_BREAKPOINT);
		mql.addEventListener("change", onChange);
		setIsBelowXl(window.innerWidth < BELOW_XL_BREAKPOINT);
		return () => mql.removeEventListener("change", onChange);
	}, []);

	return isBelowXl;
}
