import type { ReactNode } from "react";
import { cn } from "../lib/utils";

type Props = {
  children: ReactNode;
  /** Sticky top chrome (step title, filters, etc.). */
  header?: ReactNode;
  /** Sticky bottom chrome (Back/Next, primary CTA). */
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
};

/**
 * Fill-height mobile screen: optional sticky header/footer around a single
 * scrollable body. Use inside fill-viewport lab routes below lg.
 */
export function MobileScreen({
  children,
  header,
  footer,
  className,
  bodyClassName,
}: Props) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden bg-background",
        className,
      )}
    >
      {header ? <div className="shrink-0">{header}</div> : null}
      <div className={cn("min-h-0 flex-1 overflow-hidden", bodyClassName)}>
        {children}
      </div>
      {footer ? <div className="shrink-0">{footer}</div> : null}
    </div>
  );
}
