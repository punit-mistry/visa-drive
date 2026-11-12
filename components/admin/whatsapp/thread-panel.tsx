"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCheck,
  Loader2,
  MessageCircle,
  Send,
  StickyNote,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ConversationStatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/states";
import { convexErrorData, friendlyError } from "@/lib/helpers/error-messages";
import { formatDate, formatTime } from "@/lib/helpers/format";
import { cn } from "@/lib/utils";

import type { ThreadDetail } from "./types";

const MAX_LENGTH = 4096;

/** The three reasons the server refuses a reply, refused with a code. */
const REFUSAL_CODES = [
  "OPTED_OUT",
  "DEMO_RECIPIENT_BLOCKED",
  "WINDOW_CLOSED",
] as const;

type RefusalCode = (typeof REFUSAL_CODES)[number];

type Message = ThreadDetail["messages"][number];

/**
 * The right-hand pane of the inbox: the thread itself and the composer.
 *
 * Replies go through the server, which decides whether they may be sent at
 * all — an opted-out contact, a number that is not on the demo allow-list and
 * a closed 24-hour window all come back as a refusal with a reason. The
 * composer shows that reason and stops offering to send, rather than letting
 * an agent discover it one failure at a time.
 */
export function ThreadPanel({
  conversationId,
  detail,
  isLoading,
  canReply,
  onBack,
  className,
}: {
  conversationId: Id<"conversations"> | null;
  detail: ThreadDetail | undefined;
  isLoading: boolean;
  canReply: boolean;
  onBack: () => void;
  className?: string;
}) {
  const sendReply = useMutation(api.whatsappAdmin.sendReply);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [refusal, setRefusal] = useState<{
    code: RefusalCode;
    message: string;
  } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const messageCount = detail?.messages.length ?? 0;

  // The page keys this panel by conversation, so switching threads remounts
  // it: the previous draft and refusal cannot leak into the new one.

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [messageCount, conversationId]);

  if (!conversationId) {
    return (
      <Card className={cn("gap-0 overflow-hidden py-0", className)}>
        <CardContent className="p-0">
          <EmptyState
            icon={MessageCircle}
            title="Select a conversation"
            description="Pick a thread on the left to read it and reply to the customer."
            className="border-0"
          />
        </CardContent>
      </Card>
    );
  }

  const optedOut = detail?.contact.optedOut === true;
  const blocked = optedOut || refusal !== null;
  const trimmed = draft.trim();
  const tooLong = draft.length > MAX_LENGTH;
  const canSend =
    canReply && !blocked && trimmed.length > 0 && !tooLong && !sending;

  async function handleSend() {
    if (!conversationId || !canSend) return;
    setSending(true);
    try {
      await sendReply({ conversationId, body: trimmed });
      setDraft("");
      setRefusal(null);
      toast.success("Reply queued for delivery.");
    } catch (error) {
      const data = convexErrorData(error);
      const code = typeof data?.code === "string" ? data.code : "";
      const message = friendlyError(error, "Could not send the reply.");
      if ((REFUSAL_CODES as readonly string[]).includes(code)) {
        setRefusal({ code: code as RefusalCode, message });
      }
      toast.error(message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className={cn("gap-0 overflow-hidden py-0", className)}>
      <CardHeader className="border-b border-border px-4 py-3">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={onBack}
            aria-label="Back to the conversation list"
          >
            <ArrowLeft className="size-4" aria-hidden />
          </Button>

          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-sm">
              {detail?.conversation.customerName || "Conversation"}
            </CardTitle>
            <p className="truncate text-xs text-muted-foreground">
              {detail?.conversation.subject}
            </p>
          </div>

          {detail && (
            <ConversationStatusBadge status={detail.conversation.status} size="sm" />
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isLoading || !detail ? (
          <ThreadSkeleton />
        ) : detail.messages.length === 0 ? (
          <EmptyState
            compact
            icon={MessageCircle}
            title="No messages yet"
            description="This conversation has no messages in it."
            className="border-0"
          />
        ) : (
          <div
            ref={scrollRef}
            className="max-h-[58vh] min-h-[20rem] space-y-3 overflow-y-auto scrollbar-thin p-4"
          >
            {detail.messages.map((message, index) => {
              const previous = index > 0 ? detail.messages[index - 1] : undefined;
              const showDate =
                !previous ||
                formatDate(previous.createdAt, "short") !==
                  formatDate(message.createdAt, "short");

              return (
                <div key={message._id} className="space-y-3">
                  {showDate && (
                    <div className="flex items-center gap-3 py-1">
                      <span className="h-px flex-1 bg-border" aria-hidden />
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {formatDate(message.createdAt, "medium")}
                      </span>
                      <span className="h-px flex-1 bg-border" aria-hidden />
                    </div>
                  )}
                  <MessageBubble message={message} />
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-2 border-t border-border p-3">
          {blocked && (
            <p
              role="status"
              className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft px-3 py-2 text-xs text-warning"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {optedOut && !refusal
                ? "This contact has opted out of WhatsApp messages. Replies are refused by the server."
                : refusal?.message}
            </p>
          )}

          {!canReply && (
            <p className="text-xs text-muted-foreground">
              You can read this thread but not reply to it.
            </p>
          )}

          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value.slice(0, MAX_LENGTH + 1));
                if (refusal) setRefusal(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
              rows={2}
              disabled={!canReply || blocked}
              placeholder={
                blocked
                  ? "Replies are not possible on this contact."
                  : "Write a reply…"
              }
              aria-label="Reply to the customer"
              className="max-h-40 min-h-16 resize-y text-sm"
            />

            <Button
              onClick={() => void handleSend()}
              disabled={!canSend}
              aria-label="Send reply"
            >
              {sending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
              Send
            </Button>
          </div>

          <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <span>Enter to send · Shift + Enter for a new line</span>
            <span
              className={cn("tabular-nums", tooLong && "text-destructive")}
              aria-live="polite"
            >
              {draft.length} / {MAX_LENGTH}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ThreadSkeleton() {
  return (
    <div
      className="max-h-[58vh] min-h-[20rem] space-y-4 p-4"
      aria-busy
      aria-label="Loading the conversation"
    >
      <div className="flex justify-start">
        <div className="h-12 w-52 rounded-2xl rounded-bl-sm bg-muted" />
      </div>
      <div className="flex justify-end">
        <div className="h-16 w-64 rounded-2xl rounded-br-sm bg-brand-tint" />
      </div>
      <div className="flex justify-start">
        <div className="h-10 w-44 rounded-2xl rounded-bl-sm bg-muted" />
      </div>
      <div className="flex justify-end">
        <div className="h-12 w-48 rounded-2xl rounded-br-sm bg-brand-tint" />
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  if (message.authorRole === "system") {
    return (
      <div className="flex justify-center">
        <p className="rounded-full border border-border bg-muted px-3 py-1 text-center text-[11px] text-muted-foreground">
          {message.body}
        </p>
      </div>
    );
  }

  const outbound = message.direction === "outbound";
  const internal = message.isInternal;

  return (
    <div className={cn("flex", outbound ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 sm:max-w-[70%]",
          outbound
            ? "rounded-br-sm bg-brand-tint text-foreground"
            : "rounded-bl-sm bg-muted text-foreground",
          internal && "border border-dashed border-warning/40 bg-warning-soft",
        )}
      >
        <div className="mb-1 flex flex-wrap items-center gap-2">
          {internal && (
            <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-background px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
              <StickyNote className="size-2.5" aria-hidden />
              Internal note
            </span>
          )}
          <span className="text-[11px] font-medium text-muted-foreground">
            {message.authorName || (outbound ? "VisaDrive" : "Customer")}
          </span>
        </div>

        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {message.body}
        </p>

        <div className="mt-1 flex items-center justify-end gap-1.5">
          <span className="text-[10px] text-muted-foreground">
            {formatTime(message.createdAt)}
          </span>
          {outbound && !internal && (
            <DeliveryTick status={message.deliveryStatus} />
          )}
        </div>

        {message.deliveryError && (
          <p className="mt-1 flex items-start gap-1.5 text-[11px] text-destructive">
            <AlertCircle className="mt-0.5 size-3 shrink-0" aria-hidden />
            {message.deliveryError}
          </p>
        )}
      </div>
    </div>
  );
}

function DeliveryTick({
  status,
}: {
  status: "sent" | "delivered" | "read" | "failed" | undefined;
}) {
  if (status === "failed") {
    return (
      <span role="img" aria-label="Delivery failed" title="Delivery failed">
        <AlertCircle className="size-3 text-destructive" aria-hidden />
      </span>
    );
  }
  if (status === "read") {
    return (
      <span role="img" aria-label="Read" title="Read">
        <CheckCheck className="size-3 text-info" aria-hidden />
      </span>
    );
  }
  if (status === "delivered") {
    return (
      <span role="img" aria-label="Delivered" title="Delivered">
        <CheckCheck className="size-3 text-muted-foreground" aria-hidden />
      </span>
    );
  }
  return (
    <span role="img" aria-label="Sent" title="Sent">
      <Check className="size-3 text-muted-foreground" aria-hidden />
    </span>
  );
}
