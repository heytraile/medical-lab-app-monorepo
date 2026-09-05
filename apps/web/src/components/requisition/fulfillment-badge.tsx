import { getTestResultRequirement } from "@drax-lis/catalog";
import { Badge } from "../ui/badge";

export function FulfillmentBadge({ code }: { code: string }) {
  const requirement = getTestResultRequirement(code);
  if (requirement.workflow === "instrument_only") return null;
  return (
    <Badge variant="muted" className="ml-1.5 px-1 py-0 text-[9px]">
      {requirement.workflow === "send_out"
        ? "Send-out"
        : requirement.workflow === "hybrid"
          ? "Hybrid"
          : "Manual"}
    </Badge>
  );
}
