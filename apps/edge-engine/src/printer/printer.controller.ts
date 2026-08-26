import { Body, Controller, Post } from "@nestjs/common";
import { PrinterService } from "./printer.service";

@Controller("print")
export class PrinterController {
  constructor(private readonly printer: PrinterService) {}

  @Post("label")
  async printLabel(
    @Body()
    body: {
      accessionNumber: string;
      patientName: string;
      barcode?: string;
    },
  ) {
    const barcode = body.barcode ?? body.accessionNumber;
    const zpl = this.printer.buildSpecimenLabel({
      accessionNumber: body.accessionNumber,
      patientName: body.patientName,
      barcode,
    });
    const result = await this.printer.printZpl(zpl);
    return { ...result, zpl };
  }
}
