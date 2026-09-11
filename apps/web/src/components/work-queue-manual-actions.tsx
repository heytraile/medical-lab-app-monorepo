import { normalizeCode, type MissingExpectedResult } from "@drax-lis/catalog";
import type { WorkQueueTestItem } from "../lib/bench-work-queue";
import type { ManualAccessionAccess } from "../lib/manual-results";
import { ManualResultEntryButton } from "./manual-result-entry";
import { Badge } from "./ui/badge";

function ManualAccessBadge({
  access,
}: {
  access: Exclude<ManualAccessionAccess, "editable">;
}) {
  return (
    <Badge variant={access === "released" ? "muted" : "warn"}>
      {access === "released"
        ? "Not resulted before release"
        : "Locked while awaiting authorization"}
    </Badge>
  );
}

type Props = {
  accessionNumber: string;
  test: WorkQueueTestItem;
  manualAccess: ManualAccessionAccess;
  pendingManualByTest: Map<string, MissingExpectedResult[]>;
};

export function WorkQueueManualActions({
  accessionNumber,
  test,
  manualAccess,
  pendingManualByTest,
}: Props) {
  const components =
    pendingManualByTest.get(normalizeCode(test.code)) ?? [];
  if (components.length === 0) return null;

  const showHybridHint =
    test.status === "awaiting_instrument" &&
    components.some((item) => item.workflow === "hybrid");

  if (manualAccess !== "editable") {
    return (
      <div className="space-y-1.5">
        {showHybridHint ? (
          <p className="text-xs text-muted-foreground">
            Manual component available
          </p>
        ) : null}
        <ManualAccessBadge access={manualAccess} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {showHybridHint ? (
        <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
          Manual entry available — instrument result not required first
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {components.map((item) => (
          <ManualResultEntryButton
            key={`${item.orderedTestCode}-${item.componentCode}`}
            accessionNumber={accessionNumber}
            testCode={item.orderedTestCode}
            testName={item.orderedTestName}
            resultComponentCode={item.componentCode}
            resultComponentName={item.componentName}
            siblingManualCount={components.length}
          />
        ))}
      </div>
    </div>
  );
}
