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

/** Tailwind md: tables replace card lists. */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 768px)");
}

/**
 * Tailwind lg: workstation data layouts — tables, docked master-detail, desktop
 * accession form. Does **not** imply the persistent sidebar (that is xl+).
 */
export function useIsWorkstation(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}

/** @deprecated Use useIsWorkstation — same threshold, clearer name. */
export function useIsWide(): boolean {
  return useIsWorkstation();
}

/** Tailwind xl: persistent sidebar rail; bottom nav hidden. */
export function useShowSidebar(): boolean {
  return useMediaQuery("(min-width: 1280px)");
}

/** Workstation tier without persistent sidebar — tablet landscape (lg–xl). */
export function useIsCompactWorkstation(): boolean {
  const workstation = useIsWorkstation();
  const sidebar = useShowSidebar();
  return workstation && !sidebar;
}

/**
 * Full multi-column workstation chrome (sidebar + wide grids). Below xl: bottom
 * nav, stacked/card flows, and native touch scrolling.
 */
export function useShowWorkstationChrome(): boolean {
  return useShowSidebar();
}

/** Native overflow — reliable on touch. Radix ScrollArea only at xl+ sidebar. */
export function useNativeScroll(): boolean {
  return !useShowSidebar();
}

/**
 * Fill-height class for workstation pages (/bench, /accession, …).
 * Tablet landscape (lg–xl) keeps bottom nav — subtract extra chrome height.
 */
export function useWorkstationViewportClass(): string {
  const workstation = useIsWorkstation();
  const sidebar = useShowSidebar();
  if (!workstation) return "";
  return sidebar
    ? "lg:h-[calc(100svh-7rem)]"
    : "lg:h-[calc(100svh-10.5rem)]";
}
