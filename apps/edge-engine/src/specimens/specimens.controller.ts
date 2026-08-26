import { Body, Controller, Get, Post } from "@nestjs/common";
import { SpecimensService } from "./specimens.service";

@Controller("specimens")
export class SpecimensController {
  constructor(private readonly specimens: SpecimensService) {}

  @Get()
  list() {
    return this.specimens.list();
  }

  @Post()
  register(
    @Body()
    body: {
      accessionNumber?: string;
      barcode?: string;
      patientId: string;
      identityConfirmation?: {
        decision: "distinct_people" | "possible_duplicate_acknowledged";
        suspectGroupId: string;
        confirmedAt?: string;
        confirmedBy?: string;
      };
      orderedTests?: Array<{ code: string; name?: string }>;
      printLabel?: boolean;
      copies?: number;
    },
  ) {
    return this.specimens.register(body);
  }
}
