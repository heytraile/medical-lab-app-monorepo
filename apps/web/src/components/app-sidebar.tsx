import { useEffect, useState } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FlaskConical,
  LayoutDashboard,
  LogIn,
  LogOut,
  Microscope,
  PanelLeft,
  Printer,
  Search,
  UserRound,
  Users,
  Wifi,
} from "lucide-react";
import { api } from "../lib/api";
import { analyzerLabel } from "../lib/analyzers";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetCloseButton } from "./ui/sheet";
import { ThemeToggle } from "./theme-provider";
import { Badge } from "./ui/badge";

const COLLAPSE_KEY = "lis-sidebar-collapsed";

type Props = {
  onOpenSearch: () => void;
  /** Mobile drawer state, owned by the layout so the top bar can open it. */
  navOpen: boolean;
  onNavOpenChange: (open: boolean) => void;
};

/**
 * Two presentations of one nav: a persistent rail from lg up, and a drawer
 * below it. The drawer is always expanded — an icon-only rail inside a sheet
 * would be pointless — so the collapse control is desktop-only.
 */
export function AppSidebar({ onOpenSearch, navOpen, onNavOpenChange }: Props) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(COLLAPSE_KEY);
    if (saved === "1") setCollapsed(true);
  }, []);

  // Backstop for navigation the drawer's own links don't see, such as the
  // command palette jumping routes while the drawer is open.
  useEffect(() => {
    onNavOpenChange(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <>
      <aside
        className={cn(
          "hidden h-svh shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
          collapsed ? "w-[4.25rem]" : "w-64",
        )}
      >
        <SidebarBody
          collapsed={collapsed}
          onToggleCollapse={toggle}
          onOpenSearch={onOpenSearch}
        />
      </aside>

      <Sheet open={navOpen} onOpenChange={onNavOpenChange}>
        <SheetContent
          side="left"
          label="Navigation"
          className="border-sidebar-border bg-sidebar text-sidebar-foreground lg:hidden"
        >
          <SidebarBody
            collapsed={false}
            onOpenSearch={() => {
              onNavOpenChange(false);
              onOpenSearch();
            }}
            onNavigate={() => onNavOpenChange(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

function SidebarBody({
  collapsed,
  onToggleCollapse,
  onOpenSearch,
  onNavigate,
}: {
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onOpenSearch: () => void;
  onNavigate?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const search = useRouterState({ select: (s) => s.location.search });
  const auth = useAuth();
  const navigate = useNavigate();

  const analyzersQ = useQuery({
    queryKey: ["analyzers-status"],
    queryFn: () => api.analyzerStatus(),
    refetchInterval: 5_000,
  });
  const healthQ = useQuery({
    queryKey: ["health"],
    queryFn: () => api.health(),
    refetchInterval: 15_000,
    retry: 1,
  });

  const activeAnalyzer =
    typeof search === "object" && search && "analyzer" in search
      ? (search as { analyzer?: string }).analyzer
      : undefined;

  const signedIn = Boolean(auth.accessToken);
  const initials = auth.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";

  async function onSignOut() {
    await auth.signOut();
    void navigate({ to: "/login" });
  }

  return (
    <>
      <div
        className={cn(
          "flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-3",
          collapsed && "justify-center px-2",
        )}
      >
        <div className="flex size-8 items-center justify-center rounded-md bg-sidebar-accent text-accent-foreground">
          <FlaskConical className="size-4" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-sm font-semibold tracking-tight">
              Drax Hall LIS
            </p>
            <p className="truncate text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
              Workbench
            </p>
          </div>
        )}
        {onToggleCollapse ? (
          <Button
            variant="ghost"
            size="icon"
            className="text-sidebar-foreground hover:bg-sidebar-muted"
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
          </Button>
        ) : (
          <SheetCloseButton className="text-sidebar-foreground hover:bg-sidebar-muted" />
        )}
      </div>

      <div className="p-2">
        <Button
          variant="ghost"
          className={cn(
            "w-full justify-start gap-2 text-sidebar-foreground hover:bg-sidebar-muted",
            collapsed && "justify-center px-0",
          )}
          onClick={onOpenSearch}
        >
          <Search className="size-4 shrink-0" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Search</span>
              <kbd className="rounded border border-sidebar-border bg-sidebar-muted px-1.5 py-0.5 text-[10px] text-sidebar-foreground/70">
                ⌘K
              </kbd>
            </>
          )}
        </Button>
      </div>

      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 pb-3">
        <div className="space-y-1">
          {!collapsed && (
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              Workflow
            </p>
          )}
          <NavItem
            to="/bench"
            search={{}}
            icon={LayoutDashboard}
            label="Bench Review"
            active={pathname === "/bench" && !activeAnalyzer}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
          <NavItem
            to="/register"
            icon={ClipboardCheck}
            label="Register"
            active={pathname === "/register"}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
          <NavItem
            to="/labels"
            icon={Printer}
            label="Labels"
            active={pathname === "/labels"}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
          <NavItem
            to="/sync"
            icon={Wifi}
            label="Sync"
            active={pathname === "/sync"}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
          <NavItem
            to="/release"
            icon={ClipboardCheck}
            label="Release queue"
            active={pathname === "/release"}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
          <NavItem
            to="/patients"
            icon={Users}
            label="Patients"
            active={pathname === "/patients"}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        </div>

        <div className="space-y-1">
          {!collapsed && (
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
              Machines
            </p>
          )}
          {collapsed && (
            <div className="flex justify-center py-1" title="Machines">
              <Microscope className="size-4 opacity-60" />
            </div>
          )}
          <NavItem
            to="/bench"
            search={{}}
            icon={PanelLeft}
            label="All results"
            active={pathname === "/bench" && !activeAnalyzer}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
          {(analyzersQ.data ?? []).map((a) => (
            <NavItem
              key={a.analyzerId}
              to="/bench"
              search={{ analyzer: a.analyzerId }}
              icon={Microscope}
              label={analyzerLabel(a.analyzerId)}
              active={pathname === "/bench" && activeAnalyzer === a.analyzerId}
              collapsed={collapsed}
            onNavigate={onNavigate}
              status={
                a.lastParseError
                  ? "error"
                  : a.listening
                    ? "ok"
                    : "off"
              }
              title={`${analyzerLabel(a.analyzerId)}${a.lastAccession ? ` · last ${a.lastAccession}` : ""}`}
            />
          ))}
        </div>
      </nav>

      <div className="mt-auto space-y-2 border-t border-sidebar-border p-2">
        {signedIn ? (
          <div
            className={cn(
              "rounded-md bg-sidebar-muted/40 p-2",
              collapsed && "flex flex-col items-center gap-1 p-1",
            )}
          >
            {collapsed ? (
              <Link
                to="/profile"
                title={`${auth.displayName}${auth.role ? ` · ${auth.role}` : ""}`}
                className="flex size-9 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-accent-foreground"
              >
                {initials}
              </Link>
            ) : (
              <div className="mb-1.5 flex min-w-0 items-center gap-2">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[11px] font-semibold text-accent-foreground">
                  {initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium leading-tight">
                    {auth.displayName}
                  </p>
                  {auth.role && (
                    <Badge variant="muted" className="mt-0.5 capitalize">
                      {auth.role}
                    </Badge>
                  )}
                </div>
              </div>
            )}
            <div
              className={cn(
                "flex gap-1",
                collapsed ? "flex-col" : "items-center",
              )}
            >
              <Link
                to="/profile"
                title="Profile"
                onClick={onNavigate}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-sidebar-muted",
                  pathname === "/profile" && "bg-sidebar-muted",
                  collapsed && "justify-center px-1.5",
                )}
              >
                <UserRound className="size-3.5 shrink-0" />
                {!collapsed && <span>Profile</span>}
              </Link>
              <button
                type="button"
                title="Sign out"
                onClick={() => void onSignOut()}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs transition-colors hover:bg-sidebar-muted",
                  collapsed && "justify-center px-1.5",
                )}
              >
                <LogOut className="size-3.5 shrink-0" />
                {!collapsed && <span>Sign out</span>}
              </button>
            </div>
          </div>
        ) : (
          <Link
            to="/login"
            title="Sign in"
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-sidebar-muted",
              collapsed && "justify-center px-0",
            )}
          >
            <LogIn className="size-4 shrink-0" />
            {!collapsed && <span>Sign in</span>}
          </Link>
        )}

        <div
          className={cn(
            "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs",
            collapsed && "justify-center px-0",
          )}
        >
          <span
            className={cn(
              "size-2 rounded-full",
              healthQ.isSuccess ? "bg-emerald-400" : "bg-amber-400",
            )}
          />
          {!collapsed && (
            <span className="truncate text-sidebar-foreground/80">
              {healthQ.isSuccess ? "Edge online" : "Edge unreachable"}
            </span>
          )}
        </div>
        <div
          className={cn(
            "flex items-center",
            collapsed ? "justify-center" : "justify-end",
          )}
        >
          <ThemeToggle className="text-sidebar-foreground hover:bg-sidebar-muted" />
        </div>
      </div>
    </>
  );
}

function NavItem({
  to,
  search,
  icon: Icon,
  label,
  active,
  collapsed,
  status,
  title,
  onNavigate,
}: {
  to: "/bench" | "/register" | "/labels" | "/sync" | "/release" | "/patients" | "/profile";
  search?: { analyzer?: string; q?: string };
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  collapsed: boolean;
  status?: "ok" | "off" | "error";
  title?: string;
  onNavigate?: () => void;
}) {
  return (
    <Link
      to={to}
      search={search}
      title={title ?? label}
      onClick={onNavigate}
      className={cn(
        "group relative flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-sidebar-muted",
        active && "bg-sidebar-accent text-accent-foreground hover:bg-sidebar-accent",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && status && (
        <Badge
          variant={
            status === "ok" ? "ok" : status === "error" ? "danger" : "muted"
          }
          className="ml-auto"
        >
          {status === "ok" ? "on" : status === "error" ? "err" : "off"}
        </Badge>
      )}
      {collapsed && status && (
        <span
          className={cn(
            "absolute right-1 top-1 size-1.5 rounded-full",
            status === "ok" && "bg-emerald-400",
            status === "off" && "bg-slate-500",
            status === "error" && "bg-red-400",
          )}
        />
      )}
    </Link>
  );
}
