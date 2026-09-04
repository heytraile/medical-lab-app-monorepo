import * as React from "react";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";
import { Input } from "./input";

type ClearableInputProps = React.ComponentProps<typeof Input> & {
  /** Optional icon or adornment on the left (e.g. scan icon). */
  leftSlot?: React.ReactNode;
  /** Called after the value is cleared; use for extra side effects. */
  onClear?: () => void;
  /** Layout classes for the outer wrapper (flex, max-width, margin). */
  wrapperClassName?: string;
};

export const ClearableInput = React.forwardRef<
  HTMLInputElement,
  ClearableInputProps
>(
  (
    {
      className,
      wrapperClassName,
      value,
      onChange,
      onClear,
      leftSlot,
      ...props
    },
    ref,
  ) => {
    const hasValue = String(value ?? "").length > 0;

    function clear(e: React.MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
      onClear?.();
      onChange?.({
        target: { value: "" },
        currentTarget: { value: "" },
      } as React.ChangeEvent<HTMLInputElement>);
    }

    return (
      <div className={cn("relative w-full", wrapperClassName)}>
        {leftSlot ? (
          <div className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2">
            {leftSlot}
          </div>
        ) : null}
        <Input
          ref={ref}
          value={value}
          onChange={onChange}
          className={cn(leftSlot && "pl-9", hasValue && "pr-9", className)}
          {...props}
        />
        {hasValue ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label="Clear"
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={clear}
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>
    );
  },
);
ClearableInput.displayName = "ClearableInput";
