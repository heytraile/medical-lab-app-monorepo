import { Injectable, Logger } from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.module";
import type { ReviewRequest } from "@drax-lis/contracts";

/** Roles that can release a result, and therefore the ones worth alerting. */
const ALERT_ROLES = ["authorizer", "admin"];

/**
 * Outbound alerting for review requests.
 *
 * Email is not actually sent yet: `sendEmail` logs a fully rendered message so
 * the content is reviewable in the terminal, and is the single place to plug a
 * provider into later. In-app notification is the real delivery path today.
 */
@Injectable()
export class NotifierService {
  private readonly logger = new Logger(NotifierService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async notifyReviewRequest(request: ReviewRequest): Promise<void> {
    const recipients = await this.resolveAlertRecipients();
    const flag = request.worstFlag ? request.worstFlag.replaceAll("_", " ") : "unflagged";
    const patient = request.patientDisplayName ?? request.accessionNumbers.join(", ");

    const subject = `[${flag.toUpperCase()}] Review requested: ${patient}`;
    const lines = [
      `Patient: ${patient}${request.patientMrn ? ` (${request.patientMrn})` : ""}`,
      `Accession: ${request.accessionNumbers.join(", ")}`,
      `Results awaiting review: ${request.resultCount}`,
      `Worst flag: ${flag}`,
      request.testCodes.length ? `Tests: ${request.testCodes.join(", ")}` : null,
      request.note ? `Note from ${request.requestedByEmail ?? "bench"}: ${request.note}` : null,
      "",
      "Open the Release queue to sign off.",
    ].filter(Boolean) as string[];

    await this.sendEmail(recipients, subject, lines.join("\n"));
  }

  /**
   * The single seam for real delivery. Production uses Resend (see docs/EMAIL.md).
   * Local dev logs to the terminal until RESEND_API_KEY is configured.
   */
  async sendEmail(to: string[], subject: string, body: string): Promise<void> {
    const from = process.env.REVIEW_ALERT_EMAIL_FROM ?? "lis@local.dev";
    if (!to.length) {
      this.logger.warn(
        `No authorizer/admin recipients found — email not queued: ${subject}`,
      );
      return;
    }
    this.logger.log(
      [
        "EMAIL NOT SENT (stub — no provider configured)",
        `from: ${from}`,
        `to:   ${to.join(", ")}`,
        `subj: ${subject}`,
        body,
      ].join("\n"),
    );
  }

  private async resolveAlertRecipients(): Promise<string[]> {
    if (this.supabase.enabled && this.supabase.client) {
      const { data, error } = await this.supabase.client
        .from("profiles")
        .select("email")
        .in("role", ALERT_ROLES);
      if (error) {
        this.logger.error(`Could not resolve recipients: ${error.message}`);
        return [];
      }
      return (data ?? [])
        .map((row) => (row as { email?: string | null }).email)
        .filter((email): email is string => Boolean(email));
    }
    // Dev fallback: mirrors the synthetic identities the auth guard hands out
    // when Supabase is unset.
    return ALERT_ROLES.map((role) => `${role}@local.dev`);
  }
}
