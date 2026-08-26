import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { api } from "../../lib/api";
import { cn } from "../../lib/utils";

export function PrinterStatusPill() {
  const printerQ = useQuery({
    queryKey: ["print-status"],
    queryFn: () => api.printStatus(),
    refetchInterval: 15_000,
  });

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs",
        printerQ.data?.ok
          ? "border-emerald-500/40 bg-emerald-500/10 text-lab-ok"
          : "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
      )}
    >
      <Printer className="size-3.5 shrink-0" />
      {printerQ.isLoading && "Checking printer…"}
      {printerQ.data?.ok &&
        `Zebra online · ${printerQ.data.host}:${printerQ.data.port}`}
      {printerQ.data && !printerQ.data.ok &&
        `Printer offline${printerQ.data.error ? `: ${printerQ.data.error}` : ""}`}
    </div>
  );
}
