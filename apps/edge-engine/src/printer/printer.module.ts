import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PrinterService } from "./printer.service";
import { PrinterController } from "./printer.controller";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [PrinterController],
  providers: [PrinterService],
  exports: [PrinterService],
})
export class PrinterModule {}
