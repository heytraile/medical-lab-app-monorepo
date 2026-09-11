import { useCallback, useEffect, useRef } from "react";
import type { Socket } from "socket.io-client";
import {
  MessagingWsEventSchema,
  type Message,
  type MessagingWsEvent,
} from "@drax-lis/contracts";
import { getWsBaseUrl } from "./api";
import { isCloudMode } from "./supabase";
import { useAuth } from "./auth";
import {
  createManagedSocket,
  scheduleSocketConnect,
  teardownSocket,
} from "./socket-lifecycle";

/**
 * Edge Socket.IO /messaging client. Cloud-mode browsers use Supabase Realtime
 * instead (see messages.tsx).
 */
export function useMessagingSocket(opts: {
  enabled?: boolean;
  onEvent: (event: MessagingWsEvent) => void;
}) {
  const auth = useAuth();
  const onEventRef = useRef(opts.onEvent);
  onEventRef.current = opts.onEvent;
  const socketRef = useRef<Socket | null>(null);

  const enabled =
    (opts.enabled ?? true) && !isCloudMode && Boolean(auth.accessToken);

  useEffect(() => {
    if (!enabled || !auth.accessToken) return;

    const socket = createManagedSocket(`${getWsBaseUrl()}/messaging`, {
      auth: { token: auth.accessToken },
    });
    socketRef.current = socket;

    socket.on("messaging.event", (raw: unknown) => {
      const parsed = MessagingWsEventSchema.safeParse(raw);
      if (parsed.success) onEventRef.current(parsed.data);
    });

    const cancelConnect = scheduleSocketConnect(socket);
    return () => {
      cancelConnect();
      teardownSocket(socket, ["messaging.event"]);
      socketRef.current = null;
    };
  }, [enabled, auth.accessToken]);

  const sendViaSocket = useCallback(
    (payload: {
      id: string;
      conversationId: string;
      body: string;
      createdAt?: string;
    }) =>
      new Promise<Message>((resolve, reject) => {
        const socket = socketRef.current;
        if (!socket?.connected) {
          reject(new Error("Messaging socket not connected"));
          return;
        }
        socket.timeout(8_000).emit(
          "message.send",
          payload,
          (err: Error | null, res: { ok?: boolean; message?: Message; error?: string }) => {
            if (err) {
              reject(err);
              return;
            }
            if (!res?.ok || !res.message) {
              reject(new Error(res?.error ?? "Send failed"));
              return;
            }
            resolve(res.message);
          },
        );
      }),
    [],
  );

  return { sendViaSocket, connected: Boolean(socketRef.current?.connected) };
}
