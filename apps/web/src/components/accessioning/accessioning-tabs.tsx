import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "../../lib/utils";

const TABS = [
  { to: "/accession" as const, label: "Accession" },
  { to: "/labels" as const, label: "Labels" },
];

export function AccessioningTabs() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="inline-flex h-10 items-center rounded-lg bg-muted p-1 text-muted-foreground lg:h-9">
      {TABS.map((tab) => {
        const active = pathname === tab.to;
        return (
          <Link
            key={tab.to}
            to={tab.to}
            className={cn(
              "inline-flex h-full items-center justify-center rounded-md px-3 text-sm font-medium transition-all lg:py-1",
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
