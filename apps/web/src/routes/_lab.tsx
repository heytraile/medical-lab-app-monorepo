import { createFileRoute, Outlet } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Menu, Search } from "lucide-react";
import { ThemeProvider } from "../components/theme-provider";
import { AppSidebar } from "../components/app-sidebar";
import { CommandPalette } from "../components/command-palette";
import {
  NotificationCenter,
  NotificationToastStack,
} from "../components/notification-center";
import { NotificationProvider } from "../lib/notification-store";
import { PatientNameOrderProvider } from "../lib/patient-name-order";

export const Route = createFileRoute("/_lab")({
  component: LabLayout,
});

function LabLayout() {
  const { queryClient } = Route.useRouteContext();
  const [searchOpen, setSearchOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);

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
              <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4 md:px-6">
                <button
                  type="button"
                  onClick={() => setNavOpen(true)}
                  aria-label="Open menu"
                  className="-ml-1 grid size-10 place-items-center rounded-md text-foreground transition-colors hover:bg-muted lg:hidden"
                >
                  <Menu className="size-5" />
                </button>
                <span className="font-display text-sm font-semibold tracking-tight lg:hidden">
                  Drax Hall LIS
                </span>
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
              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
                <div className="mx-auto w-full max-w-none">
                  <Outlet />
                </div>
              </div>
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
