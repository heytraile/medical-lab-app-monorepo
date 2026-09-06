import * as React from "react";
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import { cn } from "../../lib/utils";
import { useIsWide } from "../../lib/use-media-query";
import { ScrollBar } from "./scroll-area";

/** Must match ScrollBar track size (`w-2.5` / `h-2.5`). */
const GUTTER = "0.625rem";

type ScrollContainerProps =
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
    /** Include a persistent horizontal scrollbar when content overflows. */
    axes?: "vertical" | "both";
  };

/**
 * Scroll region used across the lab UI.
 *
 * Below lg: native overflow — Radix ScrollArea frequently swallows touch
 * gestures when nested (Accession pickers, Bench lists). Native scrolling with
 * overscroll-contain + visible thin bars works reliably on phones.
 *
 * lg+: Radix type="always" with viewport gutters so custom bars never overlay
 * content (desktop / trackpad).
 */
export const ScrollContainer = React.forwardRef<
  HTMLDivElement,
  ScrollContainerProps
>(({ className, children, axes = "vertical", ...props }, ref) => {
  const isWide = useIsWide();

  if (!isWide) {
    const {
      type: _type,
      scrollHideDelay: _delay,
      dir: _dir,
      nonce: _nonce,
      ...divProps
    } = props as ScrollContainerProps & Record<string, unknown>;

    const classNames = typeof className === "string" ? className : "";
    // Flex fill children need basis-0 so iOS will shrink them and engage
    // overflow; max-height-only regions must keep auto basis.
    const flexFill = /\bflex-1\b/.test(classNames);

    return (
      <div
        ref={ref}
        className={cn(
          "min-h-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]",
          flexFill && "basis-0",
          axes === "both"
            ? "overflow-x-auto overscroll-x-contain [touch-action:pan-x_pan-y]"
            : "touch-pan-y",
          "scrollbar-faint [scrollbar-gutter:stable]",
          className,
        )}
        {...(divProps as React.HTMLAttributes<HTMLDivElement>)}
      >
        {children}
      </div>
    );
  }

  return (
    <ScrollAreaPrimitive.Root
      ref={ref as React.Ref<React.ElementRef<typeof ScrollAreaPrimitive.Root>>}
      type="always"
      scrollHideDelay={0}
      className={cn("relative min-h-0 overflow-hidden", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        className="rounded-[inherit] [&>div]:!block [&>div]:min-w-0 [&>div]:box-border"
        style={{
          width: `calc(100% - ${GUTTER})`,
          height: axes === "both" ? `calc(100% - ${GUTTER})` : "100%",
        }}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      {axes === "both" ? <ScrollBar orientation="horizontal" /> : null}
      <ScrollAreaPrimitive.Corner className="bg-muted/80" />
    </ScrollAreaPrimitive.Root>
  );
});
ScrollContainer.displayName = "ScrollContainer";
