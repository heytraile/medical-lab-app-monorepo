# Security — reporting, dependencies, and change validation

How we keep the **code and dependencies** trustworthy. Runtime hardening of the mini PC is in [EDGE_SECURITY_AND_BACKUP.md](./EDGE_SECURITY_AND_BACKUP.md). Clinical uniqueness is in [DATA_INTEGRITY.md](./DATA_INTEGRITY.md).

---

## Report a vulnerability

Email the maintainer privately. Do **not** open a public GitHub issue for a live PHI or auth flaw.

Include: affected app (`edge-engine` / `api` / `web`), version or commit, and steps to reproduce.

---

## Patch SLAs

| Severity | Target |
| --- | --- |
| Critical | 7 days |
| High | 30 days |
| Medium / low | Next dependency cycle |

If we cannot patch in time, record a **time-boxed waiver** in this file (package, CVE, reason, expiry). Expired waivers must be closed or renewed.

### Active waivers

_None._

---

## What CI enforces

On every push and pull request to `dev` / `main`:

1. `pnpm install --frozen-lockfile` — no lockfile drift
2. `pnpm lint`, `pnpm typecheck`, `pnpm test`
3. `pnpm audit --audit-level=high` — fail on high/critical npm advisories
4. OSV-Scanner on `pnpm-lock.yaml`
5. CodeQL (`javascript-typescript`) on scheduled + PR runs (see `.github/workflows/codeql.yml`)

Dependabot opens weekly PRs for npm and GitHub Actions (patch/minor grouped). Majors need human review.

---

## Policy

- Secrets never committed. GitHub secret scanning is on; do not paste tokens into docs.
- High-risk paths (auth, sync, results, specimens, `supabase/migrations/`) need a careful review in addition to green CI. Optional Cursor Security Review / Bugbot on those PRs.
- Protected branches should require the **CI** workflow to pass before merge.
- Migrations that touch RLS or `clinical_audit_log` must preserve append-only audit rules.
- Production lab image scans (Trivy) are a go-live follow-up, not this pipeline.

---

## Local commands

```bash
pnpm audit --audit-level=high
pnpm lint && pnpm typecheck && pnpm test
```
