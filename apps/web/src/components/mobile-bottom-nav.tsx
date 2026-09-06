import { Link, useRouterState } from "@tanstack/react-router";
import {
  ClipboardCheck,
  FlaskConical,
  MessageSquare,
  Microscope,
  MoreHorizontal,
} from "lucide-react";
import { cn } from "../lib/utils";

const PRIMARY_TABS = [
  { to: "/bench", label: "Bench", icon: Microscope },
  { to: "/accession", label: "Accession", icon: FlaskConical },
  { to: "/release", label: "Release", icon: ClipboardCheck },
  { to: "/messages", label: "Messages", icon: MessageSquare },
] as const;

type Props = {
  onMore: () => void;
};

/**
 * Phone/tablet portrait primary nav. Desktop (lg+) uses the sidebar instead.
 * "More" opens the existing nav sheet for secondary destinations.
 */
export function MobileBottomNav({ onMore }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isPrimaryActive = PRIMARY_TABS.some(
    (tab) => pathname === tab.to || pathname.startsWith(`${tab.to}/`),
  );

  return (
    <nav
      aria-label="Primary"
      className="shrink-0 border-t border-border bg-card/95 backdrop-blur-md lg:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="grid h-14 grid-cols-5">
        {PRIMARY_TABS.map(({ to, label, icon: Icon }) => {
          const active =
            pathname === to || pathname.startsWith(`${to}/`);
          return (
            <li key={to} className="min-w-0">
              <Link
                to={to}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium transition-colors",
                  active
                    ? "text-accent"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                <span className="truncate">{label}</span>
              </Link>
            </li>
          );
        })}
        <li className="min-w-0">
          <button
            type="button"
            onClick={onMore}
            className={cn(
              "flex h-full w-full flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-medium transition-colors",
              !isPrimaryActive
                ? "text-accent"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <MoreHorizontal className="size-5 shrink-0" aria-hidden />
            <span className="truncate">More</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
