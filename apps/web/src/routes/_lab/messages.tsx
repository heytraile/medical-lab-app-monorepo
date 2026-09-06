import { createFileRoute } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Hash,
  MessageSquare,
  Plus,
  Send,
  UserRound,
} from "lucide-react";
import type { Conversation, Message } from "@drax-lis/contracts";
import { api } from "../../lib/api";
import { canAuthorize, isAdmin, useAuth } from "../../lib/auth";
import { isCloudMode, supabase } from "../../lib/supabase";
import { useMessagingSocket } from "../../lib/messaging-socket";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { ScrollContainer } from "../../components/ui/scroll-container";
import { cn } from "../../lib/utils";

export const Route = createFileRoute("/_lab/messages")({
  component: MessagesPage,
});

function newMessageId() {
  return crypto.randomUUID();
}

function mergeById<T extends { id: string }>(existing: T[], incoming: T[]): T[] {
  const map = new Map(existing.map((m) => [m.id, m]));
  for (const item of incoming) map.set(item.id, item);
  return [...map.values()];
}

function formatMessageTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return d.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function MessagesPage() {
  const auth = useAuth();
  const qc = useQueryClient();
  const myId = auth.profile?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [dmPickerOpen, setDmPickerOpen] = useState(false);
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const threadEndRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const useCloud = isCloudMode && canAuthorize(auth.role);

  const conversationsQ = useQuery({
    queryKey: ["messaging-conversations", useCloud ? "cloud" : "edge"],
    queryFn: () =>
      useCloud
        ? api.cloudMessagingConversations()
        : api.messagingConversations(),
    enabled: Boolean(auth.accessToken),
    refetchInterval: 15_000,
  });

  const directoryQ = useQuery({
    queryKey: ["messaging-directory"],
    queryFn: () => api.messagingDirectory(),
    enabled: Boolean(auth.accessToken) && !useCloud && dmPickerOpen,
  });

  const messagesQ = useQuery({
    queryKey: ["messaging-messages", selectedId, useCloud ? "cloud" : "edge"],
    queryFn: () =>
      useCloud
        ? api.cloudMessagingMessages(selectedId!)
        : api.messagingMessages(selectedId!),
    enabled: Boolean(auth.accessToken && selectedId),
  });

  useEffect(() => {
    setLocalMessages([]);
  }, [selectedId]);

  useEffect(() => {
    if (messagesQ.data) {
      setLocalMessages((prev) => mergeById(prev, messagesQ.data));
    }
  }, [messagesQ.data]);

  const onSocketEvent = useCallback(
    (event: {
      type: string;
      message?: Message;
      conversation?: Conversation;
    }) => {
      if (event.type === "message.created" && event.message) {
        setLocalMessages((prev) => mergeById(prev, [event.message!]));
        void qc.invalidateQueries({ queryKey: ["messaging-conversations"] });
      }
      if (event.type === "conversation.updated" && event.conversation) {
        void qc.invalidateQueries({ queryKey: ["messaging-conversations"] });
      }
    },
    [qc],
  );

  const { sendViaSocket } = useMessagingSocket({
    enabled: !useCloud,
    onEvent: onSocketEvent,
  });

  useEffect(() => {
    if (!useCloud || !selectedId) return;
    const client = supabase;
    if (!client) return;

    const channel = client
      .channel(`messages:${selectedId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${selectedId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            conversation_id: string;
            sender_staff_id: string;
            body: string;
            created_at: string;
            local_sequence: number;
            origin: string;
          };
          const message: Message = {
            id: row.id,
            conversationId: row.conversation_id,
            senderStaffId: row.sender_staff_id,
            body: row.body,
            createdAt: row.created_at,
            localSequence: Number(row.local_sequence ?? 0),
            synced: "synced",
            origin: row.origin === "cloud" ? "cloud" : "edge",
          };
          setLocalMessages((prev) => mergeById(prev, [message]));
          void qc.invalidateQueries({ queryKey: ["messaging-conversations"] });
        },
      )
      .subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [useCloud, selectedId, qc]);

  const conversations = conversationsQ.data ?? [];
  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const threadMessages = useMemo(() => {
    const forThread = localMessages.filter(
      (m) => m.conversationId === selectedId,
    );
    return [...forThread].sort((a, b) => {
      const t = a.createdAt.localeCompare(b.createdAt);
      if (t !== 0) return t;
      return a.localSequence - b.localSequence;
    });
  }, [localMessages, selectedId]);

  useLayoutEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [threadMessages.length, selectedId]);

  const createDmM = useMutation({
    mutationFn: (otherStaffId: string) =>
      api.messagingCreateDm({ otherStaffId }),
    onSuccess: (conversation) => {
      void qc.invalidateQueries({ queryKey: ["messaging-conversations"] });
      setSelectedId(conversation.id);
      setDmPickerOpen(false);
    },
  });

  const sendM = useMutation({
    mutationFn: async () => {
      if (!selectedId || !draft.trim()) return;
      const body = {
        id: newMessageId(),
        conversationId: selectedId,
        body: draft.trim(),
        createdAt: new Date().toISOString(),
      };
      const optimistic: Message = {
        ...body,
        senderStaffId: myId ?? "unknown",
        senderFullName: auth.displayName,
        localSequence: Date.now(),
        synced: "pending",
        origin: useCloud ? "cloud" : "edge",
      };
      setLocalMessages((prev) => mergeById(prev, [optimistic]));
      setDraft("");
      if (composerRef.current) {
        composerRef.current.style.height = "auto";
      }

      if (useCloud) {
        return api.cloudMessagingSend(body);
      }
      try {
        return await sendViaSocket(body);
      } catch {
        return api.messagingSend(body);
      }
    },
    onSuccess: (message) => {
      if (message) setLocalMessages((prev) => mergeById(prev, [message]));
      void qc.invalidateQueries({ queryKey: ["messaging-conversations"] });
      composerRef.current?.focus();
    },
  });

  function selectConversation(id: string) {
    setSelectedId(id);
    setDmPickerOpen(false);
  }

  function clearSelection() {
    setSelectedId(null);
  }

  if (!auth.accessToken) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Sign in to use Messages.
      </div>
    );
  }

  const showThreadOnMobile = Boolean(selectedId);

  return (
    <div className="flex h-full min-h-0 items-stretch justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-muted/40 via-background to-background px-2 pt-2 sm:px-4 sm:pt-4 md:px-5 lg:px-6">
      {/* Card fills remaining space above bottom nav */}
      <div className="mx-auto flex h-full w-full max-w-6xl min-h-0 flex-col pb-2 sm:pb-3">
        <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-lg shadow-black/5 ring-1 ring-black/5 dark:shadow-black/40 dark:ring-white/5">
          {/* Conversation list */}
          <aside
            className={cn(
              "flex min-h-0 w-full shrink-0 flex-col border-border md:w-[17.5rem] md:border-r lg:w-80",
              showThreadOnMobile ? "hidden md:flex" : "flex",
            )}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Inbox
                </p>
                <h1 className="font-display text-xl font-semibold tracking-tight">
                  Messages
                </h1>
              </div>
              {!useCloud && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => setDmPickerOpen((o) => !o)}
                >
                  <Plus className="size-3.5" />
                  New
                </Button>
              )}
            </div>

            {dmPickerOpen && !useCloud && (
              <div className="max-h-44 shrink-0 overflow-y-auto border-b border-border bg-muted/25 px-2 py-2">
                <p className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Start a DM
                </p>
                {(directoryQ.data ?? []).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-muted"
                    onClick={() => createDmM.mutate(s.id)}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      {s.fullName
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((p) => p[0]?.toUpperCase() ?? "")
                        .join("")}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {s.fullName}
                    </span>
                    <Badge variant="muted" className="shrink-0 text-[10px]">
                      {s.role}
                    </Badge>
                  </button>
                ))}
                {directoryQ.isLoading && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">
                    Loading…
                  </p>
                )}
              </div>
            )}

            <ScrollContainer className="min-h-0 flex-1">
              <div className="flex flex-col gap-0.5 p-2">
                {conversationsQ.isLoading && (
                  <p className="px-3 py-4 text-sm text-muted-foreground">
                    Loading…
                  </p>
                )}
                {!conversationsQ.isLoading && conversations.length === 0 && (
                  <p className="px-3 py-4 text-sm leading-relaxed text-muted-foreground">
                    No conversations yet. Start a DM or wait for channel sync.
                  </p>
                )}
                {conversations.map((c) => {
                  const active = selectedId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => selectConversation(c.id)}
                      className={cn(
                        "flex w-full flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left transition-colors",
                        active
                          ? "bg-primary/10 text-foreground ring-1 ring-primary/20"
                          : "hover:bg-muted/70",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "grid size-8 shrink-0 place-items-center rounded-full",
                            active
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {c.kind === "channel" ? (
                            <Hash className="size-3.5" />
                          ) : (
                            <UserRound className="size-3.5" />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {c.title}
                        </span>
                      </div>
                      {c.lastMessagePreview && (
                        <p className="truncate pl-10 text-xs text-muted-foreground">
                          {c.lastMessagePreview}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </ScrollContainer>

            {useCloud && (
              <p className="shrink-0 border-t border-border px-4 py-2 text-[10px] text-muted-foreground">
                Cloud inbox — Realtime for admin / authorizer
              </p>
            )}
          </aside>

          {/* Thread pane */}
          <section
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col bg-background/40",
              showThreadOnMobile ? "flex" : "hidden md:flex",
            )}
          >
            {!selected ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
                <div className="grid size-14 place-items-center rounded-2xl bg-muted/60 text-muted-foreground">
                  <MessageSquare className="size-6 opacity-70" />
                </div>
                <div className="space-y-1">
                  <p className="font-display text-base font-semibold tracking-tight">
                    Select a conversation
                  </p>
                  <p className="max-w-xs text-sm text-muted-foreground">
                    Pick a channel or DM from the list. Messages stay on the lab
                    network until sync pushes them to the cloud.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <header className="flex shrink-0 items-center gap-2 border-b border-border bg-card/80 px-3 py-3 backdrop-blur-sm sm:px-4">
                  <button
                    type="button"
                    onClick={clearSelection}
                    aria-label="Back to conversations"
                    className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
                  >
                    <ArrowLeft className="size-4" />
                  </button>
                  <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                    {selected.kind === "channel" ? (
                      <Hash className="size-4" />
                    ) : (
                      <UserRound className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-display text-base font-semibold tracking-tight">
                      {selected.title}
                    </h2>
                    <p className="truncate text-xs text-muted-foreground">
                      {selected.members
                        .map((m) => m.fullName ?? m.staffId.slice(0, 8))
                        .join(", ")}
                    </p>
                  </div>
                </header>

                <ScrollContainer className="min-h-0 flex-1">
                  <div className="flex flex-col gap-3 px-3 py-4 sm:px-5">
                    {messagesQ.isLoading && threadMessages.length === 0 && (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        Loading messages…
                      </p>
                    )}
                    {!messagesQ.isLoading && threadMessages.length === 0 && (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        No messages yet — say hello.
                      </p>
                    )}
                    {threadMessages.map((m) => {
                      const mine = m.senderStaffId === myId;
                      return (
                        <div
                          key={m.id}
                          className={cn(
                            "flex max-w-[min(100%,28rem)] flex-col gap-1",
                            mine ? "ml-auto items-end" : "mr-auto items-start",
                          )}
                        >
                          <div
                            className={cn(
                              "flex items-baseline gap-2 px-1",
                              mine && "flex-row-reverse",
                            )}
                          >
                            <span className="text-[11px] font-medium text-foreground/80">
                              {mine ? "You" : (m.senderFullName ?? "Staff")}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {formatMessageTime(m.createdAt)}
                            </span>
                          </div>
                          <div
                            className={cn(
                              "rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm",
                              mine
                                ? "rounded-br-md bg-primary text-primary-foreground"
                                : "rounded-bl-md border border-border/70 bg-muted/80 text-foreground",
                            )}
                          >
                            {m.body}
                          </div>
                        </div>
                      );
                    })}
                    <div ref={threadEndRef} className="h-px w-full shrink-0" />
                  </div>
                </ScrollContainer>

                <form
                  className="shrink-0 border-t border-border bg-card/90 p-3 backdrop-blur-sm sm:p-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!draft.trim() || sendM.isPending) return;
                    sendM.mutate();
                  }}
                >
                  <div className="flex items-end gap-2 rounded-2xl border border-border bg-background p-2 shadow-inner focus-within:ring-2 focus-within:ring-ring/40">
                    <textarea
                      ref={composerRef}
                      rows={1}
                      className="max-h-32 min-h-[2.5rem] min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground"
                      placeholder={
                        isAdmin(auth.role) || canAuthorize(auth.role)
                          ? "Write a message…"
                          : "Message the team…"
                      }
                      value={draft}
                      onChange={(e) => {
                        setDraft(e.target.value);
                        const el = e.target;
                        el.style.height = "auto";
                        el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (!draft.trim() || sendM.isPending) return;
                          sendM.mutate();
                        }
                      }}
                      maxLength={8000}
                    />
                    <Button
                      type="submit"
                      size="sm"
                      className="shrink-0 rounded-xl"
                      disabled={!draft.trim() || sendM.isPending}
                      aria-label="Send message"
                    >
                      <Send className="size-4" />
                      <span className="hidden sm:inline">Send</span>
                    </Button>
                  </div>
                  <p className="mt-1.5 px-1 text-[10px] text-muted-foreground">
                    Enter to send · Shift+Enter for a new line
                  </p>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
