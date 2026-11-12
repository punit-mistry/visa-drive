"use client";

import { useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { Bot, ClipboardList, MessageCircle, Sparkles } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard, StatGrid } from "@/components/shared/stat-card";
import { NoAccessState, StatCardSkeleton } from "@/components/shared/states";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PERMISSIONS } from "@/lib/constants/roles";
import type { ConversationStatusValue } from "@/lib/constants/statuses";
import { cn } from "@/lib/utils";

import {
  ConnectionStrip,
  ConnectionStripSkeleton,
} from "@/components/admin/whatsapp/connection-strip";
import { ConversationList } from "@/components/admin/whatsapp/conversation-list";
import { ThreadDetails } from "@/components/admin/whatsapp/thread-details";
import { ThreadPanel } from "@/components/admin/whatsapp/thread-panel";

const DESCRIPTION =
  "Every WhatsApp thread your customers have started. Read it, answer it, assign it — and hand it back to the bot when you are done.";

/**
 * The staff WhatsApp inbox.
 *
 * The server re-checks every permission on every call; the checks here only
 * decide what the screen offers to draw. A refused query throws out of
 * `useQuery` and takes the whole route down with it, so nothing is asked for
 * until the permission is known.
 */
export default function AdminWhatsAppPage() {
  const { can } = useCurrentUser();
  const canView = can(PERMISSIONS.WHATSAPP_VIEW);
  const canReply = can(PERMISSIONS.CONVERSATION_REPLY);
  const canAssign = can(PERMISSIONS.CONVERSATION_ASSIGN);
  const canManage = can(PERMISSIONS.WHATSAPP_MANAGE);
  const canViewStaff = can(PERMISSIONS.STAFF_VIEW);

  const [statusFilter, setStatusFilter] = useState<ConversationStatusValue | "">(
    "",
  );
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [selectedId, setSelectedId] = useState<Id<"conversations"> | null>(null);

  const status = useQuery(api.whatsappAdmin.getStatus, canView ? {} : "skip");

  // The roster is only readable by managers, so the assignment picker asks
  // for it only when that permission is there too.
  const staff = useQuery(
    api.users.listStaff,
    canView && canAssign && canViewStaff ? {} : "skip",
  );

  const { results, status: listStatus, loadMore } = usePaginatedQuery(
    api.whatsappAdmin.listConversations,
    canView
      ? {
          status: statusFilter || undefined,
          assignedToMe: assignedToMe || undefined,
        }
      : "skip",
    { initialNumItems: 25 },
  );

  const detail = useQuery(
    api.whatsappAdmin.getConversation,
    canView && selectedId ? { conversationId: selectedId } : "skip",
  );

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader title="WhatsApp" description={DESCRIPTION} />
        <NoAccessState description="The WhatsApp inbox is available to support agents and above. Ask an administrator if you need it." />
      </div>
    );
  }

  const counts = status?.counts;

  return (
    <div className="space-y-6">
      <PageHeader title="WhatsApp" description={DESCRIPTION} />

      {status ? (
        <ConnectionStrip status={status} canManage={canManage} />
      ) : (
        <ConnectionStripSkeleton />
      )}

      {status && counts ? (
        <StatGrid columns={4}>
          <StatCard
            label="Conversations"
            value={counts.capped ? "1000+" : counts.conversations}
            icon={MessageCircle}
            hint={counts.capped ? "Count capped at 1000" : "WhatsApp threads"}
          />
          <StatCard
            label="Enquiries"
            value={counts.capped ? "1000+" : counts.enquiries}
            icon={ClipboardList}
            hint={counts.capped ? "Count capped at 1000" : "Leads from WhatsApp"}
          />
          <StatCard
            label="New leads"
            value={counts.newLeads}
            icon={Sparkles}
            hint="Not contacted yet"
          />
          <StatCard
            label="Bot status"
            value={status.botActive ? "Active" : "Paused"}
            icon={Bot}
            hint={
              status.botActive
                ? "Answering customers automatically"
                : "Waiting for staff"
            }
          />
        </StatGrid>
      ) : (
        <StatCardSkeleton count={4} />
      )}

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)_320px]">
        <div className="lg:col-start-1 lg:row-start-1">
          <ConversationList
            className={cn(selectedId ? "hidden lg:flex" : "flex")}
            items={results}
            isLoading={listStatus === "LoadingFirstPage"}
            selectedId={selectedId}
            onSelect={setSelectedId}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            assignedToMe={assignedToMe}
            onAssignedToMeChange={setAssignedToMe}
            pageStatus={listStatus}
            onLoadMore={loadMore}
          />
        </div>

        <div className="lg:col-start-2 lg:row-start-1">
          <ThreadPanel
            key={selectedId ?? "empty"}
            className={cn(selectedId ? "flex" : "hidden lg:flex")}
            conversationId={selectedId}
            detail={detail}
            isLoading={selectedId !== null && detail === undefined}
            canReply={canReply}
            onBack={() => setSelectedId(null)}
          />
        </div>

        <div className="lg:col-start-2 lg:row-start-2 xl:col-start-3 xl:row-start-1">
          {detail && (
            <ThreadDetails
              key={detail.conversation._id}
              detail={detail}
              canReply={canReply}
              canAssign={canAssign}
              staff={staff}
            />
          )}
        </div>
      </div>
    </div>
  );
}
