import { Controller, Post } from "@nestjs/common";
import { DemoSeedService } from "./demo-seed.service";

@Controller("demo")
export class DemoController {
  constructor(private readonly demo: DemoSeedService) {}

  @Post("bench")
  seedBench() {
    return this.demo.seedBench();
  }
}
