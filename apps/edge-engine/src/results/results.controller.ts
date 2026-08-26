import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Controller("results")
export class ResultsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.result.findMany({
      orderBy: { observedAt: "desc" },
      take: 200,
    });
  }
}
