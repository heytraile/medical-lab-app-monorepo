import type { ReactNode } from "react";
import { AccessioningTabs } from "./accessioning-tabs";
import { PrinterStatusPill } from "./printer-status-pill";
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
  return (
    <div
      className={cn(
        "mx-auto w-full min-w-0 overflow-x-hidden",
        wide
          ? "flex max-w-[min(100%,96rem)] min-h-0 flex-col lg:h-[calc(100svh-7rem)]"
          : "max-w-6xl space-y-6",
      )}
    >
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Accessioning
            </p>
            <h2 className="font-display text-2xl font-semibold sm:text-3xl tracking-tight">
              {title}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {description}
            </p>
          </div>
          <AccessioningTabs />
        </div>
        <PrinterStatusPill />
      </div>
      <div
        className={cn(
          wide ? "mt-6 flex min-h-0 flex-1 flex-col gap-4" : "mt-6 space-y-6",
        )}
      >
        {children}
      </div>
    </div>
  );
}
