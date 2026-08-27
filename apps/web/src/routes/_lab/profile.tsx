import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useAuth } from "../../lib/auth";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";

export const Route = createFileRoute("/_lab/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const auth = useAuth();
  const signedIn = Boolean(auth.accessToken);
  const canEditName = Boolean(auth.session?.user?.id) && !auth.isDevSession;

  const [fullName, setFullName] = useState(auth.profile?.full_name ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFullName(auth.profile?.full_name ?? "");
  }, [auth.profile?.full_name]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await auth.saveFullName(fullName);
      setMessage("Name saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save name");
    } finally {
      setBusy(false);
    }
  }

  if (!auth.ready) {
    return (
      <div className="mx-auto w-full max-w-lg text-sm text-muted-foreground">
        Loading account…
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="mx-auto w-full max-w-lg space-y-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Account
          </p>
          <h2 className="font-display text-2xl font-semibold sm:text-3xl tracking-tight">
            Profile
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to see your name and role for this workbench.
          </p>
        </div>
        <Button asChild>
          <Link to="/login" search={{ redirect: "/profile" }}>
            Sign in
          </Link>
        </Button>
      </div>
    );
  }

  const email =
    auth.profile?.email ?? auth.session?.user?.email ?? "—";

  return (
    <div className="mx-auto w-full max-w-lg space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Account
        </p>
        <h2 className="font-display text-2xl font-semibold sm:text-3xl tracking-tight">
          Profile
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your staff identity for Bench, registration, and release.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Display name
          </p>
          <p className="text-lg font-medium">{auth.displayName}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Email
          </p>
          <p className="text-sm">{email}</p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Role
          </p>
          {auth.role ? (
            <Badge variant="muted" className="capitalize">
              {auth.role}
            </Badge>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
        </div>
      </div>

      {canEditName ? (
        <form
          className="space-y-3 rounded-xl border border-border bg-card p-5"
          onSubmit={(e) => void onSave(e)}
        >
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">Full name</span>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Jordan Blake"
              autoComplete="name"
            />
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save name"}
          </Button>
          {message && (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              {message}
            </p>
          )}
          {error && <p className="text-sm text-lab-danger">{error}</p>}
        </form>
      ) : (
        <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {auth.isDevSession
            ? "Dev role sessions use a synthetic identity. Sign in with Supabase to edit your display name."
            : "Name editing requires a Supabase session."}
        </p>
      )}
    </div>
  );
}
