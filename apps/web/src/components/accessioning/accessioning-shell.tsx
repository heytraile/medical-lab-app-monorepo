import type { ReactNode } from "react";
import { AccessioningTabs } from "./accessioning-tabs";
import { PrinterStatusPill } from "./printer-status-pill";

type Props = {
  title: string;
  description: string;
  children: ReactNode;
};

export function AccessioningShell({ title, description, children }: Props) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
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
      {children}
    </div>
  );
}
