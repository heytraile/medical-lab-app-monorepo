# Staff sync code — how to read it (plain English)

**Who this is for:** you, when you're staring at NestJS files and the syntax doesn't mean anything yet.

**Related:** [EDGE_AUTH_AND_STAFF.md](./EDGE_AUTH_AND_STAFF.md) (the *why* of edge vs cloud login). This doc is the *how to read the code*.

**Start here if you're lost:** read [Part 0 — Intuitive mental model](#part-0--intuitive-mental-model-read-this-first) first, then [Part 3 — `sync.controller.ts` line by line](#part-3--synccontrollerts-line-by-line).

---

## Table of contents

0. [Part 0 — Intuitive mental model (read this first)](#part-0--intuitive-mental-model-read-this-first)
1. [Quick answers](#quick-answers)
2. [Part 1 — How the cloud API process starts](#part-1--how-the-cloud-api-process-starts)
3. [Part 2 — The HTTP request path](#part-2--the-http-request-path-where-does-sync-events-live)
4. [Part 3 — `sync.controller.ts` line by line](#part-3--synccontrollerts-line-by-line)
5. [Part 4 — Dependency injection (what “Nest injects SyncService” means)](#part-4--dependency-injection-what-nest-injects-syncservice-means)
6. [Part 5 — Modules (how Nest knows SyncService exists)](#part-5--modules-how-nest-knows-syncservice-exists)
7. [Part 6 — After the controller: services and Supabase](#part-6--after-the-controller-services-and-supabase)
8. [Part 7 — Guards, pipes, and other Nest layers (intuition)](#part-7--guards-pipes-and-other-nest-layers-intuition)
9. [Supabase `{ data, error }` syntax](#supabase--data-error--syntax-explained)
10. [createUser vs updateAuthUser](#createuser-vs-updateauthuser--why-different-error-behavior)
11. [Related docs](#related-docs)

---

## Part 0 — Intuitive mental model (read this first)

This section answers: *“What am I supposed to picture in my head when I read a controller?”*

### The short answer for `SyncController`

**Mostly yes:** the controller **listens** for HTTP requests on specific URLs and methods.

**But no:** Nest does **not** automatically figure out which service methods to run. **We wrote a short script** inside each controller method. For staff sync, that script is only **three steps**:

1. Check the sync secret (`assertEdgeSyncToken`) — **not** a method on `SyncService`
2. Validate the JSON body (Zod)
3. Call **one** service method: `this.sync.ingest(parsed)`

Everything after that — staff provisioning, audit logs, Supabase writes for results/specimens/patients — happens **inside** `ingest()` and deeper private methods. **The controller never names those.**

---

### Intuition 1 — Controller = front desk with a checklist

Picture a front desk at a clinic:

| Real world | NestJS |
| --- | --- |
| Someone walks in the door | HTTP request hits the server |
| The door is labeled “Sync / Events / POST only” | `@Controller("sync")` + `@Post("events")` |
| Receptionist checks ID badge | `assertEdgeSyncToken(authorization)` |
| Receptionist checks the form is filled out | `SyncEventsRequestSchema.parse(body)` |
| Receptionist hands the folder to the back office | `this.sync.ingest(parsed)` |
| Back office does the actual work | `SyncService` (+ other services it calls) |

The receptionist **does not** do the lab work. They **do not** list every step the back office will take. They hand off **one** job: “process this sync batch.”

That is exactly what `SyncController.events()` is.

---

### Intuition 2 — The controller does NOT “pull functions from the service”

A common wrong picture:

> *The controller connects to SyncService and somehow knows to call assertEdgeSyncToken, ingest, projectEvent, upsertFromEdge, createUser, …*

**Wrong.** The controller only calls what **you literally typed** in that method:

```typescript
async events(...) {
  assertEdgeSyncToken(authorization);           // step 1 — plain function call
  const parsed = SyncEventsRequestSchema.parse(body);  // step 2 — Zod
  return this.sync.ingest(parsed);              // step 3 — ONE method on SyncService
}
```

There is **no** auto-discovery. Nest does not scan `SyncService` for relevant methods. If you want a fourth step in the controller, **you add a line**.

---

### Intuition 3 — `assertEdgeSyncToken` is NOT “from SyncService”

This trips people up because both names appear in one import:

```typescript
import { SyncService, assertEdgeSyncToken } from "./sync.service";
```

| Name | What it actually is | How the controller uses it |
| --- | --- | --- |
| `SyncService` | A **class** (blueprint for an object) | Injected: `constructor(private readonly sync: SyncService)` → call **`this.sync.ingest(...)`** |
| `assertEdgeSyncToken` | A **standalone function** exported from the **same file** | Called directly: **`assertEdgeSyncToken(authorization)`** — no `this.`, not on the service instance |

They live in the same **file** (`sync.service.ts`) for convenience. They are **not** the same thing.

```typescript
// Bottom of sync.service.ts — OUTSIDE the class
export function assertEdgeSyncToken(authHeader?: string) {
  // checks EDGE_SYNC_TOKEN env var
}
```

You **could** move `assertEdgeSyncToken` to `sync-auth.util.ts` and nothing would change functionally — it's just a helper.

**Wrong mental model:** “Get SyncService and call its assertEdgeSyncToken method.”  
**Right mental model:** “Run this helper function, then call one method on the SyncService instance.”

---

### Intuition 4 — How does the rest of the work happen if the controller only calls `ingest()`?

Because **`ingest()` is the front door to a big room**, not a single task.

Inside `SyncService.ingest()` (simplified):

```
ingest(request)
  │
  ├─ for each event in request.events:
  │     ├─ save event to sync_events table (dedupe)
  │     └─ await this.projectEvent(event.type, event.payload, ...)
  │
  └─ return { ackedEventIds, duplicateEventIds }
```

Inside `projectEvent()` — a **router** by event type:

```
projectEvent(type, payload, ...)
  │
  ├─ if type === "patient.provisional_created"  → upsert patients table
  ├─ if type === "specimen.registered"          → upsert specimens table
  ├─ if type === "result.batch"                 → upsert results table
  ├─ if type === "staff.upsert"                 → this.staffProvisioning.upsertFromEdge(...)
  ├─ if type === "result.submitted_for_release" → update results + audit.log(...)
  └─ ... many more types ...
```

So for **staff sync specifically**, the call chain is:

```
HTTP POST /sync/events
  → SyncController.events()          ← 3 lines you see
  → SyncService.ingest()             ← loops all events in the batch
  → SyncService.projectEvent()       ← private; picks branch by event.type
  → StaffProvisioningService.upsertFromEdge()   ← only when type === "staff.upsert"
  → Supabase createUser / updateUserById / profiles.update
  → AuditService.log()               ← back in projectEvent path after staff upsert
```

**The controller never mentions `projectEvent`, `staffProvisioning`, or `createUser`.** Those are **implementation details inside the service layer** — chosen by the developer who wrote `SyncService`, not by Nest magic.

---

### Intuition 5 — Layers and what each one “knows about”

Think of **knowledge boundaries**:

```
┌─────────────────────────────────────────────────────────────┐
│  CONTROLLER                                                 │
│  Knows: HTTP (body, headers, URL, method)                    │
│  Knows: “Call ingest with validated payload”                │
│  Does NOT know: staff vs results vs specimens               │
└───────────────────────────┬─────────────────────────────────┘
                            │ this.sync.ingest(parsed)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  SYNC SERVICE (orchestrator)                                 │
│  Knows: event types, order, dedupe, ack/duplicate IDs       │
│  Knows: “staff.upsert → staffProvisioning service”          │
│  Does NOT know: Supabase createUser API details             │
└───────────────────────────┬─────────────────────────────────┘
                            │ this.staffProvisioning.upsertFromEdge(...)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  STAFF PROVISIONING SERVICE (specialist)                    │
│  Knows: auth.users + profiles, create vs update, errors     │
│  Does NOT know: HTTP, outbox, other event types             │
└───────────────────────────┬─────────────────────────────────┘
                            │ client.auth.admin.createUser(...)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  SUPABASE CLIENT (external library)                         │
│  Knows: how to talk to Supabase Auth + Postgres REST        │
└─────────────────────────────────────────────────────────────┘
```

**Intuition:** each layer handles **one kind of decision**. Controllers handle **web requests**. Services handle **business rules**. Specialist services handle **one domain** (staff, reports, devices). Supabase handles **storage**.

---

### Intuition 6 — POST vs GET on the same controller

Same “front desk,” different doors:

| Decorator | Door label | Handler calls |
| --- | --- | --- |
| `@Post("events")` | “Submit sync batch” | `this.sync.ingest(parsed)` — full pipeline |
| `@Get("events")` | “Dev peek only” | `this.sync.listMemory()` — different one-liner |

Nest matches **HTTP method + path** to **one method**. The controller doesn't listen generically — each method is its own checklist.

---

### Intuition 7 — What Nest actually automates vs what we write

| Nest automates | We write by hand |
| --- | --- |
| Open port, route POST /sync/events → `events()` | Everything inside `events()` |
| Parse JSON body into `@Body()` | What to do with the body |
| Inject `SyncService` into controller constructor | What methods to call on it |
| Inject dependencies into `SyncService` constructor | Logic inside `ingest`, `projectEvent`, etc. |
| Turn return value into JSON HTTP response | What to return |
| Catch some exceptions → HTTP status codes | When to throw |

Nest is **plumbing**. The **script** is still ours.

---

### Intuition 8 — Two services in one request (staff sync)

When a staff outbox event syncs, **two services** run, but the controller only talks to **one**:

```
SyncController  ──only talks to──▶  SyncService
                                         │
                                         ├── uses AuditService (injected in SyncService ctor)
                                         └── uses StaffProvisioningService (injected in SyncService ctor)
```

The controller **never** injects `StaffProvisioningService`. `SyncService` already has it — because **`sync.module.ts` imported `LabStaffModule`** and Nest wired it into `SyncService`'s constructor.

That's how “missing” dependencies appear without being in the controller: **services inject other services**, not the controller listing everything.

---

### Quick self-check — read `sync.controller.ts` and ask:

1. **What URL + method triggers this?** → `POST /sync/events`
2. **What runs before business logic?** → token check + Zod parse (in the controller)
3. **What is the single handoff to the back office?** → `this.sync.ingest(parsed)`
4. **Where does staff Supabase work happen?** → deep inside `SyncService` → `StaffProvisioningService` — **not in the controller**
5. **Is assertEdgeSyncToken part of SyncService?** → **No** — same file, standalone function

If those five make sense, you have the right intuition.

---

### Intuition 9 — Constructor `sync: SyncService` — types AND instances (not either/or)

When you see:

```typescript
constructor(private readonly sync: SyncService) {}
```

| What you might think | What's actually true |
| --- | --- |
| “`SyncService` is only a type like `interface`” | It's a **class** — at runtime it's the blueprint Nest uses to `new SyncService()`. In TypeScript, the class name **also** means “instance of this class” when used after `:`. |
| “This line creates the SyncService” | **Nest** creates it. This line **receives** it and stores it as `this.sync`. |
| “`this.sync` is the class” | **`this.sync` is one live object** (instance). The class is `SyncService`; the instance is what you call `.ingest()` on. |

**Your intuition is correct:** `this.sync` works because the constructor (with `private readonly sync`) saved the injected **instance** on the controller object. Full breakdown: [Line 7 — constructor](#line-7--constructorprivate-readonly-sync-syncservice-).

---

## Quick answers

| Question | Answer |
| --- | --- |
| Is this NestJS? | **Yes.** The cloud backend is `apps/api`. It uses [NestJS](https://nestjs.com) on top of Node.js + Express. |
| Where does the server listen? | **`http://localhost:3102`** by default (`API_PORT` in env). See `apps/api/src/main.ts`. |
| What is the full URL for staff sync? | **`POST http://localhost:3102/sync/events`** — not relative to a file path; relative to the **host + port** of the running server. |
| Is `createUser` our code? | **No.** Supabase's npm package (`@supabase/supabase-js`). We call it. |
| Is `SyncController` our code? | **Yes.** `apps/api/src/sync/sync.controller.ts`. |
| Is `SyncService` our code? | **Yes.** `apps/api/src/sync/sync.service.ts` — **different file** from the controller, same folder. |
| Is `updateAuthUser` our code? | **Yes.** Private helper inside `staff-provisioning.service.ts`. |
| Does Supabase always return an `error` object? | It returns `{ data, error }`. On success **`error` is `null`**. On failure **`error` is populated**. |

---

## File map (every file in the staff sync chain)

| File | App | Who wrote it | What it does |
| --- | --- | --- | --- |
| `apps/api/src/main.ts` | Cloud API | Us | Starts Nest, listens on port 3102 |
| `apps/api/src/app.module.ts` | Cloud API | Us | Root module — imports `SyncModule` |
| `apps/api/src/sync/sync.module.ts` | Cloud API | Us | Registers `SyncController` + `SyncService` |
| `apps/api/src/sync/sync.controller.ts` | Cloud API | Us | HTTP: `POST /sync/events` |
| `apps/api/src/sync/sync.service.ts` | Cloud API | Us | `ingest()` — routes `staff.upsert` |
| `apps/api/src/lab-staff/lab-staff.module.ts` | Cloud API | Us | Registers `StaffProvisioningService` |
| `apps/api/src/lab-staff/staff-provisioning.service.ts` | Cloud API | Us | Supabase create/update user + profile |
| `apps/edge-engine/src/staff/staff.service.ts` | Edge | Us | Creates staff in SQLite, queues outbox |
| `apps/edge-engine/src/sync/sync.service.ts` | Edge | Us | `fetch(cloudUrl + '/sync/events')` |
| `packages/contracts/src/schemas.ts` | Shared | Us | `StaffUpsertEventPayload`, `SyncEventsRequestSchema` |
| `@nestjs/common`, `@nestjs/core` | npm | NestJS | Decorators, `NestFactory`, DI |
| `@supabase/supabase-js` | npm | Supabase | `createUser`, `from("profiles")`, etc. |

There are **two NestJS apps**: `apps/edge-engine` (lab PC) and `apps/api` (cloud). Same framework, separate processes, separate ports (edge **3101**, cloud **3102**).

---

## Part 1 — How the cloud API process starts

When you run `pnpm dev:local`, the **cloud API** is a Node process. It does not serve files from a folder like a static website. It **starts a program** that opens a TCP port and waits for HTTP requests.

### Step 1: `main.ts` — entry point

**File:** `apps/api/src/main.ts`  
**Who wrote it:** us  
**Runs when:** the `@drax-lis/api` package starts (`nest start` / `node dist/main.js`)

```typescript
import { NestFactory } from "@nestjs/core";   // from npm package @nestjs/core
import { AppModule } from "./app.module";     // OUR file — one folder over

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 3102);
  await app.listen(port);
  console.log(`[api] listening on http://localhost:${port}`);
}

bootstrap();
```

**What each piece means:**

| Line | Meaning |
| --- | --- |
| `NestFactory.create(AppModule)` | Build the whole Nest application from the root module `AppModule`. Nest reads all modules, controllers, and services and wires them together. |
| `{ cors: true }` | Allow browsers on other origins (e.g. `localhost:3100`) to call this API. |
| `app.listen(port)` | Open an HTTP server on that port. Default **3102**. |
| `bootstrap()` | Call the async startup function. |

After this runs, anything that hits `http://localhost:3102/...` goes into Nest's routing system.

### Step 2: `app.module.ts` — root wiring

**File:** `apps/api/src/app.module.ts`

```typescript
@Module({
  imports: [
    HealthModule,
    SupabaseModule,
    AuthModule,
    AuditModule,
    SyncModule,        // ← staff sync lives inside here
    ResultsModule,
    // ...
  ],
})
export class AppModule {}
```

`AppModule` does not define routes itself. It **imports** feature modules. `SyncModule` is where `SyncController` and `SyncService` get registered.

---

## Part 2 — The HTTP request path (where does `/sync/events` live?)

### Full URL — not “relative to a file”

When the doc says `@Controller("sync")` has base path `/sync`, that means:

**Relative to the running server's origin** — host + port — **not** relative to a folder on disk.

| Piece | Value (local dev) |
| --- | --- |
| Protocol | `http` |
| Host | `localhost` (or the mini PC's IP in production) |
| Port | `3102` (from `API_PORT` / `main.ts`) |
| Controller prefix | `/sync` (from `@Controller("sync")`) |
| Method path | `/events` (from `@Post("events")`) |
| **Full URL** | **`http://localhost:3102/sync/events`** |

There is **no** global prefix like `/api` in our `main.ts`. If we added `app.setGlobalPrefix('api')`, the URL would become `http://localhost:3102/api/sync/events`. We did **not** do that.

### Who calls this URL?

The **edge** (lab PC) outbox worker. **File:** `apps/edge-engine/src/sync/sync.service.ts`

```typescript
const cloudUrl = process.env.CLOUD_API_URL ?? "http://localhost:3102";

const res = await fetch(`${cloudUrl}/sync/events`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.EDGE_SYNC_TOKEN}`,  // when set
  },
  body: JSON.stringify({ edgeNodeId, events: [...] }),
});
```

So: edge builds the same URL — **cloud host + `/sync/events`**.

### What happens when that POST arrives (order of operations)

```
1. TCP connection to localhost:3102
2. Express (under Nest) receives HTTP POST /sync/events
3. Nest router: "which controller method handles this?"
   → SyncController.events()  (because @Controller("sync") + @Post("events"))
4. Nest builds the arguments for events():
   → @Body()        → parse JSON body into `body`
   → @Headers(...)  → read Authorization header into `authorization`
5. Your method code runs:
   → assertEdgeSyncToken(authorization)
   → SyncEventsRequestSchema.parse(body)
   → this.sync.ingest(parsed)
6. Return value from ingest() → Nest serializes to JSON → HTTP response body
```

---

## Part 3 — `sync.controller.ts` line by line

**File:** `apps/api/src/sync/sync.controller.ts`  
**Full file (it's short):**

```typescript
import { Body, Controller, Get, Headers, Post } from "@nestjs/common";
import { SyncService, assertEdgeSyncToken } from "./sync.service";
import { SyncEventsRequestSchema } from "@drax-lis/contracts";

@Controller("sync")
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post("events")
  async events(
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
  ) {
    assertEdgeSyncToken(authorization);
    const parsed = SyncEventsRequestSchema.parse(body);
    return this.sync.ingest(parsed);
  }

  @Get("events")
  list() {
    return this.sync.listMemory();
  }
}
```

### Line 1 — imports

```typescript
import { Body, Controller, Get, Headers, Post } from "@nestjs/common";
```

| Import | From | What it is |
| --- | --- | --- |
| `Body`, `Controller`, `Get`, `Headers`, `Post` | npm package **`@nestjs/common`** | **Decorators** — special functions Nest reads at startup to register routes and bind request data |
| Not from our codebase | NestJS library | Same as importing `useState` from React — it's framework code |

```typescript
import { SyncService, assertEdgeSyncToken } from "./sync.service";
```

| Import | From | What it is |
| --- | --- | --- |
| `SyncService` | **`./sync.service.ts`** — the **class** | Injected into constructor → use as **`this.sync.ingest(...)`** |
| `assertEdgeSyncToken` | **Same file**, but a **standalone function** — **not** a method on `SyncService` | Called as **`assertEdgeSyncToken(authorization)`** — no `this.sync.` |

The `./` means **relative to this file's directory**: `apps/api/src/sync/`.

```typescript
import { SyncEventsRequestSchema } from "@drax-lis/contracts";
```

| Import | From | What it is |
| --- | --- | --- |
| `SyncEventsRequestSchema` | monorepo package **`packages/contracts`** | **Zod** schema — validates JSON shape. **Our code**, shared with edge. |

---

### Line 5 — `@Controller("sync")`

```typescript
@Controller("sync")
export class SyncController {
```

**Syntax:**

- `@Controller(...)` — a **decorator**. In TypeScript, `@Something` on the line above a class/function tells a framework to attach metadata.
- `"sync"` — the **path prefix** for every route in this class.

**Effect at runtime (when Nest starts):**

Nest registers this class and says: *all routes inside `SyncController` start with `/sync`*.

**This is not a file path.** It is an **HTTP URL path segment** on the server that is listening on port 3102.

---

### Line 6 — `export class SyncController`

```typescript
export class SyncController {
```

- `class` — defines a TypeScript/JavaScript class ( blueprint for an object ).
- `export` — other files can `import { SyncController } from ...` (the module needs it).
- Nest **instantiates** this class once (singleton by default) when the server starts.

---

### Line 7 — `constructor(private readonly sync: SyncService) {}`

This one line does **three** things. That is why it looks cryptic.

#### Thing 1 — TypeScript constructor parameter property

```typescript
constructor(private readonly sync: SyncService) {}
```

Is **shorthand** for:

```typescript
private readonly sync: SyncService;

constructor(sync: SyncService) {
  this.sync = sync;
}
```

So after construction, **`this.sync`** is available in every method on the class (e.g. `this.sync.ingest(...)` on line 16).

- `private` — only methods inside this class can use `this.sync`.
- `readonly` — you cannot reassign `this.sync` later.

#### Thing 2 — `: SyncService` — type annotation AND “must be an instance of this class”

This is the part that feels like “types vs instances.” **Both are true at once** — TypeScript uses one syntax for two jobs.

```typescript
constructor(private readonly sync: SyncService) {}
//                            ^^^^  ^^^^^^^^^^^
//                            |     └── TYPE ANNOTATION (compile-time only — erased when JavaScript runs)
//                            └── PROPERTY NAME (runtime — the actual variable on `this`)
```

##### In TypeScript, a class name is **two things**

| | `SyncService` the **class** | `SyncService` used after `:` as a **type** |
| --- | --- | --- |
| **When it exists** | Runtime (JavaScript) | Compile-time only (TypeScript checker) |
| **What it is** | Blueprint / constructor function | “Anything that is an **instance** of that class” |
| **Analogy** | Cookie cutter | Label on the bag: “must be a cookie made from this cutter” |

So when you write `sync: SyncService`, you are **not** saying “sync is the class itself.” You are saying:

> **`sync` is a variable that will hold one live object built from the `SyncService` class.**

That is the same meaning as `interface` or `type` in other places — except here the type **is** a class, and TypeScript knows “instance of `SyncService`” means “object that has `.ingest()`, `.listMemory()`, etc.”

##### Compile-time vs runtime (important intuition)

```typescript
constructor(private readonly sync: SyncService) {}
```

| Layer | What happens |
| --- | --- |
| **TypeScript (editor / `tsc`)** | Reads `: SyncService`. If you call `this.sync.ingest`, it checks that method exists. If you pass a string into the constructor, **red squiggle** — wrong type. |
| **JavaScript at runtime (Nest running)** | `: SyncService` **disappears** — types are not in the running program. What actually happens: Nest calls `new SyncController(someObject)` where `someObject` **is** a real `SyncService` instance sitting in memory. |

So in a Nest controller constructor:

- **Do think:** “I am receiving a **live object** (instance) that Nest already built.”
- **Also think:** “`: SyncService` is TypeScript’s label so `this.sync` gets autocomplete and type checking.”
- **Do not think:** “`: SyncService` creates the object” — **Nest** creates it and **passes** it in.

##### Breaking the line into pieces

```typescript
constructor(private readonly sync: SyncService) {}
```

| Piece | Role |
| --- | --- |
| `constructor(...)` | Special method run **once** when `new SyncController(...)` happens |
| `private` | Create `this.sync` — only usable inside this class |
| `readonly` | After assignment, cannot do `this.sync = somethingElse` |
| `sync` | **Your chosen name** for the property and parameter (could have been `syncService` or `svc`) |
| `: SyncService` | TypeScript: “parameter / property must be a **SyncService instance**” |
| `SyncService` (after colon) | The **class** imported from `./sync.service` — used here as the **instance type** |

Nothing magic about the name `sync`. We could write:

```typescript
constructor(private readonly syncService: SyncService) {}
// ...
return this.syncService.ingest(parsed);
```

Same meaning — `sync` is just shorter.

##### Why `this.sync` works — yes, your intuition is correct

Because of the **`private readonly sync` in the constructor**, TypeScript automatically creates a property on **`this`** (the current `SyncController` instance) and assigns whatever Nest passed in.

Expanded form:

```typescript
export class SyncController {
  private readonly sync: SyncService;   // 1. declare property on the controller object

  constructor(sync: SyncService) {      // 2. parameter = object Nest passes in
    this.sync = sync;                   // 3. store it on this controller
  }

  async events(...) {
    return this.sync.ingest(parsed);    // 4. use the stored instance
  }
}
```

| Expression | Meaning |
| --- | --- |
| `this` | The current **`SyncController` object** handling this request |
| `this.sync` | The **`SyncService` instance** Nest attached to this controller when it was created |
| `this.sync.ingest(parsed)` | Call **`ingest`** on that service object |

So yes: **`this.sync` is the SyncService instance** you wired up in the constructor. Every method on `SyncController` can use `this.sync` because it lives on the same object.

##### Nest’s role vs the constructor’s role

| Who | Does what |
| --- | --- |
| **Nest** | At server startup: `new SyncService(...)`, then `new SyncController(thatSyncServiceInstance)` |
| **Constructor** | Receives the instance and saves it as `this.sync` |
| **Your handler** | Uses `this.sync` — does not create `SyncService` again |

One `SyncController` and one `SyncService` instance (by default) live for the whole time the server is running. Every `POST /sync/events` hits the **same** `this.sync` object.

##### Quick rule when reading Nest constructors

When you see:

```typescript
constructor(private readonly something: SomeClass) {}
```

Read it as:

> “When Nest builds this controller, it will **hand me an instance** of `SomeClass`. Store it on **`this.something**. I’ll use that instance in my methods.”

The `: SomeClass` part is TypeScript’s **type label** for that instance — not a separate “interface type” unless `SomeClass` were an interface. Here it’s a **class**, which in TypeScript doubles as the type of its instances.

`SyncService` is imported from `./sync.service` — file **`apps/api/src/sync/sync.service.ts`**.

#### Thing 3 — Nest dependency injection

You **never** write:

```typescript
const controller = new SyncController(new SyncService(...));  // WE DON'T DO THIS
```

Nest's **DI container** (built at startup from all `@Module` definitions):

1. Sees `SyncController` needs `SyncService` in its constructor.
2. Looks up how to build `SyncService` (also needs `SupabaseService`, `AuditService`, `StaffProvisioningService`, …).
3. Builds those dependencies first (one shared instance each, by default).
4. Calls `new SyncController(syncServiceInstance)`.

**“Nest injects SyncService”** = *Nest creates `SyncService` for you and passes it into the constructor so `this.sync` is ready.*

See [Part 4](#part-4--dependency-injection-what-nest-injects-syncservice-means) and [Part 5](#part-5--modules-how-nest-knows-syncservice-exists) for the module chain.

---

### Lines 9–17 — `@Post("events")` and the handler method

```typescript
  @Post("events")
  async events(
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
  ) {
```

#### `@Post("events")`

| Piece | Meaning |
| --- | --- |
| `@Post` | HTTP method **POST** (create/submit data — not GET/read). From `@nestjs/common`. |
| `"events"` | Path **after** the controller prefix → `/sync` + `/events` = **`/sync/events`** |

Nest maps this method to: **`POST /sync/events`**.

#### `async events(...)`

- `async` — this function returns a Promise; Nest can `await` it before sending the HTTP response.
- `events` — method name. Could be anything; the URL comes from decorators, not the method name.

#### `@Body() body: unknown`

| Piece | Meaning |
| --- | --- |
| `@Body()` | Parameter decorator. Nest takes the **HTTP request body** (JSON), parses it, passes it as `body`. |
| `body` | Variable name we chose. |
| `: unknown` | TypeScript: we don't trust the shape yet — validation comes next. |

Equivalent in plain HTTP terms: whatever JSON the edge sent in `fetch(..., { body: JSON.stringify(...) })`.

#### `@Headers("authorization") authorization?: string`

| Piece | Meaning |
| --- | --- |
| `@Headers("authorization")` | Read the HTTP header named `authorization` (case-insensitive). |
| `authorization?` | Optional — might be missing. |
| `: string` | TypeScript type. |

The edge sends: `Authorization: Bearer <EDGE_SYNC_TOKEN>`.

---

### Lines 14–16 — method body

```typescript
    assertEdgeSyncToken(authorization);
```

**Our function** in `sync.service.ts`:

```typescript
export function assertEdgeSyncToken(authHeader?: string) {
  const expected = process.env.EDGE_SYNC_TOKEN;
  if (!expected) return; // local demo: token not set → allow
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
  if (!token || token !== expected) {
    throw new UnauthorizedException("Invalid or missing EDGE_SYNC_TOKEN");
  }
}
```

- Strips `Bearer ` prefix from the header.
- Compares to env var.
- **`throw new UnauthorizedException`** — Nest catches this and sends **HTTP 401** to the client.

This is **not** a Guard — it's a manual check inside the method. Same idea, different mechanism.

```typescript
    const parsed = SyncEventsRequestSchema.parse(body);
```

- **Zod** (via our contracts package): validate `body` has `{ edgeNodeId, events: [...] }`.
- If invalid → Zod **throws** → Nest typically responds **500** unless you add an exception filter.

```typescript
    return this.sync.ingest(parsed);
```

- **`this.sync`** — the `SyncService` instance from the constructor.
- **`ingest`** — method on `SyncService` in `sync.service.ts` (~1700 lines).
- **`return`** — Nest takes the return value, JSON-stringifies it, sends as HTTP response body with status **200** (unless ingest throws).

---

### Lines 19–23 — `@Get("events")`

```typescript
  @Get("events")
  list() {
    return this.sync.listMemory();
  }
```

Second route on the **same** controller:

| | POST handler | GET handler |
| --- | --- | --- |
| Decorator | `@Post("events")` | `@Get("events")` |
| URL | `POST /sync/events` | `GET /sync/events` |
| Purpose | Edge pushes outbox events | Local dev peek at in-memory store |

Same path, **different HTTP method** — that's legal and common in REST APIs.

---

## Part 4 — Dependency injection (what “Nest injects SyncService” means)

### Without injection (we don't do this)

```typescript
// Hypothetical manual wiring — NOT how Nest works in our app
const supabase = new SupabaseService();
const audit = new AuditService(supabase);
const staffProvisioning = new StaffProvisioningService(supabase);
const sync = new SyncService(supabase, audit, staffProvisioning);
const controller = new SyncController(sync);
```

You'd have to know every dependency of every class and construct the tree by hand.

### With Nest injection (what we do)

1. You mark classes `@Injectable()`.
2. You list them in a module's `providers: [...]`.
3. You list controllers in `controllers: [...]`.
4. At startup, Nest builds a **registry** and creates instances, passing dependencies into constructors automatically.

### Chain for staff sync specifically

```
SyncController
  needs → SyncService          (constructor arg: sync: SyncService)

SyncService
  needs → SupabaseService      (constructor arg: supabase)
  needs → AuditService         (constructor arg: audit)
  needs → StaffProvisioningService   (constructor arg: staffProvisioning)

StaffProvisioningService
  needs → SupabaseService
```

When `POST /sync/events` runs:

```typescript
// Inside SyncController.events():
return this.sync.ingest(parsed);

// Inside SyncService.ingest() → eventually for staff.upsert:
await this.staffProvisioning.upsertFromEdge(staffPayload);

// Inside StaffProvisioningService:
await client.auth.admin.createUser({ ... });
```

Each `this.` is a dependency Nest already wired in via constructors.

---

## Part 5 — Modules (how Nest knows `SyncService` exists)

**File:** `apps/api/src/sync/sync.module.ts`

```typescript
@Module({
  imports: [AuthModule, AuditModule, LabStaffModule, DevicesModule],
  controllers: [SyncController, CloudReadController, DeviceEnrollmentCodesController],
  providers: [SyncService, ReportsService, MailService],
  exports: [SyncService, ReportsService],
})
export class SyncModule {}
```

| Key | Meaning |
| --- | --- |
| `controllers: [SyncController, ...]` | Nest: register these classes as HTTP handlers. |
| `providers: [SyncService, ...]` | Nest: create these classes and allow injection. **`SyncService` lives here.** |
| `imports: [LabStaffModule, ...]` | Pull in other modules' **exported** providers. |
| `exports: [SyncService, ...]` | Other modules that import `SyncModule` can inject `SyncService`. |

**Why `LabStaffModule` matters for staff sync:**

`StaffProvisioningService` is defined in `lab-staff.module.ts`:

```typescript
@Module({
  providers: [LabStaffService, StaffProvisioningService],
  exports: [StaffProvisioningService],   // ← exported so SyncModule can use it
})
export class LabStaffModule {}
```

`SyncModule` imports `LabStaffModule` → `SyncService` can inject `StaffProvisioningService`.

If you forgot to import `LabStaffModule`, the app would **fail at startup** with a Nest error like *“Nest can't resolve dependencies of SyncService”*.

### Wiring diagram

```
main.ts
  └── NestFactory.create(AppModule)
        └── AppModule.imports
              └── SyncModule
                    ├── controllers: SyncController  →  POST /sync/events
                    ├── providers: SyncService
                    └── imports: LabStaffModule
                          └── exports: StaffProvisioningService
```

---

## Part 6 — After the controller: services and Supabase

### Where `SyncService` lives

**File:** `apps/api/src/sync/sync.service.ts`  
**Same folder as the controller**, different file.

Top of the class:

```typescript
@Injectable()
export class SyncService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly audit: AuditService,
    private readonly staffProvisioning: StaffProvisioningService,
  ) {}
```

Staff branch (~line 803):

```typescript
if (type === "staff.upsert") {
  const staffPayload = payload as unknown as StaffUpsertEventPayload;
  await this.staffProvisioning.upsertFromEdge(staffPayload);
  await this.audit.log({ eventType: "staff.updated", ... });
  return;
}
```

### Where `StaffProvisioningService` lives

**File:** `apps/api/src/lab-staff/staff-provisioning.service.ts`

Full annotated file is below in this doc (createUser, `updateAuthUser`, profiles.update).

### End-to-end flow (compact) — the full call chain

The controller only appears at the top. Everything below is **inside services** — the controller never calls these by name.

```
HTTP POST /sync/events
  │
  ▼
SyncController.events()
  │  assertEdgeSyncToken()          ← standalone function (same file as SyncService, not a class method)
  │  SyncEventsRequestSchema.parse()
  │  this.sync.ingest(parsed)       ← ONLY service method the controller calls
  ▼
SyncService.ingest()
  │  for each event in batch:
  │    save to sync_events
  │    await this.projectEvent(type, payload, ...)   ← private router inside SyncService
  ▼
SyncService.projectEvent()          ← when type === "staff.upsert":
  │  await this.staffProvisioning.upsertFromEdge(payload)
  │  await this.audit.log({ eventType: "staff.updated", ... })
  ▼
StaffProvisioningService.upsertFromEdge()
  │  auth.admin.createUser / updateUserById
  │  from("profiles").update(...)
  ▼
Supabase
```

**Edge side (what triggers the HTTP call):**

```
apps/edge-engine/src/staff/staff.service.ts     → enqueue staff.upsert
apps/edge-engine/src/sync/sync.service.ts       → fetch POST .../sync/events
```

---

## Part 7 — Guards, pipes, and other Nest layers (intuition)

### Layer cheat sheet — how to think about each piece

| Layer | Intuition | Analogy |
| --- | --- | --- |
| **Module** | Wiring diagram — “these pieces belong together” | Building floor plan |
| **Controller** | HTTP listener + short checklist, then hand off | Front desk receptionist |
| **Service** | Where the real work and routing happens | Back office / operations |
| **Guard** | Bouncer before the handler runs | Security at the door (before receptionist) |
| **Pipe / Zod** | “Is this input valid shape?” | Check the form is filled out correctly |
| **Injectable / DI** | Nest builds objects and passes them into constructors | HR assigns you a desk with tools already on it |

**Controllers should stay thin.** If you find yourself writing Supabase calls or big `if (type === ...)` blocks in a controller, that logic probably belongs in a service (like we do with `projectEvent`).

### Service (`*.service.ts`)

Business logic. `@Injectable()`. Listed in module `providers`.

### Guard (`*.guard.ts`)

Runs **before** the controller method. Returns `true` (allow) or throws (deny).

Example — release results:

```typescript
@Controller("results")
@UseGuards(SupabaseAuthGuard, LabDeviceGuard)
export class ResultsController {
  @Post("release-accession")
  @Roles("authorizer", "admin")
  async releaseAccession(@CurrentUser() user: AuthUser, ...) { ... }
}
```

**Staff sync does NOT use `@UseGuards` on `SyncController`.** It uses `assertEdgeSyncToken()` inside the method instead — machine-to-machine secret, not a human JWT.

### Pipe

Transforms/validates input. We often use **Zod** directly (`SyncEventsRequestSchema.parse(body)`) instead of Nest's built-in `ValidationPipe`.

### Custom parameter decorators

`@CurrentUser()` — reads `req.user` that `SupabaseAuthGuard` set. Defined in `auth.guard.ts`.

---

## The full provisioning file (ours)

**File:** `apps/api/src/lab-staff/staff-provisioning.service.ts`

```typescript
import { Injectable, Logger } from "@nestjs/common";
import { DRAX_HALL_LAB } from "@drax-lis/catalog";
import type { StaffUpsertEventPayload } from "@drax-lis/contracts";
import { SupabaseService } from "../supabase/supabase.module";

@Injectable()
export class StaffProvisioningService {
  private readonly logger = new Logger(StaffProvisioningService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async upsertFromEdge(payload: StaffUpsertEventPayload): Promise<void> {
    if (!this.supabase.enabled || !this.supabase.client) {
      this.logger.debug(`staff.upsert (memory skip): ${payload.email} role=${payload.role}`);
      return;
    }

    const client = this.supabase.client;

    const { data: existing } = await client.auth.admin.getUserById(payload.staffId);

    if (!existing?.user) {
      const { error } = await client.auth.admin.createUser({
        id: payload.staffId,
        email: payload.email,
        password: payload.password,
        email_confirm: true,
        user_metadata: {
          role: payload.role,
          full_name: payload.fullName,
          job_title: payload.jobTitle,
        },
      });
      if (error) {
        this.logger.warn(
          `auth.admin.createUser failed for ${payload.email}: ${error.message} — retrying as update`,
        );
        await this.updateAuthUser(payload);
      }
    } else if (payload.password) {
      await this.updateAuthUser(payload);
    }

    const { error: profileError } = await client
      .from("profiles")
      .update({
        email: payload.email,
        full_name: payload.fullName,
        role: payload.role,
        job_title: payload.jobTitle,
        is_active: payload.isActive,
        cloud_login_allowed: payload.cloudLoginAllowed,
        lab_id: DRAX_HALL_LAB.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payload.staffId);

    if (profileError) {
      this.logger.error(
        `profiles update failed for ${payload.staffId}: ${profileError.message}`,
      );
      throw profileError;
    }
  }

  private async updateAuthUser(payload: StaffUpsertEventPayload) {
    if (!this.supabase.client) return;

    const { error } = await this.supabase.client.auth.admin.updateUserById(
      payload.staffId,
      {
        email: payload.email,
        ...(payload.password ? { password: payload.password } : {}),
        user_metadata: {
          role: payload.role,
          full_name: payload.fullName,
          job_title: payload.jobTitle,
        },
      },
    );

    if (error) {
      this.logger.error(
        `auth.admin.updateUserById failed for ${payload.email}: ${error.message}`,
      );
      throw error;
    }
  }
}
```

**`updateAuthUser`** is our private method. It wraps Supabase's **`auth.admin.updateUserById`**. It is called from two places in `upsertFromEdge`:

1. When `createUser` fails (soft recovery).
2. When user already exists and payload includes a new `password`.

---

## Supabase `{ data, error }` — syntax explained

Every Supabase client call returns **one object** with two keys. It does **not** throw on failure (unless you use a wrapper that throws).

```typescript
const result = await client.auth.admin.createUser({ ... });

// result looks like:
// SUCCESS:  { data: { user: { id: "...", email: "..." } }, error: null }
// FAILURE:  { data: { user: null }, error: { message: "...", status: 422, ... } }
```

### Destructuring — what `const { error } = ...` means

```typescript
const { error } = await client.auth.admin.createUser({ ... });
```

Same as:

```typescript
const response = await client.auth.admin.createUser({ ... });
const error = response.error;
// response.data is still there — we just didn't assign it to a variable
```

### Renaming while destructuring

```typescript
const { data: existing } = await client.auth.admin.getUserById(id);
```

Same as:

```typescript
const response = await client.auth.admin.getUserById(id);
const existing = response.data;
```

### Checking failure

```typescript
if (error) {
  // error is NOT null → the call failed
}
```

On success, `error` is **`null`**, which is falsy — the `if` block is skipped.

---

## createUser vs updateAuthUser — why different error behavior?

This is the part that was confusing before. Here it is side by side.

| | **`createUser` failure** | **`updateAuthUser` failure** |
| --- | --- | --- |
| **What we do** | Log warning → call `updateAuthUser` | Log error → **`throw error`** |
| **Why** | "User already exists" is OK — we wanted them to exist anyway | If update fails, something is actually wrong — password/metadata didn't apply |
| **What "idempotent" means here** | Running sync twice for the same person ends with the **same correct state**, even if the first attempt already created the user | N/A |

**Idempotent** (plain English): *do it again, get the same result, no duplicate mess.*

Example race:

1. Edge sends `staff.upsert` for Jane.
2. Sync runs twice (retry).
3. First run: `createUser` succeeds.
4. Second run: `getUserById` finds Jane **OR** `createUser` returns error "already exists".
5. Either way, code ends up calling `updateAuthUser` + `profiles.update` → Jane's row is correct.

So:

- **`createUser` error** → soft landing (try update).
- **`updateAuthUser` error** → hard stop (throw).
- **`profiles.update` error** → hard stop (throw).

---

## What each Supabase call touches

| Call | Supabase API? | Database table / system |
| --- | --- | --- |
| `auth.admin.getUserById` | Yes | `auth.users` (internal Auth schema) |
| `auth.admin.createUser` | Yes | Creates `auth.users` row; trigger may insert `profiles` |
| `auth.admin.updateUserById` | Yes | Updates `auth.users` (email, password, metadata) |
| `from("profiles").update(...)` | Yes (PostgREST) | `public.profiles` — role, name, `cloud_login_allowed` |

**`updateAuthUser`** is just our name for a wrapper around **`auth.admin.updateUserById`**. It lives at the bottom of the same file.

---

## Payload shape (what edge sends)

From `packages/contracts/src/schemas.ts` (our code):

```typescript
{
  staffId: "uuid-from-edge",
  email: "tech@draxhall.local",
  fullName: "Marlon Reid",
  role: "tech" | "authorizer" | "admin",
  jobTitle: "phlebotomist" | ... | null,
  isActive: true,
  cloudLoginAllowed: false,   // true only for admin/authorizer
  password?: "..."            // only on create or password change — sent once over HTTPS
}
```

Edge sets `cloudLoginAllowed` from role in `apps/edge-engine/src/staff/staff.service.ts`:

```typescript
export function cloudLoginAllowedFor(role: StaffRole): boolean {
  return role === "admin" || role === "authorizer";
}
```

---

## What happens after profiles are updated

- **Tech** (`cloud_login_allowed: false`): row exists in Auth + profiles, but Supabase Auth Hook **refuses to give them a login token**. They use the lab PC only.
- **Admin/authorizer** (`cloud_login_allowed: true`): can sign into cloud (plus device enrollment in production).

See [EDGE_AUTH_AND_STAFF.md](./EDGE_AUTH_AND_STAFF.md) for that part.

---

## How to read any other file in `apps/api`

1. Start at **`*.controller.ts`** — find the HTTP route.
2. Look for **`@UseGuards`** — what's required before the handler runs?
3. Follow the call into **`*.service.ts`** — that's the logic.
4. If you see **`this.supabase.client`**, you're in Supabase territory — expect `{ data, error }`.
5. If you see **`throw new UnauthorizedException`**, that's **NestJS** converting a failure into an HTTP 401 response.
6. Types like `StaffUpsertEventPayload` usually live in **`packages/contracts`**.

---

## Gotchas (worth knowing)

1. **`getUserById` ignores errors** — if Supabase is down, `existing` might be empty and we'll try `createUser` anyway.
2. **`profiles.update` with zero rows** can return `{ error: null }` even if no profile row matched — rare if triggers work.
3. **Staff sync uses `EDGE_SYNC_TOKEN`**, not `SupabaseAuthGuard` — different trust model from release/sign-off routes.

---

## Related docs

- [EDGE_AUTH_AND_STAFF.md](./EDGE_AUTH_AND_STAFF.md) — edge vs cloud login, Auth Hook, devices
- [ARCHITECTURE.md](./ARCHITECTURE.md) — edge + cloud big picture
- [SYNC.md](./SYNC.md) — outbox and sync events
