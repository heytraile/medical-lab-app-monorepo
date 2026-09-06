import type { ReactNode } from "react";
import { AccessioningTabs } from "./accessioning-tabs";
import { PrinterStatusPill } from "./printer-status-pill";
import { useIsWide } from "../../lib/use-media-query";
import { cn } from "../../lib/utils";

type Props = {
  title: string;
  description: string;
  children: ReactNode;
  /** Use full workstation width on accession page. */
  wide?: boolean;
};

export function AccessioningShell({
  title,
  description,
  children,
  wide = false,
}: Props) {
  const isWide = useIsWide();

  return (
    <div
      className={cn(
        "mx-auto w-full min-w-0 overflow-x-hidden",
        wide
          ? "flex max-w-[min(100%,96rem)] min-h-0 flex-col lg:h-[calc(100svh-7rem)]"
          : "max-w-6xl space-y-4 lg:space-y-6",
      )}
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 lg:items-end lg:gap-4">
        <div className="min-w-0 space-y-2 lg:space-y-3">
          {isWide ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Accessioning
              </p>
              <h2 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                {title}
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {description}
              </p>
            </div>
          ) : null}
          <AccessioningTabs />
        </div>
        <PrinterStatusPill />
      </div>
      <div
        className={cn(
          wide
            ? "mt-4 flex min-h-0 flex-1 flex-col gap-4 lg:mt-6"
            : "mt-4 space-y-4 lg:mt-6 lg:space-y-6",
        )}
      >
        {children}
      </div>
    </div>
  );
}
