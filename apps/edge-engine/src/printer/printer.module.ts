import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PrinterService } from "./printer.service";
import { PrinterController } from "./printer.controller";

@Module({
  imports: [PrismaModule],
  controllers: [PrinterController],
  providers: [PrinterService],
  exports: [PrinterService],
})
export class PrinterModule {}
