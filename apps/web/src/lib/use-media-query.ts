import { useCallback, useSyncExternalStore } from "react";

/** Touch-primary input (phones, tablets). */
export const MEDIA_TOUCH_PRIMARY = "(pointer: coarse)";

/**
 * Hybrid tablets (e.g. iPad Pro + keyboard) — touchscreen still available even
 * when primary pointer reports fine.
 */
export const MEDIA_HYBRID_TABLET =
  "(any-pointer: coarse) and (max-width: 1535px)";

/** Mouse/trackpad workstation — sidebar from ~1100px up. */
export const MEDIA_FINE_POINTER_DESKTOP =
  "(pointer: fine) and (hover: hover) and (min-width: 1100px)";

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
 * accession form. Does **not** imply the persistent sidebar.
 */
export function useIsWorkstation(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}

/** @deprecated Use useIsWorkstation — same threshold, clearer name. */
export function useIsWide(): boolean {
  return useIsWorkstation();
}

/**
 * Bottom nav, mobile header brand, native touch scroll, Accession wizard.
 * True for touch-primary devices (any width) and hybrid tablets up to 1535px
 * (covers iPad Pro landscape even with Magic Keyboard attached).
 */
export function useIsCompactChrome(): boolean {
  const touchPrimary = useMediaQuery(MEDIA_TOUCH_PRIMARY);
  const hybridTablet = useMediaQuery(MEDIA_HYBRID_TABLET);
  return touchPrimary || hybridTablet;
}

/** Persistent sidebar rail; bottom nav hidden. Requires precise pointer input. */
export function useShowSidebar(): boolean {
  const compactChrome = useIsCompactChrome();
  const fineDesktop = useMediaQuery(MEDIA_FINE_POINTER_DESKTOP);
  return !compactChrome && fineDesktop;
}

/** Workstation tier without persistent sidebar — tablet landscape, touch laptops. */
export function useIsCompactWorkstation(): boolean {
  const workstation = useIsWorkstation();
  const sidebar = useShowSidebar();
  return workstation && !sidebar;
}

/**
 * Full multi-column workstation chrome (sidebar + wide grids). Compact chrome:
 * bottom nav, stacked/card flows, and native touch scrolling.
 */
export function useShowWorkstationChrome(): boolean {
  return useShowSidebar();
}

/** Native overflow — reliable on touch. Radix ScrollArea only with sidebar. */
export function useNativeScroll(): boolean {
  return !useShowSidebar();
}

/**
 * Fill-height class for workstation pages (/bench, /accession, …).
 * Tablet landscape keeps bottom nav — subtract extra chrome height.
 */
export function useWorkstationViewportClass(): string {
  const workstation = useIsWorkstation();
  const sidebar = useShowSidebar();
  if (!workstation) return "";
  return sidebar
    ? "lg:h-[calc(100svh-7rem)]"
    : "lg:h-[calc(100svh-10.5rem)]";
}
