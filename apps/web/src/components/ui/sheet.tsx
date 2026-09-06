import * as React from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

export const Sheet = RadixDialog.Root;
export const SheetTrigger = RadixDialog.Trigger;
export const SheetClose = RadixDialog.Close;
export const SheetTitle = RadixDialog.Title;
export const SheetDescription = RadixDialog.Description;

type SheetSide = "left" | "bottom";

const sideClasses: Record<SheetSide, string> = {
  left: cn(
    "inset-y-0 left-0 h-svh min-h-0 w-[min(20rem,85vw)] border-r",
    "data-[state=open]:sheet-left-open data-[state=closed]:sheet-left-closed",
  ),
  // Tall sheet so patient/result detail gets room; height is definite for nested scroll.
  bottom: cn(
    "inset-x-0 bottom-0 h-[92svh] max-h-[92svh] min-h-0 w-full rounded-t-2xl border-t",
    "data-[state=open]:sheet-bottom-open data-[state=closed]:sheet-bottom-closed",
  ),
};

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof RadixDialog.Content>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Content> & {
    side?: SheetSide;
    /** Radix requires a title; pass false only when one is rendered inside. */
    label?: string;
  }
>(({ className, children, side = "left", label, ...props }, ref) => (
  <RadixDialog.Portal>
    <RadixDialog.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]",
        "data-[state=open]:sheet-overlay-open data-[state=closed]:sheet-overlay-closed",
      )}
    />
    <RadixDialog.Content
      ref={ref}
      className={cn(
        "fixed z-50 flex flex-col overflow-hidden border-border bg-card shadow-2xl outline-none",
        sideClasses[side],
        className,
      )}
      {...props}
    >
      {label && (
        <RadixDialog.Title className="sr-only">{label}</RadixDialog.Title>
      )}
      {children}
    </RadixDialog.Content>
  </RadixDialog.Portal>
));
SheetContent.displayName = "SheetContent";

export function SheetCloseButton({ className }: { className?: string }) {
  return (
    <SheetClose
      type="button"
      aria-label="Close"
      className={cn(
        "grid size-10 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <X className="size-4" />
    </SheetClose>
  );
}
