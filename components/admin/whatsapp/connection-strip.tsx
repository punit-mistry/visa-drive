"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import {
  Bot,
  FlaskConical,
  Loader2,
  PlugZap,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { friendlyError } from "@/lib/helpers/error-messages";
import { cn } from "@/lib/utils";

import type { WhatsAppStatus } from "./types";

/**
 * The strip above the inbox: is WhatsApp configured, is this demo traffic or
 * real traffic, and is the bot answering.
 *
 * The three are separate questions and the strip keeps them separate. "Demo
 * mode" is loud on purpose — an agent replying to a simulated customer is a
 * waste of an hour, and a screenshot of this strip should make that obvious at
 * a glance.
 */

/** The bot is stopped by the environment even when the setting says otherwise. */
const MAX_RESET_CALLS = 10;

export function ConnectionStripSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-4 p-4" aria-busy aria-label="Loading">
        <Skeleton className="h-11 w-full rounded-xl" />
        <div className="flex items-center justify-between gap-4">
          <div className="flex gap-3">
            <Skeleton className="h-7 w-44 rounded-full" />
            <Skeleton className="h-7 w-28 rounded-full" />
          </div>
          <Skeleton className="h-8 w-32 rounded-lg" />
        </div>
      </CardContent>
    </Card>
  );
}

export function ConnectionStrip({
  status,
  canManage,
}: {
  status: WhatsAppStatus;
  canManage: boolean;
}) {
  const setBotEnabled = useMutation(api.whatsappAdmin.setBotEnabled);
  const resetDemo = useMutation(api.whatsappAdmin.resetDemo);

  const [toggling, setToggling] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function handleBotToggle(enabled: boolean) {
    setToggling(true);
    try {
      await setBotEnabled({ enabled });
      toast.success(
        enabled
          ? "Bot replies enabled — new messages will be answered automatically."
          : "Bot replies paused — new messages will wait for staff.",
      );
    } catch (error) {
      toast.error(friendlyError(error, "Could not change the bot setting."));
    } finally {
      setToggling(false);
    }
  }

  async function handleResetDemo() {
    setResetting(true);
    try {
      const totals = {
        contacts: 0,
        conversations: 0,
        messages: 0,
        webhookEvents: 0,
        enquiries: 0,
      };

      // The server clears a bounded slice per call and says whether more is
      // left. Ten calls is far more than the demo seed needs; the cap keeps a
      // surprise from turning into an endless loop.
      let hasMore = true;
      let calls = 0;
      while (hasMore && calls < MAX_RESET_CALLS) {
        const result = await resetDemo({});
        totals.contacts += result.contacts;
        totals.conversations += result.conversations;
        totals.messages += result.messages;
        totals.webhookEvents += result.webhookEvents;
        totals.enquiries += result.enquiries;
        hasMore = result.hasMore;
        calls += 1;
      }

      const removed = [
        `${totals.contacts} contact${totals.contacts === 1 ? "" : "s"}`,
        `${totals.conversations} conversation${totals.conversations === 1 ? "" : "s"}`,
        `${totals.messages} message${totals.messages === 1 ? "" : "s"}`,
        `${totals.enquiries} enquiry${totals.enquiries === 1 ? "" : "ies"}`,
      ].join(", ");

      toast.success(`Removed ${removed}.`);

      if (hasMore) {
        toast.info("Some demo data is still queued. Run the reset again to clear the rest.");
      }
    } catch (error) {
      toast.error(friendlyError(error, "Could not reset the demo data."));
    } finally {
      setResetting(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        {status.demoMode && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border-2 border-warning/50 bg-warning-soft p-4"
          >
            <FlaskConical
              className="mt-0.5 size-5 shrink-0 text-warning"
              aria-hidden
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-warning">
                Demo mode
              </p>
              <p className="mt-1 text-sm text-foreground">
                Nothing here reaches a real customer. Replies are simulated and
                only numbers on the test-recipient list can be messaged.
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                status.connected
                  ? "border-success/25 bg-success-soft text-success"
                  : "border-warning/25 bg-warning-soft text-warning",
              )}
            >
              {status.connected ? (
                <PlugZap className="size-3.5" aria-hidden />
              ) : (
                <TriangleAlert className="size-3.5" aria-hidden />
              )}
              {status.connected
                ? "WhatsApp connected"
                : "WhatsApp not configured"}
            </span>

            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                status.botActive
                  ? "border-success/25 bg-success-soft text-success"
                  : "border-border bg-muted text-muted-foreground",
              )}
            >
              <Bot className="size-3.5" aria-hidden />
              Bot {status.botActive ? "active" : "paused"}
            </span>

            {!status.connected && (
              <span className="text-xs text-muted-foreground">
                Add the WhatsApp credentials to the environment to go live.
              </span>
            )}
          </div>

          {canManage && (
            <div className="flex flex-wrap items-center gap-4">
              {canManage && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="whatsapp-bot-toggle" className="text-sm">
                    Bot replies
                  </Label>
                  <Switch
                    id="whatsapp-bot-toggle"
                    checked={status.botEnabledSetting}
                    disabled={toggling}
                    onCheckedChange={(checked) => void handleBotToggle(checked)}
                    aria-label="Let the bot reply to new WhatsApp messages"
                  />
                </div>
              )}

              {canManage && status.demoMode && (
                <ConfirmDialog
                  trigger={
                    <Button variant="outline" size="sm" disabled={resetting}>
                      {resetting ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      ) : (
                        <RotateCcw className="size-3.5" aria-hidden />
                      )}
                      {resetting ? "Resetting…" : "Reset demo data"}
                    </Button>
                  }
                  title="Reset the WhatsApp demo data?"
                  description={
                    <p>
                      This permanently deletes every demo contact, conversation,
                      message and enquiry. Real traffic is never touched, but
                      the demo threads cannot be brought back.
                    </p>
                  }
                  confirmLabel="Delete demo data"
                  destructive
                  onConfirm={handleResetDemo}
                />
              )}
            </div>
          )}
        </div>

        {!status.botEnabledEnv && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            The environment switch <code className="font-mono">WHATSAPP_BOT_ENABLED</code>{" "}
            is off, so the bot stays paused even with the setting above turned
            on.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
