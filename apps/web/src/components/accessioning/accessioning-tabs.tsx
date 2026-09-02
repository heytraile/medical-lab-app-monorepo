import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "../../lib/utils";

const TABS = [
  { to: "/accession" as const, label: "Accession" },
  { to: "/labels" as const, label: "Labels" },
];

export function AccessioningTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="inline-flex h-9 items-center rounded-lg bg-muted p-1 text-muted-foreground">
      {TABS.map((tab) => {
        const active = pathname === tab.to;
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={cn(
              "inline-flex items-center justify-center rounded-md px-3 py-1 text-sm font-medium transition-all",
              active
                ? "bg-card text-foreground shadow-sm"
                : "hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
