import { Module } from "@nestjs/common";
import { ReviewRequestsController } from "./review-requests.controller";
import { ReviewRequestsService } from "./review-requests.service";
import { NotifierService } from "../notifications/notifier.service";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [ReviewRequestsController],
  providers: [ReviewRequestsService, NotifierService],
})
export class ReviewRequestsModule {}
