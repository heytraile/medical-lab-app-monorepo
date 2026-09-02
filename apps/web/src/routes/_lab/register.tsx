import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy path — accessioning moved to /accession. */
export const Route = createFileRoute("/_lab/register")({
  beforeLoad: () => {
    throw redirect({ to: "/accession" });
  },
});
