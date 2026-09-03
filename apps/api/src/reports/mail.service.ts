import { Injectable, Logger } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import type {
  PatientReportPayload,
  ReportEmailRecipientType,
} from "@drax-lis/contracts";

export type ReportEmailSender = {
  staffId: string;
  senderReference: string;
  fullName: string;
  jobTitleLabel: string;
  email: string | null;
  role: string;
};

/**
 * Outbound patient report email.
 *
 * Local dev: SMTP → Mailpit (127.0.0.1:54325).
 * Production: Resend (RESEND_API_KEY in Doppler) — see docs/EMAIL.md.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private transporter() {
    const host = process.env.SMTP_HOST ?? "127.0.0.1";
    const port = Number(process.env.SMTP_PORT ?? 54325);
    return nodemailer.createTransport({
      host,
      port,
      secure: false,
      tls: { rejectUnauthorized: false },
    });
  }

  async sendPatientReportEmail(input: {
    to: string;
    payload: PatientReportPayload;
    recipientType: ReportEmailRecipientType;
    sender: ReportEmailSender;
    message?: string;
  }) {
    const from =
      process.env.SMTP_FROM ?? "Drax Hall Lab <lab@draxhall.local>";
    const subject = `Laboratory report — ${input.payload.patient.displayName} (${input.payload.patient.mrn})`;

    const intro =
      input.message?.trim() ||
      (input.recipientType === "doctor"
        ? "Please find the laboratory report for your patient attached."
        : "Please find your laboratory report attached.");

    const bodyLines: string[] = [
      intro,
      "",
      `Patient: ${input.payload.patient.displayName}`,
      `MRN: ${input.payload.patient.mrn}`,
      `Released results: ${input.payload.summary.resultCount}`,
      "",
      "This message contains released results only.",
      input.payload.lab.disclaimer ?? "",
      "",
      "---",
      `Sent by: ${input.sender.fullName}`,
      `Job title: ${input.sender.jobTitleLabel}`,
      `Reference: ${input.sender.senderReference}`,
    ];
    if (input.sender.email) {
      bodyLines.push(`Contact: ${input.sender.email}`);
    }
    bodyLines.push(`On behalf of: ${input.payload.lab.name}`);

    const senderHtml = [
      `<p><strong>Sent by:</strong> ${escapeHtml(input.sender.fullName)}</p>`,
      `<p><strong>Job title:</strong> ${escapeHtml(input.sender.jobTitleLabel)}</p>`,
      `<p><strong>Reference:</strong> ${escapeHtml(input.sender.senderReference)}</p>`,
      input.sender.email
        ? `<p><strong>Contact:</strong> ${escapeHtml(input.sender.email)}</p>`
        : "",
      `<p><strong>On behalf of:</strong> ${escapeHtml(input.payload.lab.name)}</p>`,
    ]
      .filter(Boolean)
      .join("");

    const json = JSON.stringify(input.payload, null, 2);

    await this.transporter().sendMail({
      from,
      to: input.to,
      ...(input.sender.email ? { replyTo: input.sender.email } : {}),
      subject,
      text: bodyLines.join("\n"),
      html: [
        `<p>${escapeHtml(intro)}</p>`,
        `<p>Patient: ${escapeHtml(input.payload.patient.displayName)}<br/>`,
        `MRN: ${escapeHtml(input.payload.patient.mrn)}<br/>`,
        `Released results: ${input.payload.summary.resultCount}</p>`,
        `<p><em>Released results only.</em></p>`,
        `<hr/>`,
        senderHtml,
      ].join(""),
      attachments: [
        {
          filename: `${input.payload.patient.mrn}-report.json`,
          content: json,
          contentType: "application/json",
        },
      ],
    });

    this.logger.log(
      `Report email (${input.recipientType}) sent to ${input.to} for ${input.payload.patient.mrn} by ref ${input.sender.senderReference}`,
    );
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
