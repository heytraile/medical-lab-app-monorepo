# Clinical audit trail

Append-only audit events for who did what, when, on clinical data. Supports regulatory expectations (WORM-style immutability) and internal investigations.

---

## Event stores

| Store | Location | Written by |
| --- | --- | --- |
| **Cloud audit** | Supabase `clinical_audit_log` | Cloud Nest API (`apps/api`) via service role |
| **Edge audit** | SQLite `AuditEvent` (Prisma) | Edge engine (`apps/edge-engine`) |

Cloud and edge logs are complementary: edge captures actions before sync; cloud is the system of record after projection.

---

## Actor snapshots

Every mutating action stores an **actor snapshot** (JSON) at event time:

```json
{
  "userId": "uuid",
  "email": "tech@draxhall.local",
  "fullName": "Jordan Blake",
  "role": "tech"
}
```

Snapshots are denormalized so renaming a user later does not rewrite history.

Result and specimen rows also store snapshots on submit/release/register columns (`submitted_by_snapshot`, `released_by_snapshot`, `registered_by_snapshot`) for fast display without joining audit.

---

## Event types

| Event | When |
| --- | --- |
| `specimen.registered` | Accession completes (edge + cloud projection) |
| `result.ingested` | Analyzer result lands on edge |
| `result.submitted_for_release` | Tech submits Bench results → `pending_authorization` |
| `result.accession_recalled` | Tech recalls submission → back to `pending_review` |
| `result.accession_rejected` | Authorizer returns accession to bench → `pending_review` |
| `result.accession_released` | Authorizer releases whole accession → all pending results → `released` |
| `result.released` | Per-result release (legacy API; UI uses accession release) |
| `result.value_updated` | Post-ingest correction (future) |
| `report.exported` | PDF/JSON download (future hook) |
| `report.emailed` | Report emailed to doctor or patient (`recipientType`, sender reference in audit) |
| `review_request.created` | Tech notifies authorizer (alert only) |
| `review_request.acknowledged` | Authorizer acks alert |
| `staff.created` / `staff.updated` | Staff row created/changed on the edge |
| `staff.login` / `staff.login_failed` | Edge sign-in attempt (SQLite `AuditEvent`) |
| `device.enrolled` / `device.revoked` / `device.reassigned` | Lab device lifecycle (cloud) |
| `device.login` / `device.login_failed` | Cloud sign-in attempt from a lab device (`device_login_log`, cloud) |

See [EDGE_AUTH_AND_STAFF.md](./EDGE_AUTH_AND_STAFF.md) for the full staff/device model.

---

## Device-attributed cloud actions

Every admin/authorizer action on the **cloud** app (release, recall, dismiss from release queue, email a report, edit staff) is required to come from an **enrolled lab device** (see [EDGE_AUTH_AND_STAFF.md](./EDGE_AUTH_AND_STAFF.md)). When it does, the resulting `clinical_audit_log` row carries the device alongside the usual actor snapshot:

```json
{
  "actor_snapshot": { "userId": "uuid", "email": "authorizer@draxhall.local", "fullName": "Dr. Alicia Bennett", "role": "authorizer" },
  "device_id": "uuid",
  "device_snapshot": {
    "deviceId": "uuid",
    "deviceName": "Dr. Bennett's laptop",
    "ownerStaffId": "uuid",
    "ownerFullName": "Dr. Alicia Bennett"
  }
}
```

`device_snapshot` is frozen at action time — same reasoning as `actor_snapshot` — so the audit trail still reads correctly even if the device is later renamed, reassigned to someone else, or revoked. To answer "what did device X do" or "what did person Y do, and from where," query `clinical_audit_log` filtered on `device_id`, and cross-reference `device_login_log` for the sign-in events themselves.

---

## Immutability (cloud)

Migration `20260902100000_audit_and_submit_workflow.sql`:

- `clinical_audit_log` has **no UPDATE/DELETE** for authenticated roles.
- Postgres trigger `clinical_audit_log_no_update` raises if anyone tries to mutate rows.
- Inserts use **service role** from the API only.

---

## Release workflow audit chain

```
Analyzer ingest → result.ingested (edge)
       ↓
Tech Submit for release → result.submitted_for_release (edge + cloud on sync)
       ↓
Tech Recall OR Authorizer Return to bench → result.accession_recalled / result.accession_rejected (edge + cloud on sync)
       ↓
Authorizer Release → result.accession_released (cloud; one event per accession)
       ↓
Export / Email → report.exported / report.emailed (cloud)
```

**Notify authorizer** does not submit results — it only creates a `review_requests` row and `review_request.created` audit event.

---

## Local inspection

After `pnpm supabase:reset`, open **Studio** → `clinical_audit_log` or query:

```sql
select occurred_at, event_type, entity_type, entity_id, actor_snapshot
from clinical_audit_log
order by occurred_at desc
limit 50;
```

Edge SQLite (when using file DB):

```bash
pnpm --filter @drax-lis/edge-engine exec sqlite3 dev.db \
  "select createdAt, eventType, entityId from AuditEvent order by createdAt desc limit 20;"
```

---

## Related docs

- [WORKFLOW.md](./WORKFLOW.md) — two-step submit → authorize release
- [LOCAL_DEV.md](./LOCAL_DEV.md) — Mailpit for report email testing
- [EDGE_AUTH_AND_STAFF.md](./EDGE_AUTH_AND_STAFF.md) — staff accounts, cloud login, device enrollment, and the audit trail they produce
