import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { io } from "socket.io-client";
import { getWsBaseUrl } from "../lib/api";

export const Route = createFileRoute("/_lab")({
  component: LabLayout,
});

function LabLayout() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    const socket = io(`${getWsBaseUrl()}/bench`, {
      transports: ["websocket", "polling"],
    });
    socket.on("bench.event", () => {
      void queryClient.invalidateQueries({ queryKey: ["results"] });
      void queryClient.invalidateQueries({ queryKey: ["specimens"] });
      void queryClient.invalidateQueries({ queryKey: ["syncStatus"] });
    });
    return () => {
      socket.disconnect();
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen flex flex-col">
        <header className="bg-lab-navy text-white px-6 py-4 flex items-center justify-between shadow">
          <div>
            <p className="text-xs uppercase tracking-widest text-teal-200">
              Drax Hall Clinical Laboratory
            </p>
            <h1 className="text-xl font-semibold">LIS Workbench</h1>
          </div>
          <nav className="flex gap-4 text-sm">
            <NavLink to="/bench">Bench</NavLink>
            <NavLink to="/register">Register</NavLink>
            <NavLink to="/sync">Sync</NavLink>
          </nav>
        </header>
        <main className="flex-1 p-6 max-w-6xl w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </QueryClientProvider>
  );
}

function NavLink({
  to,
  children,
}: {
  to: "/bench" | "/register" | "/sync";
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="px-3 py-1.5 rounded-md hover:bg-white/10 [&.active]:bg-lab-teal [&.active]:text-white"
      activeOptions={{ exact: true }}
    >
      {children}
    </Link>
  );
}
