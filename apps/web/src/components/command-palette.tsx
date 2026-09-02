import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  startTransition,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
} from "./ui/command";
import { api } from "../lib/api";
import { useDebouncedValue } from "../lib/use-debounced-value";
import {
  buildSearchIndex,
  filterSearchIndex,
  type SearchHit,
  type SearchHitKind,
} from "../lib/search-index";
import {
  FlaskConical,
  Microscope,
  Navigation,
  TestTubes,
  UserRound,
} from "lucide-react";

const GROUP_LABEL: Record<SearchHitKind, string> = {
  nav: "Go to",
  machine: "Machines",
  specimen: "Accessions",
  result: "Results",
};

const GROUP_ORDER: SearchHitKind[] = [
  "nav",
  "machine",
  "specimen",
  "result",
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function CommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [raw, setRaw] = useState("");
  const debounced = useDebouncedValue(raw, 150);
  const deferredQuery = useDeferredValue(debounced);

  const resultsQ = useQuery({
    queryKey: ["results"],
    queryFn: () => api.results(),
    staleTime: 10_000,
    enabled: open,
  });
  const specimensQ = useQuery({
    queryKey: ["specimens"],
    queryFn: () => api.specimens(),
    staleTime: 10_000,
    enabled: open,
  });
  const analyzersQ = useQuery({
    queryKey: ["analyzers-status"],
    queryFn: () => api.analyzerStatus(),
    staleTime: 5_000,
    enabled: open,
  });

  // Prefer cache even when queries idle
  const results =
    resultsQ.data ??
    queryClient.getQueryData<Awaited<ReturnType<typeof api.results>>>([
      "results",
    ]) ??
    [];
  const specimens =
    specimensQ.data ??
    queryClient.getQueryData<Awaited<ReturnType<typeof api.specimens>>>([
      "specimens",
    ]) ??
    [];
  const analyzers =
    analyzersQ.data ??
    queryClient.getQueryData<Awaited<ReturnType<typeof api.analyzerStatus>>>([
      "analyzers-status",
    ]) ??
    [];

  const index = useMemo(
    () =>
      buildSearchIndex({
        analyzers,
        results,
        specimens,
      }),
    [analyzers, results, specimens],
  );

  const hits = useMemo(
    () => filterSearchIndex(index, deferredQuery),
    [index, deferredQuery],
  );

  const grouped = useMemo(() => {
    const map = new Map<SearchHitKind, SearchHit[]>();
    for (const kind of GROUP_ORDER) map.set(kind, []);
    for (const hit of hits) {
      map.get(hit.kind)?.push(hit);
    }
    return map;
  }, [hits]);

  useEffect(() => {
    if (!open) setRaw("");
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const onSelect = useCallback(
    (hit: SearchHit) => {
      onOpenChange(false);
      const url = new URL(hit.href, "http://local.invalid");
      const analyzer = url.searchParams.get("analyzer") ?? undefined;
      const q = url.searchParams.get("q") ?? undefined;
      if (url.pathname === "/bench") {
        void navigate({ to: "/bench", search: { analyzer, q } });
      } else if (url.pathname === "/accession" || url.pathname === "/register") {
        void navigate({ to: "/accession" });
      } else if (url.pathname === "/sync") {
        void navigate({ to: "/sync" });
      } else if (url.pathname === "/release") {
        void navigate({ to: "/release" });
      } else if (url.pathname === "/patients") {
        void navigate({ to: "/patients" });
      } else if (url.pathname === "/staff") {
        void navigate({ to: "/staff" });
      }
    },
    [navigate, onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <Command>
          <CommandInput
            placeholder="Search accessions, tests, machines…"
            value={raw}
            onValueChange={(v) => {
              setRaw(v);
              startTransition(() => {
                /* deferred path via debounce + useDeferredValue */
              });
            }}
          />
          <CommandList>
            <CommandEmpty>No matches.</CommandEmpty>
            {GROUP_ORDER.map((kind) => {
              const items = grouped.get(kind) ?? [];
              if (!items.length) return null;
              return (
                <CommandGroup key={kind} heading={GROUP_LABEL[kind]}>
                  {items.map((hit) => (
                    <CommandItem
                      key={hit.id}
                      value={hit.id}
                      onSelect={() => onSelect(hit)}
                    >
                      <HitIcon kind={hit.kind} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{hit.title}</div>
                        {hit.subtitle && (
                          <div className="truncate text-xs text-muted-foreground">
                            {hit.subtitle}
                          </div>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
          <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
            <span>↑↓ navigate · ↵ open</span>
            <span>
              {raw !== deferredQuery ? "Filtering…" : `${hits.length} hits`}
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function HitIcon({ kind }: { kind: SearchHitKind }) {
  const className = "size-4 shrink-0 text-muted-foreground";
  switch (kind) {
    case "nav":
      return <Navigation className={className} />;
    case "machine":
      return <Microscope className={className} />;
    case "specimen":
      return <UserRound className={className} />;
    case "result":
      return <TestTubes className={className} />;
    default:
      return <FlaskConical className={className} />;
  }
}
