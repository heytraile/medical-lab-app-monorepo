import { Body, Controller, Post } from "@nestjs/common";
import { IngestionService } from "./ingestion.service";

/** Dev/test endpoint to inject a raw frame without a real socket. */
@Controller("ingest")
export class IngestionController {
  constructor(private readonly ingestion: IngestionService) {}

  @Post()
  async ingest(
    @Body()
    body: {
      analyzerId: string;
      transport?: "serial" | "tcp";
      protocol:
        | "astm_e1381"
        | "astm_e1394"
        | "hl7_mllp"
        | "ascii_delimited";
      payload: string;
    },
  ) {
    return this.ingestion.ingest({
      analyzerId: body.analyzerId,
      transport: body.transport ?? "tcp",
      protocol: body.protocol,
      payload: body.payload,
    });
  }
}
