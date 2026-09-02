import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  SpecimenInfo,
  SpecimenType,
  StaffCollector,
} from "@drax-lis/contracts";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { PLACEHOLDER_COLLECTORS } from "../../lib/placeholder-staff";
import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Select } from "../ui/select";

const SPECIMEN_TYPES: { id: SpecimenType; label: string }[] = [
  { id: "blood", label: "Blood" },
  { id: "urine", label: "Urine" },
  { id: "stool", label: "Stool" },
  { id: "other", label: "Other" },
];

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function jobTitleLabel(title: StaffCollector["jobTitle"]): string {
  switch (title) {
    case "phlebotomist":
      return "Phlebotomist";
    case "lab_technologist":
      return "Lab technologist";
    default:
      return title;
  }
}

type Props = {
  value: SpecimenInfo;
  onChange: (next: SpecimenInfo) => void;
  currentUserId?: string | null;
  className?: string;
};

export function SpecimenInformationSection({
  value,
  onChange,
  currentUserId,
  className,
}: Props) {
  const auth = useAuth();
  const signedIn = Boolean(auth.accessToken);

  const collectorsQ = useQuery({
    queryKey: ["staff-collectors"],
    queryFn: () => api.listCollectors(),
    enabled: signedIn,
    staleTime: 60_000,
  });

  const apiFailed = collectorsQ.isError;
  const usingPlaceholder = !signedIn || apiFailed;
  const collectors: StaffCollector[] = usingPlaceholder
    ? PLACEHOLDER_COLLECTORS
    : (collectorsQ.data ?? []);

  const loadErrorMessage =
    collectorsQ.error instanceof ApiError
      ? collectorsQ.error.message
      : collectorsQ.error instanceof Error
        ? collectorsQ.error.message
        : "Could not load staff list.";

  const collectedLocal = value.collectedAt
    ? toDatetimeLocalValue(value.collectedAt)
    : "";

  useEffect(() => {
    if (!currentUserId || value.collectedByStaffId || collectors.length === 0) {
      return;
    }
    const match = collectors.find((c) => c.id === currentUserId);
    if (match) {
      onChange({
        ...value,
        collectedByStaffId: match.id,
        collectedBy: match.fullName,
      });
    }
    // Only default once when collectors load; omit value/onChange to avoid loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, collectors, value.collectedByStaffId]);

  function toggleType(type: SpecimenType) {
    const has = value.specimenTypes.includes(type);
    onChange({
      ...value,
      specimenTypes: has
        ? value.specimenTypes.filter((t) => t !== type)
        : [...value.specimenTypes, type],
    });
  }

  function onCollectorChange(staffId: string) {
    if (!staffId) {
      onChange({
        ...value,
        collectedByStaffId: undefined,
        collectedBy: undefined,
      });
      return;
    }
    const match = collectors.find((c) => c.id === staffId);
    onChange({
      ...value,
      collectedByStaffId: staffId,
      collectedBy: match?.fullName,
    });
  }

  return (
    <div
      className={cn(
        "overflow-visible space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm",
        className,
      )}
    >
      <p className="text-sm font-semibold">Specimen information</p>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-muted-foreground">
          Specimen type
        </legend>
        <div className="flex flex-wrap gap-3">
          {SPECIMEN_TYPES.map(({ id, label }) => (
            <label
              key={id}
              className="flex items-center gap-2 text-sm capitalize"
            >
              <input
                type="checkbox"
                checked={value.specimenTypes.includes(id)}
                onChange={() => toggleType(id)}
                className="size-4 rounded border-border"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Date &amp; time collected
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="datetime-local"
            value={collectedLocal}
            onChange={(e) => {
              const raw = e.target.value;
              onChange({
                ...value,
                collectedAt: raw ? new Date(raw).toISOString() : undefined,
              });
            }}
            className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-10 shrink-0"
            onClick={() =>
              onChange({ ...value, collectedAt: new Date().toISOString() })
            }
          >
            Use now
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Enter manually or use the workstation clock.
        </p>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Collected by
        </span>
        <Select
          id="collected-by-staff"
          value={value.collectedByStaffId ?? ""}
          onValueChange={onCollectorChange}
          disabled={collectorsQ.isLoading && signedIn}
          placeholder={
            collectorsQ.isLoading && signedIn
              ? "Loading staff…"
              : "Select collector…"
          }
          aria-label="Collected by"
          className="h-10"
          options={[
            {
              value: "",
              label: "Select collector…",
            },
            ...collectors.map((c) => ({
              value: c.id,
              label: `${c.fullName} (${jobTitleLabel(c.jobTitle)})`,
            })),
          ]}
        />
      </label>

      {!signedIn && (
        <p className="break-words rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          Sign in to load the live staff roster from the lab API (local
          Supabase). Showing demo collectors until you sign in.
        </p>
      )}

      {signedIn && apiFailed && (
        <p className="break-words rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          Could not reach the lab staff API ({loadErrorMessage}). Showing demo
          collectors — ensure the cloud API is running on port 3102 and you are
          signed in.
        </p>
      )}
    </div>
  );
}

export function primarySpecimenType(
  types: SpecimenType[] | undefined,
): string {
  return types?.[0] ?? "blood";
}

export const EMPTY_SPECIMEN_INFO: SpecimenInfo = {
  specimenTypes: [],
};
