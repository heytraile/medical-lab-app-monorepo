import { Module } from "@nestjs/common";
import { PatientsModule } from "../patients/patients.module";
import { DemoController } from "./demo.controller";
import { DemoSeedService } from "./demo-seed.service";

@Module({
  imports: [PatientsModule],
  controllers: [DemoController],
  providers: [DemoSeedService],
})
export class DemoModule {}
