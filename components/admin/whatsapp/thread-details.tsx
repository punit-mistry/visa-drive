"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import {
  Bot,
  ExternalLink,
  Hand,
  Link2,
  Loader2,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LeadStatusBadge } from "@/components/shared/status-badge";
import { friendlyError } from "@/lib/helpers/error-messages";
import { formatDateTime, titleCase } from "@/lib/helpers/format";
import { cn } from "@/lib/utils";

import type { StaffMember, ThreadDetail } from "./types";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-brand";

/**
 * The panel beside the thread: who the customer is, what the bot knows about
 * them, who owns the conversation, and whether the bot or a human is
 * answering.
 */
export function ThreadDetails({
  detail,
  canReply,
  canAssign,
  staff,
}: {
  detail: ThreadDetail;
  canReply: boolean;
  canAssign: boolean;
  staff: StaffMember[] | undefined;
}) {
  const setHandoff = useMutation(api.whatsappAdmin.setHandoff);
  const resumeBot = useMutation(api.whatsappAdmin.resumeBot);
  const assign = useMutation(api.whatsappAdmin.assign);

  const [busy, setBusy] = useState<"handoff" | "resume" | "assign" | null>(null);

  const conversationId = detail.conversation._id;
  const assignedTo = detail.conversation.assignedTo ?? "";

  // `ThreadDetails` is keyed by conversation in the page, so a new thread
  // remounts this state from its own `assignedTo` instead of syncing in an
  // effect.
  const [assignee, setAssignee] = useState<string>(assignedTo);

  async function handleHandoff() {
    setBusy("handoff");
    try {
      await setHandoff({ conversationId });
      toast.success("You have taken over this thread. The bot will not reply.");
    } catch (error) {
      toast.error(friendlyError(error, "Could not take over the conversation."));
    } finally {
      setBusy(null);
    }
  }

  async function handleResume() {
    setBusy("resume");
    try {
      await resumeBot({ conversationId });
      toast.success("The bot has taken the thread back.");
    } catch (error) {
      toast.error(friendlyError(error, "Could not hand the conversation back."));
    } finally {
      setBusy(null);
    }
  }

  async function handleAssign(staffId: string) {
    setBusy("assign");
    try {
      await assign({
        conversationId,
        staffId: staffId ? (staffId as Id<"users">) : null,
      });
      toast.success(staffId ? "Conversation assigned." : "Conversation unassigned.");
    } catch (error) {
      toast.error(friendlyError(error, "Could not change the assignment."));
      // Put the control back on what the server actually holds.
      setAssignee(assignedTo);
    } finally {
      setBusy(null);
    }
  }

  const contact = detail.contact;

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b border-border px-4 py-3">
        <CardTitle className="text-sm">Contact</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand-deep">
            <UserRound className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {contact.profileName || contact.displayName || "Unknown contact"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              +{contact.waId}
            </p>
          </div>
        </div>

        <dl className="space-y-2 text-xs">
          <DetailRow label="WhatsApp number" value={`+${contact.waId}`} />
          <DetailRow
            label="Profile name"
            value={contact.profileName || contact.displayName || "—"}
          />
          <DetailRow
            label="Opted out"
            value={contact.optedOut ? "Yes" : "No"}
            tone={contact.optedOut ? "warning" : undefined}
          />
          <DetailRow
            label="With a staff member"
            value={contact.humanHandoff ? "Yes" : "No"}
            tone={contact.humanHandoff ? "info" : undefined}
          />
          <DetailRow
            label="Demo contact"
            value={contact.isDemo ? "Yes" : "No"}
            tone={contact.isDemo ? "warning" : undefined}
          />
          <DetailRow
            label="Last inbound"
            value={
              contact.lastInboundAt ? formatDateTime(contact.lastInboundAt) : "—"
            }
          />
          <DetailRow
            label="Bot state"
            value={contact.botState ? titleCase(contact.botState) : "—"}
          />
        </dl>

        {detail.enquiry && (
          <div className="rounded-lg border border-border bg-surface p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Link2 className="size-3.5" aria-hidden />
              Linked enquiry
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {detail.enquiry.referenceId} · {detail.enquiry.subject}
            </p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <LeadStatusBadge status={detail.enquiry.leadStatus} size="sm" />
              <Link
                href={`/admin/enquiries/${detail.enquiry._id}`}
                className="inline-flex items-center gap-1 rounded-sm text-xs underline-offset-2 hover:underline focus-brand"
              >
                Open enquiry
                <ExternalLink className="size-3" aria-hidden />
              </Link>
            </div>
          </div>
        )}

        {canReply && (
          <div className="space-y-2 border-t border-border pt-4">
            {contact.humanHandoff ? (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={busy !== null}
                onClick={() => void handleResume()}
              >
                {busy === "resume" ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Bot className="size-3.5" aria-hidden />
                )}
                Hand bot back
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={busy !== null}
                onClick={() => void handleHandoff()}
              >
                {busy === "handoff" ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Hand className="size-3.5" aria-hidden />
                )}
                Take over from bot
              </Button>
            )}
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3 shrink-0" aria-hidden />
              {contact.humanHandoff
                ? "A staff member owns this thread, so the bot stays quiet."
                : "The bot is answering this customer until you take over."}
            </p>
          </div>
        )}

        {canAssign && (
          <div className="space-y-1.5 border-t border-border pt-4">
            <Label htmlFor="whatsapp-assignee">Assigned to</Label>
            <select
              id="whatsapp-assignee"
              value={assignee}
              disabled={busy === "assign"}
              onChange={(event) => {
                setAssignee(event.target.value);
                void handleAssign(event.target.value);
              }}
              className={cn(selectClass, "h-8 text-xs")}
            >
              <option value="">Unassigned</option>
              {(staff ?? []).map((member) => (
                <option key={member._id} value={member._id}>
                  {member.fullName}
                </option>
              ))}
            </select>
            {staff === undefined ? (
              <p className="text-[11px] text-muted-foreground">
                Loading the staff list…
              </p>
            ) : staff.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                No colleagues are available to assign to.
              </p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DetailRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning" | "info";
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "text-right font-medium text-foreground",
          tone === "warning" && "text-warning",
          tone === "info" && "text-info",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
