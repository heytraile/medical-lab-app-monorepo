import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  formatPatientName,
  type PatientNameOrder,
} from "./patient-name";

const STORAGE_KEY = "drax-patient-name-order";

type NameParts = Parameters<typeof formatPatientName>[0];

type PatientNameOrderContextValue = {
  order: PatientNameOrder;
  setOrder: (order: PatientNameOrder) => void;
  formatName: (p: NameParts) => string;
};

const PatientNameOrderContext = createContext<PatientNameOrderContextValue | null>(
  null,
);

function readStoredOrder(): PatientNameOrder {
  if (typeof window === "undefined") return "last-first";
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === "first-last" ? "first-last" : "last-first";
}

export function PatientNameOrderProvider({ children }: { children: ReactNode }) {
  const [order, setOrderState] = useState<PatientNameOrder>(readStoredOrder);

  const setOrder = useCallback((next: PatientNameOrder) => {
    setOrderState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const formatName = useCallback(
    (p: NameParts) => formatPatientName(p, order),
    [order],
  );

  const value = useMemo(
    () => ({ order, setOrder, formatName }),
    [order, setOrder, formatName],
  );

  return (
    <PatientNameOrderContext.Provider value={value}>
      {children}
    </PatientNameOrderContext.Provider>
  );
}

export function usePatientNameOrder() {
  const ctx = useContext(PatientNameOrderContext);
  if (!ctx) {
    throw new Error(
      "usePatientNameOrder must be used within PatientNameOrderProvider",
    );
  }
  return ctx;
}
