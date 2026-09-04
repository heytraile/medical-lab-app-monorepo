import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoginFormSchema, type LoginFormValues } from "@drax-lis/contracts";
import { useAuth } from "../lib/auth";
import { supabaseConfigured } from "../lib/supabase";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { FormErrorSummary, FormField } from "../components/forms/form-field";

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

function safeRedirect(path: string | undefined): "/bench" | "/release" | "/profile" | "/sync" | "/accession" | "/register" | "/patients" | "/staff" {
  const allowed = new Set([
    "/bench",
    "/release",
    "/profile",
    "/sync",
    "/accession",
    "/register",
    "/patients",
    "/staff",
  ]);
  if (path && allowed.has(path)) {
    return path as "/bench" | "/release" | "/profile" | "/sync" | "/accession" | "/register" | "/patients" | "/staff";
  }
  return "/bench";
}

function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const dest = safeRedirect(redirect);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    clearErrors,
  } = useForm<LoginFormValues>({
    resolver: zodResolver(LoginFormSchema),
    defaultValues: { email: "", password: "" },
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  const signedIn = Boolean(auth.accessToken);
  const [showDevAccounts, setShowDevAccounts] = useState(false);

  async function goAfterAuth() {
    void navigate({ to: dest });
  }

  async function onSubmit(values: LoginFormValues) {
    clearErrors("root");
    try {
      const parsed = LoginFormSchema.parse(values);
      await auth.signIn(parsed.email, parsed.password);
      await goAfterAuth();
    } catch (err) {
      setError("root", {
        message: err instanceof Error ? err.message : "Sign-in failed",
      });
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
          <form
            className="space-y-3"
            noValidate
            onSubmit={handleSubmit(onSubmit)}
          >
            <FormField
              label="Email"
              htmlFor="login-email"
              error={errors.email}
              required
            >
              <Input
                id="login-email"
                type="email"
                autoComplete="username"
                aria-invalid={Boolean(errors.email)}
                {...register("email")}
              />
            </FormField>
            <FormField
              label="Password"
              htmlFor="login-password"
              error={errors.password}
              required
            >
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                aria-invalid={Boolean(errors.password)}
                {...register("password")}
              />
            </FormField>
            <Button
              type="submit"
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
            <FormErrorSummary message={errors.root?.message ?? null} />
            <div className="rounded-lg border border-border bg-muted/30">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-muted-foreground"
                onClick={() => setShowDevAccounts((v) => !v)}
              >
                Local demo accounts
                <span>{showDevAccounts ? "−" : "+"}</span>
              </button>
              {showDevAccounts && (
                <ul className="space-y-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
                  <li>
                    <code className="text-foreground">admin@draxhall.local</code>{" "}
                    — Staff registry, sign-off on results, manage permissions
                  </li>
                  <li>
                    <code className="text-foreground">authorizer@draxhall.local</code>{" "}
                    — Release queue and sign-off
                  </li>
                  <li>
                    <code className="text-foreground">tech@draxhall.local</code>{" "}
                    — Accession and bench
                  </li>
                  <li className="pt-1 text-[11px]">
                    Password for all: <code>password123</code>
                  </li>
                </ul>
              )}
            </div>
          </form>
        ) : (
          <div className="space-y-3 rounded-xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              Sign-in is not fully configured. You can continue with a demo
              account for now.
            </p>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                onClick={() => {
                  auth.useDevRole("authorizer");
                  void goAfterAuth();
                }}
              >
                Continue as sign-off staff (demo)
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  auth.useDevRole("tech");
                  void goAfterAuth();
                }}
              >
                Continue as tech (demo)
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  auth.useDevRole("admin");
                  void goAfterAuth();
                }}
              >
                Continue as admin (demo)
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
