import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { FlaskConical, Search } from "lucide-react";
import { ThemeProvider } from "../components/theme-provider";
import { AppSidebar } from "../components/app-sidebar";
import { CommandPalette } from "../components/command-palette";
import {
  NotificationCenter,
  NotificationToastStack,
} from "../components/notification-center";
import { NotificationProvider } from "../lib/notification-store";
import { PatientNameOrderProvider } from "../lib/patient-name-order";
import { MobileBottomNav } from "../components/mobile-bottom-nav";
import { cn } from "../lib/utils";

export const Route = createFileRoute("/_lab")({
  component: LabLayout,
});

const FILL_VIEWPORT_PATHS = [
  "/messages",
  "/bench",
  "/accession",
  "/release",
] as const;

function isFillViewportPath(pathname: string): boolean {
  return FILL_VIEWPORT_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function LabLayout() {
  const { queryClient } = Route.useRouteContext();
  const [searchOpen, setSearchOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const fillViewport = isFillViewportPath(pathname);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <NotificationProvider>
          <PatientNameOrderProvider>
            <div className="flex h-svh overflow-hidden bg-background text-foreground">
              <AppSidebar
                onOpenSearch={() => setSearchOpen(true)}
                navOpen={navOpen}
                onNavOpenChange={setNavOpen}
              />
              <main className="flex min-h-0 min-w-0 flex-1 flex-col">
                <header className="flex min-h-14 shrink-0 items-center gap-2.5 border-b border-border px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-4 md:px-6 lg:min-h-12 lg:gap-2 lg:px-6 lg:py-0">
                  <div className="flex min-w-0 items-center gap-2.5 lg:hidden">
                    <div className="grid size-8 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
                      <FlaskConical className="size-4" aria-hidden />
                    </div>
                    <div className="min-w-0 leading-tight">
                      <p className="truncate font-display text-sm font-semibold tracking-tight">
                        Drax Hall LIS
                      </p>
                      <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                        Workbench
                      </p>
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSearchOpen(true)}
                      aria-label="Search"
                      className="grid size-10 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
                    >
                      <Search className="size-4" />
                    </button>
                    <NotificationCenter />
                  </div>
                </header>
                <div
                  className={cn(
                    "min-h-0 flex-1",
                    fillViewport
                      ? "overflow-hidden p-0"
                      : "overflow-y-auto p-4 sm:p-6 md:p-8",
                  )}
                >
                  <div
                    className={cn(
                      "mx-auto w-full",
                      fillViewport
                        ? "flex h-full min-h-0 max-w-none flex-col"
                        : "max-w-none",
                    )}
                  >
                    <Outlet />
                  </div>
                </div>
                <MobileBottomNav onMore={() => setNavOpen(true)} />
              </main>
              <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
              <NotificationToastStack />
            </div>
          </PatientNameOrderProvider>
        </NotificationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
