import { io, type Socket, type SocketOptions } from "socket.io-client";

type ManagedSocketOptions = Partial<
  SocketOptions & { auth?: Record<string, unknown> }
>;

/** Create a Socket.IO client that does not connect until explicitly told to. */
export function createManagedSocket(
  url: string,
  options: ManagedSocketOptions = {},
): Socket {
  return io(url, {
    autoConnect: false,
    transports: ["websocket", "polling"],
    ...options,
  });
}

/** Defer connect by one tick so Strict Mode mount/unmount can cancel first. */
export function scheduleSocketConnect(socket: Socket): () => void {
  const timer = window.setTimeout(() => socket.connect(), 0);
  return () => window.clearTimeout(timer);
}

/** Remove listeners and close without aborting an in-flight WebSocket handshake. */
export function teardownSocket(
  socket: Socket,
  eventNames: readonly string[],
): void {
  for (const event of eventNames) {
    socket.off(event);
  }
  if (socket.connected) {
    socket.disconnect();
    return;
  }
  // Handshake in progress — close the transport without socket.disconnect(),
  // which would log "WebSocket is closed before the connection is established".
  socket.io.engine?.close();
}
