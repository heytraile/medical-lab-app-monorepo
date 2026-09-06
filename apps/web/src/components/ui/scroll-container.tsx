import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { cn } from "../../lib/utils";
import { ScrollBar } from "./scroll-area";

/** Must match ScrollBar track size (`w-2.5` / `h-2.5`). */
const GUTTER = "0.625rem";

type ScrollContainerProps =
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
    /** Include a persistent horizontal scrollbar when content overflows. */
    axes?: "vertical" | "both";
  };

/**
 * Persistent scroll region (type="always").
 * Viewport is sized short of the root so Radix overlay bars sit in a real
 * gutter and never cover content (padding-inside-content cannot do this when
 * tables are wider/taller than the viewport).
 */
export const ScrollContainer = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  ScrollContainerProps
>(({ className, children, axes = "vertical", ...props }, ref) => (
  <ScrollAreaPrimitive.Root
    ref={ref}
    type="always"
    scrollHideDelay={0}
    className={cn("relative min-h-0 overflow-hidden", className)}
    {...props}
  >
    <ScrollAreaPrimitive.Viewport
      className="rounded-[inherit] [&>div]:!block [&>div]:min-w-0 [&>div]:box-border"
      style={{
        width: `calc(100% - ${GUTTER})`,
        height:
          axes === "both" ? `calc(100% - ${GUTTER})` : "100%",
      }}
    >
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar />
    {axes === "both" ? <ScrollBar orientation="horizontal" /> : null}
    <ScrollAreaPrimitive.Corner className="bg-muted/80" />
  </ScrollAreaPrimitive.Root>
));
ScrollContainer.displayName = "ScrollContainer";
