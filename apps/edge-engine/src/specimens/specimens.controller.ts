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
      patientName: string;
      patient?: {
        firstName: string;
        lastName: string;
        dateOfBirth?: string;
        sex?: string;
      };
      orderedTests?: Array<{ code: string; name?: string }>;
      printLabel?: boolean;
    },
  ) {
    return this.specimens.register(body);
  }
}
