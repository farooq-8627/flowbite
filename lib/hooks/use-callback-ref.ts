import * as React from "react";

/**
 * Converts a callback to a stable ref to avoid re-renders when passed as a prop.
 * @see https://github.com/radix-ui/primitives/blob/main/packages/react/use-callback-ref
 */
export function useCallbackRef<T extends (...args: never[]) => unknown>(
	callback: T | undefined,
): T {
	const callbackRef = React.useRef(callback);
	React.useEffect(() => {
		callbackRef.current = callback;
	});
	return React.useMemo(() => ((...args) => callbackRef.current?.(...args)) as T, []);
}
