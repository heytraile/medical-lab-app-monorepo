import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useAuth } from "../lib/auth";
import { supabaseConfigured } from "../lib/supabase";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";

type LoginSearch = {
  redirect?: string;
};

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect:
      typeof search.redirect === "string" && search.redirect.startsWith("/")
        ? search.redirect
        : undefined,
  }),
  component: LoginPage,
});

function safeRedirect(path: string | undefined): "/bench" | "/release" | "/profile" | "/sync" | "/register" | "/patients" {
  const allowed = new Set([
    "/bench",
    "/release",
    "/profile",
    "/sync",
    "/register",
    "/patients",
  ]);
  if (path && allowed.has(path)) {
    return path as "/bench" | "/release" | "/profile" | "/sync" | "/register" | "/patients";
  }
  return "/bench";
}

function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const dest = safeRedirect(redirect);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const signedIn = Boolean(auth.accessToken);

  async function goAfterAuth() {
    void navigate({ to: dest });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await auth.signIn(email.trim(), password);
      await goAfterAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Drax Hall LIS
          </p>
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            Sign in
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Staff login for Bench, Profile, and the Release queue.
          </p>
        </div>

        {signedIn ? (
          <div className="space-y-4 rounded-xl border border-border bg-card p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">{auth.displayName}</p>
              {auth.role && (
                <Badge variant="muted" className="capitalize">
                  {auth.role}
                </Badge>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Button type="button" onClick={() => void goAfterAuth()}>
                Continue to workbench
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link to="/profile">Open profile</Link>
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => void auth.signOut()}
              >
                Sign out
              </Button>
            </div>
          </div>
        ) : supabaseConfigured ? (
          <form className="space-y-3" onSubmit={onSubmit}>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Email</span>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Password</span>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </label>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
            {error && <p className="text-sm text-lab-danger">{error}</p>}
          </form>
        ) : (
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              Supabase keys unset — use a local dev role token against the cloud
              API.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                onClick={() => {
                  auth.useDevRole("authorizer");
                  void goAfterAuth();
                }}
              >
                Continue as authorizer (dev)
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  auth.useDevRole("tech");
                  void goAfterAuth();
                }}
              >
                Continue as tech (dev)
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  auth.useDevRole("admin");
                  void goAfterAuth();
                }}
              >
                Continue as admin (dev)
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
