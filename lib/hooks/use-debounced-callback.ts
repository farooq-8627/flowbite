import * as React from "react";
import { useCallbackRef } from "./use-callback-ref";

export function useDebouncedCallback<T extends (...args: never[]) => unknown>(
  callback: T,
  delay: number,
) {
  const handleCallback = useCallbackRef(callback);
  const timerRef = React.useRef(0);
  React.useEffect(() => () => window.clearTimeout(timerRef.current), []);

  return React.useCallback(
    (...args: Parameters<T>) => {
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => handleCallback(...args), delay);
    },
    [handleCallback, delay],
  );
}
