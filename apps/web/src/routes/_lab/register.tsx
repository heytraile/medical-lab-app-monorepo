import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../lib/api";

export const Route = createFileRoute("/_lab/register")({
  component: RegisterPage,
});

function RegisterPage() {
  const qc = useQueryClient();
  const [patientName, setPatientName] = useState("");
  const [tests, setTests] = useState("CBC");
  const [last, setLast] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.registerSpecimen({
        patientName,
        orderedTests: tests
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .map((code) => ({ code })),
        printLabel: true,
      }),
    onSuccess: (data) => {
      setLast(
        `Registered ${data.specimen.accessionNumber}` +
          (data.printResult?.ok
            ? " — label sent"
            : data.printResult?.error
              ? ` — print: ${data.printResult.error}`
              : ""),
      );
      setPatientName("");
      void qc.invalidateQueries({ queryKey: ["specimens"] });
      void qc.invalidateQueries({ queryKey: ["syncStatus"] });
    },
  });

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-lab-navy">Specimen Registration</h2>
        <p className="text-sm text-slate-600">
          Issues an accession / barcode and attempts 1-click ZPL print to the
          local Zebra (or simulator on :9100). USB wedge scanners type into the
          same fields.
        </p>
      </div>

      <form
        className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          if (!patientName.trim()) return;
          mutation.mutate();
        }}
      >
        <label className="block space-y-1">
          <span className="text-sm font-medium">Patient name</span>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            value={patientName}
            onChange={(e) => setPatientName(e.target.value)}
            placeholder="Jane Doe"
            required
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Ordered tests (comma-separated)</span>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            value={tests}
            onChange={(e) => setTests(e.target.value)}
            placeholder="CBC, BMP"
          />
        </label>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-md bg-lab-teal px-4 py-2 text-white font-medium hover:bg-teal-700 disabled:opacity-50"
        >
          {mutation.isPending ? "Registering…" : "Register & Print Label"}
        </button>
      </form>

      {last && (
        <p className="text-sm text-lab-ok bg-green-50 border border-green-200 rounded-md px-3 py-2">
          {last}
        </p>
      )}
      {mutation.isError && (
        <p className="text-sm text-lab-danger">
          Registration failed — is edge-engine running?
        </p>
      )}
    </div>
  );
}
