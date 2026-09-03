# Email — how reports and alerts are sent

This document records how outbound email works today, and how it will work for a live client (Drax Hall and future labs).

---

## Production: Resend

**Patient report email** and **staff alert email** will go through **[Resend](https://resend.com)** in production.

For each client lab we will:

1. Create a **Resend account** (or a dedicated project/domain under our agency account, per client agreement).
2. Verify the lab’s **sending domain** (for example `reports.draxhall.jm` or a subdomain we manage for them).
3. Store the **Resend API key** in Doppler (never in git) for that environment.
4. Set a **From** address that matches the verified domain (for example `Drax Hall Lab <reports@draxhall.jm>`).

Resend is the single email provider for live environments. We are not planning separate SMTP providers per feature.

---

## Local development: Mailpit (not Resend)

On a developer machine, email does **not** go to the internet. The local Supabase stack includes **Mailpit**, a fake inbox:

| What | Where |
| --- | --- |
| Web inbox | http://127.0.0.1:54324 |
| SMTP (what the cloud API uses locally) | `127.0.0.1:54325` |

When you click **Email to doctor** or **Email to patient** on a released report, the message appears in Mailpit so you can read it without sending real mail. This is intentional — you should never point local dev at a live Resend key by accident.

---

## Patient report email (doctor or patient)

Staff choose **Email to doctor** or **Email to patient**, enter the recipient address, and send. The message includes:

- Opening text suited to the recipient (doctor vs patient)
- Patient name, MRN, and released result count
- JSON report attachment
- **Sender block** (filled in automatically from whoever is signed in — not editable in the form):
  - Full name
  - Job title (from staff profile)
  - **Reference** — last 8 characters of the staff account ID (not the full internal ID)
  - Work contact email
  - Lab name (“On behalf of …”)

**Reply-To** is set to the sender’s work email when available, so replies go to the person who sent the report. The **From** address stays the lab’s verified domain (Resend in production).

The **full staff account ID** is stored in the audit log only (`report.emailed`), not in the email body — so external recipients get accountability without exposing the complete internal identifier.

---

## What gets emailed

| Email type | Who receives it | When | Status |
| --- | --- | --- | --- |
| **Patient report (doctor)** | Doctor’s email address entered by staff | After results are **released**; JSON report attached | Works locally via Mailpit; production will use Resend |
| **Patient report (patient)** | Patient’s email address entered by staff | Same | Same |
| **Review / authorizer alerts** | Authorizers and admins on file | When a bench tech uses **Notify authorizer** | In-app notification works today; email body is prepared but **not sent yet** — will use the same Resend setup |

Only **released** results belong in a report email. Pending or submitted-but-not-released work must never be emailed.

---

## Environment variables (cloud API)

These live in **Doppler** for each environment, not in committed `.env` files.

| Variable | Local dev | Production |
| --- | --- | --- |
| `SMTP_HOST` | `127.0.0.1` (Mailpit) | Not used once Resend is wired |
| `SMTP_PORT` | `54325` (Mailpit) | Not used once Resend is wired |
| `SMTP_FROM` | `Drax Hall Lab <lab@draxhall.local>` | Verified sender on client domain |
| `RESEND_API_KEY` | Empty (use Mailpit) | Required — from the client’s Resend project |
| `REVIEW_ALERT_EMAIL_FROM` | `lis@local.dev` | Same verified sender as report email |

Implementation note: report email today uses SMTP (Mailpit locally). The mail layer will call Resend when `RESEND_API_KEY` is set; local dev keeps using Mailpit when it is not.

---

## Client onboarding checklist (Resend)

When standing up email for a new lab:

- [ ] Resend account / project created for the client
- [ ] Domain verified (DNS records provided to client or managed by us)
- [ ] From address agreed (lab name + address on verified domain)
- [ ] API key added to Doppler for staging and production
- [ ] Send a test report email to a staff address and confirm delivery
- [ ] Confirm Mailpit is **not** used outside local dev

---

## Related reading

- [WORKFLOW.md](./WORKFLOW.md) — release before export/email
- [LOCAL_DEV.md](./LOCAL_DEV.md) — Mailpit ports and test logins
- [AUDIT.md](./AUDIT.md) — `report.emailed` audit event
