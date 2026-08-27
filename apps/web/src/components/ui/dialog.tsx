import * as React from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

export const Dialog = RadixDialog.Root;
export const DialogPortal = RadixDialog.Portal;
export const DialogClose = RadixDialog.Close;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof RadixDialog.Overlay>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Overlay>
>(({ className, ...props }, ref) => (
  <RadixDialog.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = RadixDialog.Overlay.displayName;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof RadixDialog.Content>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <RadixDialog.Content
      ref={ref}
      className={cn(
        // On a phone the dialog starts near the top and scrolls internally;
        // a 15% offset would push a tall dialog off the bottom of the screen.
        "fixed left-1/2 top-4 z-50 max-h-[calc(100svh-2rem)] w-[calc(100%-1rem)] max-w-lg -translate-x-1/2 overflow-y-auto rounded-xl border border-border bg-card p-0 shadow-2xl outline-none sm:top-[15%] sm:w-full",
        className,
      )}
      {...props}
    >
      {children}
    </RadixDialog.Content>
  </DialogPortal>
));
DialogContent.displayName = RadixDialog.Content.displayName;

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof RadixDialog.Title>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Title>
>(({ className, ...props }, ref) => (
  <RadixDialog.Title
    ref={ref}
    className={cn(
      "font-display text-xl font-semibold tracking-tight text-foreground",
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = RadixDialog.Title.displayName;

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof RadixDialog.Description>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Description>
>(({ className, ...props }, ref) => (
  <RadixDialog.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
DialogDescription.displayName = RadixDialog.Description.displayName;

export function DialogHeader({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 border-b border-border px-5 py-4",
        className,
      )}
      {...props}
    >
      <div className="min-w-0 space-y-1">{children}</div>
      <DialogClose
        type="button"
        className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Close"
      >
        <X className="size-4" />
      </DialogClose>
    </div>
  );
}
