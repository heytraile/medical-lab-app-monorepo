import { useCallback, useSyncExternalStore } from "react";

/**
 * Tracks a CSS media query.
 *
 * The server snapshot is always false, so the first paint matches the mobile
 * layout and then corrects. Callers that swap whole renderers should therefore
 * treat mobile as the safe default.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === "undefined") return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () =>
      typeof window === "undefined" ? false : window.matchMedia(query).matches,
    () => false,
  );
}

/** Tailwind's md: the threshold where tables replace card lists. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 768px)");
}

/** Tailwind's lg: the threshold where the sidebar and side panels dock. */
export function useIsWide(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
