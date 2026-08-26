import { Injectable } from "@nestjs/common";

export type AnalyzerRuntimeStatus = {
  analyzerId: string;
  transport: "tcp" | "serial";
  protocol: string;
  listening: boolean;
  listenTarget?: string;
  lastConnectAt?: string;
  lastMessageAt?: string;
  lastAccession?: string;
  lastParseError?: string;
  lastErrorAt?: string;
  connectedClients: number;
};

/**
 * In-memory connection / parse status for Bench + GET /analyzers/status.
 */
@Injectable()
export class AnalyzerStatusService {
  private readonly byId = new Map<string, AnalyzerRuntimeStatus>();

  upsert(
    analyzerId: string,
    patch: Partial<AnalyzerRuntimeStatus> & {
      transport: "tcp" | "serial";
      protocol: string;
    },
  ) {
    const prev = this.byId.get(analyzerId);
    const next: AnalyzerRuntimeStatus = {
      analyzerId,
      listening: false,
      connectedClients: 0,
      ...prev,
      ...patch,
    };
    this.byId.set(analyzerId, next);
    return next;
  }

  markListening(
    analyzerId: string,
    opts: {
      transport: "tcp" | "serial";
      protocol: string;
      listenTarget: string;
      listening: boolean;
    },
  ) {
    return this.upsert(analyzerId, opts);
  }

  markConnect(analyzerId: string) {
    const cur = this.byId.get(analyzerId);
    if (!cur) return;
    this.byId.set(analyzerId, {
      ...cur,
      lastConnectAt: new Date().toISOString(),
      connectedClients: cur.connectedClients + 1,
    });
  }

  markDisconnect(analyzerId: string) {
    const cur = this.byId.get(analyzerId);
    if (!cur) return;
    this.byId.set(analyzerId, {
      ...cur,
      connectedClients: Math.max(0, cur.connectedClients - 1),
    });
  }

  markSuccess(analyzerId: string, accession?: string) {
    const cur = this.byId.get(analyzerId);
    if (!cur) return;
    this.byId.set(analyzerId, {
      ...cur,
      lastMessageAt: new Date().toISOString(),
      lastAccession: accession ?? cur.lastAccession,
      lastParseError: undefined,
    });
  }

  markError(analyzerId: string, error: string) {
    const cur = this.byId.get(analyzerId);
    if (!cur) return;
    this.byId.set(analyzerId, {
      ...cur,
      lastParseError: error,
      lastErrorAt: new Date().toISOString(),
    });
  }

  list(): AnalyzerRuntimeStatus[] {
    return [...this.byId.values()].sort((a, b) =>
      a.analyzerId.localeCompare(b.analyzerId),
    );
  }
}
