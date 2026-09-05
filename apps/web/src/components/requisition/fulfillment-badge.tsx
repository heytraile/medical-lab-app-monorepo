import { getFulfillment } from "@drax-lis/catalog";
import { Badge } from "../ui/badge";

export function FulfillmentBadge({ code }: { code: string }) {
  const f = getFulfillment(code);
  if (f === "instrument") return null;
  return (
    <Badge variant="muted" className="ml-1.5 px-1 py-0 text-[9px]">
      {f === "send_out" ? "Send-out" : "Manual"}
    </Badge>
  );
}
