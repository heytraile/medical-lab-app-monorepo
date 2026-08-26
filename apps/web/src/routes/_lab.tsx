import { createFileRoute, Outlet } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ThemeProvider } from "../components/theme-provider";
import { AppSidebar } from "../components/app-sidebar";
import { CommandPalette } from "../components/command-palette";
import {
  NotificationCenter,
  NotificationToastStack,
} from "../components/notification-center";
import { NotificationProvider } from "../lib/notification-store";

export const Route = createFileRoute("/_lab")({
  component: LabLayout,
});

function LabLayout() {
  const { queryClient } = Route.useRouteContext();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <NotificationProvider>
          <div className="flex h-svh overflow-hidden bg-background text-foreground">
            <AppSidebar onOpenSearch={() => setSearchOpen(true)} />
            <main className="flex min-h-0 min-w-0 flex-1 flex-col">
              <header className="flex h-12 shrink-0 items-center justify-end border-b border-border px-4 md:px-6">
                <NotificationCenter />
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto p-6 md:p-8">
                <div className="mx-auto w-full max-w-none">
                  <Outlet />
                </div>
              </div>
            </main>
            <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
            <NotificationToastStack />
          </div>
        </NotificationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
