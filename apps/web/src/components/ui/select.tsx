import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";

export type SelectOption = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};

export type SelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
};

export function Select({
  value,
  onValueChange,
  options,
  placeholder = "Select…",
  disabled = false,
  className,
  id,
  "aria-label": ariaLabel,
}: SelectProps) {
  const [open, setOpen] = React.useState(false);
  const [highlightIndex, setHighlightIndex] = React.useState(-1);
  const [triggerWidth, setTriggerWidth] = React.useState<number>();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const enabledOptions = React.useMemo(
    () => options.filter((o) => !o.disabled),
    [options],
  );

  const selectedOption = options.find((o) => o.value === value);
  const selectedIndex = enabledOptions.findIndex((o) => o.value === value);

  React.useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    setTriggerWidth(triggerRef.current.offsetWidth);
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      setHighlightIndex(-1);
      return;
    }
    setHighlightIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, selectedIndex]);

  React.useEffect(() => {
    if (!open || highlightIndex < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-option-index="${highlightIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [open, highlightIndex]);

  function selectOption(option: SelectOption) {
    if (option.disabled) return;
    onValueChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function moveHighlight(delta: number) {
    if (enabledOptions.length === 0) return;
    setHighlightIndex((current) => {
      const len = enabledOptions.length;
      const idx = current < 0 ? (delta > 0 ? -1 : 0) : current;
      return (idx + delta + len) % len;
    });
  }

  function onTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (e.key === "ArrowDown") moveHighlight(1);
      if (e.key === "ArrowUp") moveHighlight(-1);
      if ((e.key === "Enter" || e.key === " ") && highlightIndex >= 0) {
        const option = enabledOptions[highlightIndex];
        if (option) selectOption(option);
      }
    }
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={ariaLabel}
          aria-disabled={disabled}
          disabled={disabled}
          onKeyDown={onTriggerKeyDown}
          className={cn(
            "group flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm shadow-sm",
            "transition-[border-color,box-shadow,background-color] duration-200 ease-out",
            "hover:border-border/80 hover:bg-card/90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            open && "border-ring/40 ring-2 ring-ring/20",
            className,
          )}
        >
          <span
            className={cn(
              "min-w-0 truncate text-left transition-colors duration-150",
              selectedOption ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
              open && "rotate-180 text-foreground",
            )}
            aria-hidden
          />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          side="bottom"
          sideOffset={6}
          collisionPadding={8}
          onOpenAutoFocus={(e) => e.preventDefault()}
          style={triggerWidth ? { width: triggerWidth } : undefined}
          className={cn(
            "z-50 overflow-hidden rounded-xl border border-border bg-card p-1.5 text-card-foreground shadow-lg outline-none",
            "origin-[var(--radix-popover-content-transform-origin)]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98]",
            "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2",
            "duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
          )}
        >
          <div
            ref={listRef}
            role="listbox"
            aria-label={ariaLabel ?? placeholder}
            className="max-h-60 overflow-y-auto overscroll-contain"
          >
            {options.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                No options
              </p>
            ) : (
              options.map((option, index) => {
                const enabledIndex = enabledOptions.indexOf(option);
                const isSelected = option.value === value;
                const isHighlighted = enabledIndex === highlightIndex;

                return (
                  <button
                    key={option.value}
                    type="button"
                    role="option"
                    data-option-index={enabledIndex}
                    aria-selected={isSelected}
                    disabled={option.disabled}
                    onMouseEnter={() => {
                      if (option.disabled || enabledIndex < 0) return;
                      setHighlightIndex(enabledIndex);
                    }}
                    onClick={() => selectOption(option)}
                    className={cn(
                      "relative flex w-full cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm outline-none",
                      "transition-[background-color,color,transform,box-shadow] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]",
                      "disabled:pointer-events-none disabled:opacity-40",
                      isHighlighted &&
                        !option.disabled &&
                        "bg-muted/90 text-foreground shadow-sm",
                      isSelected &&
                        "bg-accent/15 font-medium text-foreground",
                      !isHighlighted &&
                        !isSelected &&
                        "text-foreground/90 hover:bg-muted/60",
                      isHighlighted && "scale-[1.01]",
                    )}
                    style={{
                      transitionDelay: open ? `${Math.min(index, 8) * 12}ms` : "0ms",
                    }}
                  >
                    <Check
                      className={cn(
                        "size-4 shrink-0 text-accent transition-all duration-200 ease-out",
                        isSelected ? "scale-100 opacity-100" : "scale-75 opacity-0",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  </button>
                );
              })
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
