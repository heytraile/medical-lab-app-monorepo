import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { Server, Socket } from "socket.io";

@WebSocketGateway({
  cors: { origin: "*" },
  namespace: "/bench",
})
export class RealtimeGateway implements OnGatewayConnection {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    this.logger.log(`Bench client connected: ${client.id}`);
  }

  emitBenchEvent(event: Record<string, unknown>) {
    this.server?.emit("bench.event", event);
  }
}
