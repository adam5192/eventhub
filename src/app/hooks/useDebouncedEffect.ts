/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef } from "react";

// run `effect` only after `delay` ms of no changes to `deps`
export function useDebouncedEffect(
  effect: () => void | (() => void),
  deps: any[],
  delay = 500 
) {
  const cleanupRef = useRef<(() => void) | void>(undefined);
  
  useEffect(() => {
    const id = setTimeout(() => {
      // run the latest effect
      cleanupRef.current = effect();
    }, delay);

    // clear timer if deps change again before delay
    return () => {
      clearTimeout(id);
      // if last effect returned a cleanup, run it
      if (typeof cleanupRef.current === "function") {
        cleanupRef.current();
        cleanupRef.current = undefined;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, delay]);
}
