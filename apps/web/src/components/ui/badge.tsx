import * as React from "react";
import { cn } from "../../lib/utils";

export const Badge = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement> & {
    variant?: "default" | "ok" | "warn" | "danger" | "muted";
  }
>(({ className, variant = "default", ...props }, ref) => (
  <span
    ref={ref}
    className={cn(
      "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium",
      variant === "default" && "bg-muted text-foreground",
      variant === "ok" && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
      variant === "warn" && "bg-amber-500/15 text-amber-800 dark:text-amber-300",
      variant === "danger" && "bg-lab-danger/15 text-lab-danger",
      variant === "muted" && "bg-muted text-muted-foreground",
      className,
    )}
    {...props}
  />
));
Badge.displayName = "Badge";
