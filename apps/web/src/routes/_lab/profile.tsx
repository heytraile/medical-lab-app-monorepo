import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ProfileNameFormSchema,
  type ProfileNameFormValues,
} from "@drax-lis/contracts";
import { canAuthorize, isAdmin, useAuth } from "../../lib/auth";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { FormErrorSummary, FormField } from "../../components/forms/form-field";
import { useIsWide } from "../../lib/use-media-query";

export const Route = createFileRoute("/_lab/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const auth = useAuth();
  const isWide = useIsWide();
  const signedIn = Boolean(auth.accessToken);
  const canEditName = Boolean(auth.session?.user?.id) && !auth.isDevSession;

  const {
    register,
    handleSubmit,
    reset,
    setError,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<ProfileNameFormValues>({
    resolver: zodResolver(ProfileNameFormSchema),
    defaultValues: { fullName: auth.profile?.full_name ?? "" },
    mode: "onBlur",
    reValidateMode: "onChange",
  });

  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    reset({ fullName: auth.profile?.full_name ?? "" });
  }, [auth.profile?.full_name, reset]);

  async function onSubmit(values: ProfileNameFormValues) {
    clearErrors("root");
    setMessage(null);
    try {
      const parsed = ProfileNameFormSchema.parse(values);
      await auth.saveFullName(parsed.fullName);
      setMessage("Name saved.");
    } catch (err) {
      setError("root", {
        message: err instanceof Error ? err.message : "Could not save name",
      });
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
    <div className="mx-auto w-full max-w-lg space-y-4 lg:space-y-6">
      {isWide ? (
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
      ) : null}

      <div className="space-y-4 rounded-xl border border-border bg-card p-4 lg:p-5">
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

      {auth.role && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Capabilities
          </p>
          {isAdmin(auth.role) ? (
            <>
              <p className="text-sm text-muted-foreground">
                You can sign off on results, respond to review requests, and manage
                staff — including who else can sign off.
              </p>
              <Button asChild variant="secondary" size="sm">
                <Link to="/staff">Manage staff</Link>
              </Button>
            </>
          ) : canAuthorize(auth.role) ? (
            <p className="text-sm text-muted-foreground">
              You can sign off on results and respond to review requests on the
              Release queue.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              You can accession specimens, review bench results, and register
              patients. Ask a supervisor if you need someone to sign off on
              results.
            </p>
          )}
        </div>
      )}

      {canEditName ? (
        <form
          className="space-y-3 rounded-xl border border-border bg-card p-5"
          noValidate
          onSubmit={handleSubmit(onSubmit)}
        >
          <FormField
            label="Full name"
            htmlFor="profile-full-name"
            error={errors.fullName}
            required
          >
            <Input
              id="profile-full-name"
              placeholder="e.g. Jordan Blake"
              autoComplete="name"
              aria-invalid={Boolean(errors.fullName)}
              {...register("fullName")}
            />
          </FormField>
          <Button
            type="submit"
            size={isWide ? "default" : "lg"}
            className={!isWide ? "min-h-11 w-full" : undefined}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Saving…" : "Save name"}
          </Button>
          {message && (
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              {message}
            </p>
          )}
          <FormErrorSummary message={errors.root?.message ?? null} />
        </form>
      ) : (
        <p className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {auth.isDevSession
            ? "This is a temporary demo sign-in. Sign in with your email and password to edit your name."
            : "Sign in to edit your display name."}
        </p>
      )}
    </div>
  );
}
