import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";

type Props = {
  stepIndex: number;
  stepCount: number;
  stepLabel: string;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  backLabel?: string;
  hideBack?: boolean;
  /** Replace Next with a custom primary action (e.g. submit). */
  primaryAction?: ReactNode;
  className?: string;
};

/**
 * Sticky wizard chrome: progress + Back/Next footer for mobile multi-step flows.
 */
export function MobileWizardChrome({
  stepIndex,
  stepCount,
  stepLabel,
  onBack,
  onNext,
  nextLabel = "Next",
  nextDisabled = false,
  backLabel = "Back",
  hideBack = false,
  primaryAction,
  className,
}: Props) {
  const progress = stepCount > 0 ? ((stepIndex + 1) / stepCount) * 100 : 0;

  return (
    <div className={cn("border-b border-border bg-card", className)}>
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Step {stepIndex + 1} of {stepCount}
          </p>
          <p className="truncate font-display text-base font-semibold tracking-tight">
            {stepLabel}
          </p>
        </div>
        <div
          className="flex shrink-0 gap-1"
          role="progressbar"
          aria-valuenow={stepIndex + 1}
          aria-valuemin={1}
          aria-valuemax={stepCount}
          aria-label="Wizard progress"
        >
          {Array.from({ length: stepCount }, (_, i) => (
            <span
              key={i}
              className={cn(
                "size-1.5 rounded-full transition-colors",
                i <= stepIndex ? "bg-accent" : "bg-muted-foreground/25",
              )}
            />
          ))}
        </div>
      </div>
      <div className="h-0.5 bg-muted">
        <div
          className="h-full bg-accent transition-[width] duration-200"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

export function MobileWizardFooter({
  onBack,
  onNext,
  nextLabel = "Next",
  nextDisabled = false,
  backLabel = "Back",
  hideBack = false,
  primaryAction,
}: Omit<Props, "stepIndex" | "stepCount" | "stepLabel" | "className">) {
  return (
    <div className="flex items-center gap-2 border-t border-border bg-card px-4 py-3">
      {!hideBack ? (
        <Button
          type="button"
          variant="outline"
          className="min-w-[5.5rem]"
          onClick={onBack}
          disabled={!onBack}
        >
          <ChevronLeft className="size-4" aria-hidden />
          {backLabel}
        </Button>
      ) : (
        <span className="min-w-[5.5rem]" />
      )}
      <div className="ml-auto flex min-w-0 flex-1 justify-end">
        {primaryAction ?? (
          <Button
            type="button"
            className="min-w-[7rem]"
            onClick={onNext}
            disabled={nextDisabled || !onNext}
          >
            {nextLabel}
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}
