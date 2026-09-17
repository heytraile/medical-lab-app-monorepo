import { Input } from "../ui/input";
import { cn } from "../../lib/utils";

export type ReferringPhysicianInfo = {
  name: string;
  email: string;
};

export const EMPTY_REFERRING_PHYSICIAN: ReferringPhysicianInfo = {
  name: "",
  email: "",
};

export function ReferringPhysicianSection({
  value,
  onChange,
  className,
}: {
  value: ReferringPhysicianInfo;
  onChange: (next: ReferringPhysicianInfo) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm",
        className,
      )}
    >
      <div>
        <p className="text-sm font-semibold">Referring physician</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Optional. If you add an email, it is pre-filled when sending the
          report to the doctor.
        </p>
      </div>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Doctor’s name
        </span>
        <Input
          type="text"
          autoComplete="name"
          placeholder="Dr. Jane Smith"
          value={value.name}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </label>
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          Doctor’s email
        </span>
        <Input
          type="email"
          autoComplete="email"
          placeholder="doctor@example.com"
          value={value.email}
          onChange={(e) => onChange({ ...value, email: e.target.value })}
        />
      </label>
    </div>
  );
}
