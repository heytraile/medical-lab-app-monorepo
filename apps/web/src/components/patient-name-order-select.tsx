import { usePatientNameOrder } from "../lib/patient-name-order";
import { Select } from "./ui/select";

export function PatientNameOrderSelect({ className }: { className?: string }) {
  const { order, setOrder } = usePatientNameOrder();

  return (
    <Select
      value={order}
      onValueChange={(value) =>
        setOrder(value === "first-last" ? "first-last" : "last-first")
      }
      aria-label="Patient name order"
      className={className}
      options={[
        { value: "last-first", label: "Last, First" },
        { value: "first-last", label: "First Last" },
      ]}
    />
  );
}
