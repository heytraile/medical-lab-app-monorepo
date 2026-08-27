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
  left: "inset-y-0 left-0 h-svh w-[min(20rem,85vw)] border-r data-[state=closed]:-translate-x-full",
  bottom:
    "inset-x-0 bottom-0 max-h-[85svh] w-full rounded-t-xl border-t data-[state=closed]:translate-y-full",
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
    <RadixDialog.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
    <RadixDialog.Content
      ref={ref}
      className={cn(
        "fixed z-50 flex flex-col overflow-hidden border-border bg-card shadow-2xl outline-none transition-transform duration-200",
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
        "grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <X className="size-4" />
    </SheetClose>
  );
}
