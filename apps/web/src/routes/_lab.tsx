import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { FlaskConical, Loader2, Search } from "lucide-react";
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
import { useShowSidebar } from "../lib/use-media-query";
import { readStoredAccessToken, useAuth } from "../lib/auth";
import { isCloudMode } from "../lib/api";

export const Route = createFileRoute("/_lab")({
  beforeLoad: ({ location }) => {
    // SSR has no localStorage — defer auth to LabAuthGate on the client.
    if (typeof window === "undefined") return;
    // Cloud + edge both restore session client-side after hydration.
    if (isCloudMode) return;
    if (!readStoredAccessToken()) {
      throw redirect({
        to: "/login",
        search: { redirect: location.pathname },
      });
    }
  },
  component: LabLayout,
});

const FILL_VIEWPORT_PATHS = [
  "/messages",
  "/bench",
  "/accession",
  "/labels",
  "/orders",
  "/release",
] as const;

function isFillViewportPath(pathname: string): boolean {
  return FILL_VIEWPORT_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function LabLayout() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <LabAuthGate queryClient={queryClient} />
    </QueryClientProvider>
  );
}

function LabAuthGate({ queryClient }: { queryClient: QueryClient }) {
  const auth = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!auth.ready || !auth.hydrated) return;
    if (auth.accessToken) return;
    queryClient.clear();
    void navigate({
      to: "/login",
      search: { redirect: pathname },
      replace: true,
    });
  }, [auth.ready, auth.hydrated, auth.accessToken, pathname, navigate, queryClient]);

  if (!auth.ready || !auth.hydrated) {
    return (
      <div className="grid h-svh place-items-center bg-background text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-accent" aria-hidden />
          <p className="text-sm">Restoring session…</p>
        </div>
      </div>
    );
  }

  if (!auth.accessToken) {
    return (
      <div className="grid h-svh place-items-center bg-background text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-accent" aria-hidden />
          <p className="text-sm">Redirecting to sign in…</p>
        </div>
      </div>
    );
  }

  return <LabShell />;
}

function LabShell() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const fillViewport = isFillViewportPath(pathname);
  const showSidebar = useShowSidebar();

  return (
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
                <header
                  className={cn(
                    "flex shrink-0 items-center border-b border-border",
                    showSidebar
                      ? "min-h-12 gap-2 px-6 py-0"
                      : "min-h-14 touch-tablet:min-h-[3.75rem] gap-2.5 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-5 lg:px-8",
                  )}
                >
                  <div
                    className={cn(
                      "min-w-0 items-center gap-2.5",
                      showSidebar ? "hidden" : "flex",
                    )}
                  >
                    <div className="grid size-8 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground">
                      <FlaskConical className="size-4" aria-hidden />
                    </div>
                    <div className="min-w-0 leading-tight">
                      <p className="truncate font-display text-sm font-semibold tracking-tight touch-tablet:text-base">
                        Drax Hall LIS
                      </p>
                      <p className="truncate text-[10px] uppercase tracking-wider text-muted-foreground touch-tablet:text-xs">
                        Workbench
                      </p>
                    </div>
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSearchOpen(true)}
                      aria-label="Search"
                      className={cn(
                        "grid size-10 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                        showSidebar && "hidden",
                      )}
                    >
                      <Search className="size-4" />
                    </button>
                    <NotificationCenter />
                  </div>
                </header>
                <div
                  className={cn(
                    "min-h-0 flex-1",
                    !showSidebar && "overflow-x-hidden",
                    fillViewport
                      ? cn(
                          "overflow-hidden",
                          showSidebar
                            ? "px-5 py-4 lg:px-8 lg:py-5"
                            : "p-0 px-3 pt-2 sm:px-5 lg:px-8",
                        )
                      : "overflow-y-auto p-4 sm:p-6 md:p-8 lg:px-8",
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
  );
}
