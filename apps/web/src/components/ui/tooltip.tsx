import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "../../lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(
  (
    { className, side = "right", sideOffset = 10, children, ...props },
    ref,
  ) => (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        side={side}
        sideOffset={sideOffset}
        className={cn(
          "z-50 overflow-hidden rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-card-foreground shadow-lg outline-none",
          "origin-[var(--radix-tooltip-content-transform-origin)]",
          "motion-safe:data-[state=open]:animate-in motion-safe:data-[state=closed]:animate-out",
          "motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=open]:fade-in-0",
          "motion-safe:data-[state=closed]:zoom-out-[0.98] motion-safe:data-[state=open]:zoom-in-[0.98]",
          "motion-safe:data-[side=right]:slide-in-from-left-2 motion-safe:data-[side=left]:slide-in-from-right-2",
          "motion-safe:data-[side=top]:slide-in-from-bottom-2 motion-safe:data-[side=bottom]:slide-in-from-top-2",
          "motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]",
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="fill-card [&>polygon]:stroke-border [&>polygon]:stroke-[0.5]" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  ),
);
TooltipContent.displayName = TooltipPrimitive.Content.displayName;
