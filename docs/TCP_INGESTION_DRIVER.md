# TCP ingestion driver — how to read `tcp-ingestion.driver.ts`

**Who this is for:** you, when you're staring at [`apps/edge-engine/src/ingestion/tcp-ingestion.driver.ts`](../apps/edge-engine/src/ingestion/tcp-ingestion.driver.ts) and NestJS + Node networking syntax feels cryptic.

**Related:** [ANALYZERS.md](./ANALYZERS.md) (what the machines do), [LAB_MINI_PC_SETUP.md](./LAB_MINI_PC_SETUP.md) (ports / IPs), [TANSTACK_START.md — Part A](./TANSTACK_START.md#part-a--machine-data-which-files-to-look-at) (file map), [STAFF_SYNC_CODE_GUIDE.md](./STAFF_SYNC_CODE_GUIDE.md) (NestJS HTTP controllers — different shape, same DI ideas).

---

## Table of contents

0. [Part 0 — What this file is for (read this first)](#part-0--what-this-file-is-for-read-this-first)
1. [Quick answers](#quick-answers)
2. [Part 1 — Cryptic imports (`net`, Nest, protocols)](#part-1--cryptic-imports-net-nest-protocols)
3. [Part 2 — NestJS ideas this file teaches](#part-2--nestjs-ideas-this-file-teaches)
4. [Part 3 — How Nest wires this class in](#part-3--how-nest-wires-this-class-in)
5. [Part 4 — File walkthrough (top to bottom)](#part-4--file-walkthrough-top-to-bottom)
6. [Part 5 — ASTM path vs MLLP / HL7 path](#part-5--astm-path-vs-mllp--hl7-path)
7. [Part 6 — Syntax quirks (`void`, `??`, `Buffer`, events)](#part-6--syntax-quirks-void----buffer-events)
8. [Related docs](#related-docs)

---

## Part 0 — What this file is for (read this first)

### The short answer

When the **edge engine** process starts, this class opens **three TCP servers** on the mini PC (or your Mac):

| Port (default) | Analyzer | Protocol flavor in this file |
| --- | --- | --- |
| **5001** | Sysmex XS-1000i | ASTM over TCP (`astm_e1381`) |
| **5003** | Mindray BS-240 | ASTM over TCP (`astm_e1381`) |
| **5004** | YHLO iFlash 1200 | HL7 over MLLP (`hl7_mllp`) |

Each lab instrument is configured to **connect outbound** to this computer’s IP + that port and **push** result (or query) bytes. This file:

1. Accepts the TCP connection  
2. Speaks the right ACK / framing dialect  
3. Parses the message (via `@drax-lis/protocols`)  
4. Hands a structured payload to `IngestionService.ingest(...)`  
5. Updates “analyzer status” (listening / connected / last success / errors)

It is **not** an HTTP route. Browsers never hit this file. Bench later reads results from SQLite through normal Nest HTTP controllers.

### Mental picture

```
┌─────────────┐         TCP connect to :5001 / :5003 / :5004
│  Analyzer   │ ──────────────────────────────────────────────►
└─────────────┘
                      ┌──────────────────────────────────────┐
                      │  TcpIngestionDriver                  │
                      │  net.createServer → handleAstm/Mllp  │
                      │           ↓                          │
                      │  IngestionService.ingest(...)        │
                      │           ↓                          │
                      │  SQLite + Bench sees rows            │
                      └──────────────────────────────────────┘
```

Compare to [STAFF_SYNC_CODE_GUIDE.md](./STAFF_SYNC_CODE_GUIDE.md): there the “door” is **HTTP** (`@Controller` + `@Post`). Here the “door” is **raw TCP** (`net.createServer`), started in Nest’s **lifecycle hook** `onModuleInit`.

---

## Quick answers

| Question | Answer |
| --- | --- |
| Did we install an npm package named `net`? | **No.** `net` is a **Node.js built-in** module (same family as `fs`, `path`, `http`). |
| Why `import * as net from "net"`? | Imports the whole built-in module as one object so we can call `net.createServer`, use type `net.Socket`, etc. |
| Is this a Nest **controller**? | **No.** It’s a Nest **provider** (service-like class) that opens sockets. |
| When do listeners start? | Automatically when the Nest app finishes loading the `IngestionModule` — `onModuleInit()`. |
| Where do ports come from? | Env vars `SYSMEX_TCP_PORT`, `MINDRAY_TCP_PORT`, `IFLASH_TCP_PORT`, or defaults 5001 / 5003 / 5004. |
| Who parses ASTM/HL7? | Mostly `@drax-lis/protocols` — this file orchestrates I/O and ACKs. |
| Who saves results? | `IngestionService` in `ingestion.service.ts`. |

---

## Part 1 — Cryptic imports (`net`, Nest, protocols)

### Lines 1–6 — NestJS

```ts
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
```

| Symbol | What it is |
| --- | --- |
| `@nestjs/common` | npm package — Nest’s core decorators and types (we **did** install this via the edge-engine `package.json`). |
| `Injectable` | Decorator: “Nest may create this class and inject it / inject into it.” |
| `Logger` | Nest’s structured logger (`this.logger.log(...)`). |
| `OnModuleInit` | Interface: “I have an `onModuleInit()` Nest should call after this module is ready.” |
| `OnModuleDestroy` | Interface: “I have an `onModuleDestroy()` Nest should call on shutdown.” |

You implement those interfaces with real methods; Nest discovers them because the class is a registered **provider**.

### Line 7 — `import * as net from "net"`

```ts
import * as net from "net";
```

**We did not install a package named `net`.**

- Node.js ships networking APIs in the standard library.  
- The module id `"net"` is resolved by Node itself (like `"fs"` or `"path"`).  
- TypeScript types for it come from **`@types/node`** (a **devDependency** in edge-engine), not from an npm package called `net`.

`import * as net` means: “put every export of that module on one object named `net`.” So:

- `net.createServer(...)` — open a TCP server  
- `net.Server` — type of that server  
- `net.Socket` — one connected client (the analyzer)

You could also write named imports in some setups (`import { createServer } from "net"`), but `import * as net` is a common Node style and keeps the namespace obvious: “this is Node’s net API.”

**Not the same as:** `import something from "serialport"` — that *is* an npm package (used by the ProLyte serial driver).

### Lines 8–17 — our protocol package

```ts
import {
  AstmReceiverSession,
  parseE1394,
  unwrapMllp,
  wrapMllp,
  parseOru,
  buildAck,
  parseQry,
  buildOrderResponse,
} from "@drax-lis/protocols";
```

`@drax-lis/protocols` is a **workspace package** in this monorepo (`packages/protocols`). It is *not* Nest and *not* Node built-in. It turns wire bytes into structured lab messages and builds ACKs / order responses.

### Lines 18–20 — sibling services in the same Nest app

```ts
import { IngestionService } from "./ingestion.service";
import { AnalyzerStatusService } from "./analyzer-status.service";
import { HostQueryService } from "./host-query.service";
```

Relative imports (`./...`) = other TypeScript files we wrote. Nest will **inject instances** of these into the constructor (see Part 2).

---

## Part 2 — NestJS ideas this file teaches

### 1. Provider ≠ controller

| Nest concept | Typical job | This file |
| --- | --- | --- |
| **Controller** | HTTP URLs (`@Get`, `@Post`) | Not used here |
| **Provider / `@Injectable()` class** | Business logic, background work, shared services | **This** — TCP listeners |
| **Module** | Lists which providers/controllers exist | `IngestionModule` registers `TcpIngestionDriver` |

Same DI machinery as `SyncService` in the staff-sync guide — different *trigger* (lifecycle + sockets, not HTTP).

### 2. Dependency injection (constructor injection)

```ts
constructor(
  private readonly ingestion: IngestionService,
  private readonly status: AnalyzerStatusService,
  private readonly hostQuery: HostQueryService,
) {}
```

**You never write `new IngestionService(...)` here.** Nest:

1. Sees `TcpIngestionDriver` in the module’s `providers`  
2. Sees the constructor parameter types  
3. Creates (or reuses) those dependencies  
4. Passes them in when constructing `TcpIngestionDriver`

`private readonly ingestion` is TypeScript shorthand: declare a field **and** assign the constructor argument to `this.ingestion` in one step.

### 3. Lifecycle hooks

Nest apps boot roughly like:

1. Load modules  
2. Create providers  
3. Call **`onModuleInit()`** on providers that implement it ← **TCP servers start here**  
4. Start listening for HTTP (edge’s Express/Nest HTTP port — separate from 5001/5003/5004)  
5. On shutdown, call **`onModuleDestroy()`** ← **TCP servers close here**

So this file piggybacks on Nest’s startup/shutdown without needing a `@Cron` or a controller method.

### 4. Decorators are metadata Nest reads

```ts
@Injectable()
export class TcpIngestionDriver implements OnModuleInit, OnModuleDestroy {
```

`@Injectable()` is a **decorator** — a function Nest applies to the class at load time so the DI container knows about it. `implements OnModuleInit` is a TypeScript **contract**: “this class must have `onModuleInit()`.” Nest also recognizes that method by name/interface at runtime.

---

## Part 3 — How Nest wires this class in

From [`ingestion.module.ts`](../apps/edge-engine/src/ingestion/ingestion.module.ts):

```ts
@Module({
  // ...
  providers: [
    IngestionService,
    AnalyzerStatusService,
    HostQueryService,
    TcpIngestionDriver,   // ← Nest constructs this → onModuleInit runs
    SerialIngestionDriver,
  ],
  // ...
})
export class IngestionModule {}
```

`AppModule` imports `IngestionModule`, so when `edge-engine` starts, the TCP driver comes up with the rest of the app. No extra “start TCP” button in the UI.

---

## Part 4 — File walkthrough (top to bottom)

### Config type (lines 22–26)

```ts
type ListenerConfig = {
  analyzerId: string;
  port: number;
  protocol: "astm_e1381" | "hl7_mllp";
};
```

A small TypeScript type for “one listening socket’s settings.” The `|` means protocol must be exactly one of those two string literals.

### Class fields (lines 33–34)

```ts
private readonly logger = new Logger(TcpIngestionDriver.name);
private servers: net.Server[] = [];
```

- `Logger` — Nest logger tagged with the class name.  
- `servers` — keep handles so `onModuleDestroy` can `close()` them.

### `onModuleInit` — open three listeners (lines 42–91)

1. Build an array of three `ListenerConfig`s (Sysmex / Mindray / iFlash).  
2. `Number(process.env.SYSMEX_TCP_PORT ?? 5001)` — use env if set, else default. `??` is nullish coalescing: only fall back if `null`/`undefined`.  
3. For each config, `net.createServer((socket) => { ... })`:
   - Callback runs **per analyzer connection**.  
   - `markConnect` / on `close` → `markDisconnect` / on `error` → `markError`.  
   - Branch: ASTM vs MLLP handlers.  
4. `server.listen(cfg.port, "0.0.0.0", ...)` — bind all network interfaces (so instruments on LAN can connect, not only localhost).  
5. `this.servers.push(server)` — remember for shutdown.

**`0.0.0.0` intuition:** “listen on every IPv4 address this machine has.” Required for lab PCs; `127.0.0.1` would only accept local connections.

### `handleAstm` (lines 93–128)

Used for Sysmex and Mindray.

1. `AstmReceiverSession` — stateful ASTM session machine (ENQ/ACK framing) from protocols package.  
2. On each TCP `data` chunk:
   - Buffer raw bytes for audit/storage.  
   - `session.push(chunk)` → events: `"send"` (write ACK bytes back), `"error"`, or `"message"` (complete logical message).  
3. On `"message"`: join records, `parseE1394(text)`, then `ingestion.ingest(...)`.  
4. On success/failure, update analyzer status.

### `handleMllp` + `processHl7` (lines 131–202)

Used for iFlash.

1. Accumulate bytes; `unwrapMllp` splits complete MLLP frames from a stream.  
2. For each HL7 message string, `processHl7`:
   - Peek `MSH` field 9-ish for message type.  
   - If **QRY** (query): look up orders by barcode via `HostQueryService`, `buildOrderResponse`, `wrapMllp`, write back.  
   - Else treat as **ORU** (results): `parseOru`, send ACK `AA`, `ingestion.ingest(...)`.  
   - On failure: try ACK `AE`, mark error.

### `onModuleDestroy` (lines 204–208)

Close every `net.Server` so ports are released cleanly when Nest shuts down.

---

## Part 5 — ASTM path vs MLLP / HL7 path

| | ASTM (`handleAstm`) | MLLP/HL7 (`handleMllp`) |
| --- | --- | --- |
| Analyzers here | Sysmex, Mindray | iFlash |
| Framing | ASTM control characters / session SM | MLLP (`0x0B` … `0x1C 0x0D`) |
| Session helper | `AstmReceiverSession` | Manual buffer + `unwrapMllp` / `wrapMllp` |
| Result parse | `parseE1394` | `parseOru` |
| Special case | — | **QRY** → host query / order download |

Both paths end at the same place for results: **`IngestionService.ingest`**.

---

## Part 6 — Syntax quirks (`void`, `??`, `Buffer`, events)

### `void this.ingestion.ingest(...).then(...)`

`ingest` returns a **Promise**. Inside a sync `socket.on("data", ...)` callback you often don’t `await` (the listener isn’t `async`). Writing:

```ts
void this.ingestion.ingest(...).then(...).catch(...);
```

means: “fire this async work; I intentionally don’t await it.” The leading `void` tells TypeScript/linters you’re not accidentally ignoring the Promise — you’re handling it with `.then` / `.catch`.

In `processHl7`, the method **is** `async`, so it uses `await` instead.

### `socket.on("data" | "close" | "error", ...)`

Node’s event-emitter style: register callbacks for TCP events. This is **not** Nest decorator syntax — it’s the Node `net.Socket` API.

### `Buffer`

Node’s type for raw binary. Analyzers send bytes, not UTF-16 JS strings. `Buffer.concat`, `Buffer.alloc(0)`, `Buffer.from(remainder)` are normal Node patterns.

### `process.env.X ?? 5001`

Environment variable override for lab installs without editing code. See [LAB_MINI_PC_SETUP.md](./LAB_MINI_PC_SETUP.md).

### Why `private` methods?

`handleAstm`, `handleMllp`, `processHl7` are implementation details. Only Nest needs to call `onModuleInit` / `onModuleDestroy` from outside.

---

## Related docs

| Doc | Why |
| --- | --- |
| Source file | [`tcp-ingestion.driver.ts`](../apps/edge-engine/src/ingestion/tcp-ingestion.driver.ts) |
| Serial cousin (ProLyte) | [`serial-ingestion.driver.ts`](../apps/edge-engine/src/ingestion/serial-ingestion.driver.ts) |
| Persist / match accession | [`ingestion.service.ts`](../apps/edge-engine/src/ingestion/ingestion.service.ts) |
| Nest HTTP DI walkthrough | [STAFF_SYNC_CODE_GUIDE.md](./STAFF_SYNC_CODE_GUIDE.md) |
| Ports & field setup | [LAB_MINI_PC_SETUP.md](./LAB_MINI_PC_SETUP.md) |
| Analyzer product context | [ANALYZERS.md](./ANALYZERS.md) |
| Where web vs edge files live | [TANSTACK_START.md](./TANSTACK_START.md) |
