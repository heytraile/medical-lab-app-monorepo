import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  DismissReleaseQueueAccessionRequestSchema,
  EmailPatientReportRequestSchema,
  PatientReportQuerySchema,
  type DeviceSnapshot,
} from "@drax-lis/contracts";
import { SyncService } from "./sync.service";
import { ReportsService } from "../reports/reports.service";
import { MailService } from "../reports/mail.service";
import { AuditService } from "../audit/audit.service";
import { CurrentDevice, LabDeviceGuard } from "../devices/lab-device.guard";
import {
  CurrentUser,
  Roles,
  SupabaseAuthGuard,
  toActorSnapshot,
  type AuthUser,
} from "../auth/auth.guard";
import {
  formatJobTitle,
  staffSenderReference,
} from "../lab-staff/staff-labels";

@Controller("cloud")
@UseGuards(SupabaseAuthGuard)
export class CloudReadController {
  constructor(
    private readonly sync: SyncService,
    private readonly reports: ReportsService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
  ) {}

  @Get("results")
  results(@Query("status") status?: string) {
    return this.sync.listResults({ status });
  }

  @Get("release-queue")
  releaseQueue() {
    return this.sync.listReleaseQueue();
  }

  @Post("release-queue/dismiss-accession")
  @UseGuards(LabDeviceGuard)
  @Roles("authorizer", "admin")
  async dismissReleaseQueueAccession(
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
    @CurrentDevice() device: DeviceSnapshot | undefined,
  ) {
    const parsed = DismissReleaseQueueAccessionRequestSchema.parse(body);
    const actor = toActorSnapshot(user);
    const result = await this.sync.dismissAccessionFromReleaseQueue(
      parsed.accessionNumber,
    );
    await this.audit.log({
      eventType: "release_queue.accession_dismissed",
      entityType: "accession",
      entityId: parsed.accessionNumber,
      actor,
      device: device ?? null,
      payload: { accessionNumber: parsed.accessionNumber },
    });
    return result;
  }

  @Post("release-queue/dismiss-all-released")
  @UseGuards(LabDeviceGuard)
  @Roles("authorizer", "admin")
  async dismissAllReleasedFromReleaseQueue(
    @CurrentUser() user: AuthUser,
    @CurrentDevice() device: DeviceSnapshot | undefined,
  ) {
    const actor = toActorSnapshot(user);
    const result = await this.sync.dismissAllReleasedFromReleaseQueue();
    await this.audit.log({
      eventType: "release_queue.cleared_released",
      entityType: "release_queue",
      entityId: "ready_to_send",
      actor,
      device: device ?? null,
      payload: { dismissedCount: result.dismissedCount },
    });
    return result;
  }

  @Get("specimens")
  specimens(@Query("accession") accession?: string) {
    if (accession?.trim()) {
      return this.sync.getSpecimenByAccession(accession.trim());
    }
    return this.sync.listSpecimens();
  }

  @Get("patients/:edgePatientId/report")
  patientReport(
    @Param("edgePatientId") edgePatientId: string,
    @Query() query: unknown,
  ) {
    const parsed = PatientReportQuerySchema.parse(query);
    return this.reports.buildPatientReport(
      edgePatientId,
      parsed.accessionNumber,
    );
  }

  @Post("patients/:edgePatientId/report/email")
  @UseGuards(LabDeviceGuard)
  async emailPatientReport(
    @Param("edgePatientId") edgePatientId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
    @CurrentDevice() device: DeviceSnapshot | undefined,
  ) {
    const parsed = EmailPatientReportRequestSchema.parse(body);
    const payload = await this.reports.buildPatientReport(
      edgePatientId,
      parsed.accessionNumber,
    );
    if (payload.summary.resultCount === 0) {
      throw new BadRequestException(
        "No released results for this patient — release results first",
      );
    }

    const actor = toActorSnapshot(user);
    const senderReference = staffSenderReference(user.id);
    const senderName =
      user.fullName?.trim() || user.email?.trim() || "Lab staff";

    await this.mail.sendPatientReportEmail({
      to: parsed.to,
      payload,
      recipientType: parsed.recipientType,
      message: parsed.message,
      sender: {
        staffId: user.id,
        senderReference,
        fullName: senderName,
        jobTitleLabel: formatJobTitle(user.jobTitle),
        email: user.email ?? null,
        role: user.role,
      },
    });

    await this.audit.log({
      eventType: "report.emailed",
      entityType: "patient",
      entityId: edgePatientId,
      actor,
      device: device ?? null,
      payload: {
        to: parsed.to,
        recipientType: parsed.recipientType,
        resultCount: payload.summary.resultCount,
        mrn: payload.patient.mrn,
        senderStaffId: user.id,
        senderReference,
        senderName,
        senderJobTitle: user.jobTitle ?? null,
        accessionNumber: parsed.accessionNumber ?? null,
      },
    });

    return { ok: true };
  }
}
