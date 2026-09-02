import { Module } from "@nestjs/common";
import { LabRequisitionsController } from "./lab-requisitions.controller";
import { LabRequisitionsService } from "./lab-requisitions.service";
import { CatalogModule } from "../catalog/catalog.module";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [CatalogModule, AuthModule],
  controllers: [LabRequisitionsController],
  providers: [LabRequisitionsService],
  exports: [LabRequisitionsService],
})
export class LabRequisitionsModule {}
