/** Shared viewport-centered positioning for dialogs, sheets, and modal panels. */
export const modalCenterPositionClass =
  "fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2";

export const modalMaxHeightClass = "max-h-[calc(100dvh-2rem)]";

export const modalSurfaceClass =
  "overflow-y-auto overscroll-contain rounded-xl border border-border bg-card shadow-2xl outline-none";

/** Standard form / confirm dialogs — capped width, still centered. */
export const modalDefaultWidthClass =
  "w-[calc(100%-1.5rem)] max-w-lg";

/** Menus and short action lists (export, pickers). */
export const modalCompactWidthClass =
  "w-[calc(100%-1.5rem)] max-w-xs sm:max-w-sm";
