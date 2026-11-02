"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState, ListSkeleton } from "@/components/shared/states";
import { formatRelative } from "@/lib/helpers/format";
import { cn } from "@/lib/utils";

export default function NotificationsPage() {
  const notifications = useQuery(api.notifications.listMine, { limit: 100 });
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const [marking, setMarking] = useState(false);

  const unread = notifications?.filter((notification) => !notification.isRead).length ?? 0;

  async function handleMarkAll() {
    setMarking(true);
    try {
      const result = await markAllRead({});
      toast.success(`Marked ${result.marked} notification${result.marked === 1 ? "" : "s"} as read.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update notifications.");
    } finally {
      setMarking(false);
    }
  }

  async function handleMarkRead(notificationId: Id<"notifications">) {
    try {
      await markRead({ notificationId });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update the notification.");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Application updates, payment confirmations, and messages from the team."
        actions={
          <Button
            variant="outline"
            onClick={handleMarkAll}
            disabled={marking || unread === 0}
          >
            <CheckCheck className="size-4" aria-hidden />
            Mark all as read
          </Button>
        }
      />

      {notifications === undefined ? (
        <ListSkeleton rows={6} />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="You're all caught up"
          description="Notifications about your applications and payments will appear here."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {notifications.map((notification) => {
                const content = (
                  <div className="flex gap-3 p-5">
                    <span
                      className={cn(
                        "mt-2 size-2 shrink-0 rounded-full",
                        notification.isRead ? "bg-muted-foreground/30" : "bg-brand",
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "text-sm",
                          notification.isRead ? "text-muted-foreground" : "font-medium text-foreground",
                        )}
                      >
                        {notification.title}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{notification.body}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatRelative(notification.createdAt)}
                      </p>
                    </div>
                    {notification.link && (
                      <ExternalLink className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
                    )}
                  </div>
                );

                return (
                  <li key={notification._id}>
                    {notification.link ? (
                      <Link
                        href={notification.link}
                        onClick={() => {
                          if (!notification.isRead) void handleMarkRead(notification._id);
                        }}
                        className="block transition-colors hover:bg-surface focus-brand"
                      >
                        {content}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          if (!notification.isRead) void handleMarkRead(notification._id);
                        }}
                        className="block w-full text-left transition-colors hover:bg-surface focus-brand"
                      >
                        {content}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
