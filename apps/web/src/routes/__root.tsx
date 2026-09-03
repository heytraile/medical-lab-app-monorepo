import type { ReactNode } from "react";
import {
  Outlet,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import appCss from "../styles.css?url";
import { AuthProvider, useAuth } from "../lib/auth";
import { setAuthTokenProvider } from "../lib/api";

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Drax Hall LIS" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <AuthProvider>
        <AuthTokenBridge />
        <Outlet />
      </AuthProvider>
    </RootDocument>
  );
}

function AuthTokenBridge() {
  const { accessToken } = useAuth();
  const tokenRef = useRef<string | null>(accessToken);
  tokenRef.current = accessToken;
  setAuthTokenProvider(() => tokenRef.current);
  return null;
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
