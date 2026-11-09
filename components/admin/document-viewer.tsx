"use client";

import { useCallback, useEffect, useState } from "react";
import { useConvex, useMutation } from "convex/react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DocumentStatusBadge } from "@/components/shared/status-badge";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useValidation, type FieldErrors } from "@/hooks/use-validation";
import { FieldError } from "@/components/shared/form-field";
import { formatDateTime } from "@/lib/helpers/format";
import { PERMISSIONS } from "@/lib/constants/roles";
import { friendlyError } from "@/lib/helpers/error-messages";

/**
 * In-place document viewer for the CRM.
 *
 * Staff were opening passport scans in a new browser tab, which is both a
 * worse review experience (no checklist, no next/previous, no verdict) and a
 * worse privacy story (the signed URL sits in browsing history and can be
 * re-shared while it is alive). This keeps the file inside the application it
 * belongs to, and puts the approve/reject verdict next to the thing being
 * judged.
 *
 * The URL still comes from `documents.getSignedUrl` — the one access-checked
 * place in the codebase that mints one — so the viewer shows exactly what the
 * server is willing to show this caller, and nothing more.
 */

export type ViewableDocument = Doc<"documents">;

function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

function isPdf(mimeType: string): boolean {
  return mimeType === "application/pdf" || mimeType.endsWith("/pdf");
}

export function DocumentViewer({
  documents,
  openId,
  onOpenChange,
}: {
  documents: ViewableDocument[];
  /** The document to show, or `null` when the viewer is closed. */
  openId: Id<"documents"> | null;
  onOpenChange: (id: Id<"documents"> | null) => void;
}) {
  const convex = useConvex();
  const review = useMutation(api.documents.review);
  const { can } = useCurrentUser();
  const canReview = can(PERMISSIONS.DOCUMENT_REVIEW);

  /**
   * The resolved URL carries the id it was resolved for, so "is this ready?"
   * is derived rather than reset by an effect. That keeps state changes out of
   * the effect body entirely: paging to the next document makes the previous
   * result stale by comparison instead of by a `setState` cascade.
   */
  const [resolved, setResolved] = useState<{
    id: Id<"documents">;
    url?: string;
    error?: string;
  } | null>(null);
  const [rejectingFor, setRejectingFor] = useState<Id<"documents"> | null>(null);
  const [reason, setReason] = useState("");
  const reasonValidation = useValidation(
    (): FieldErrors =>
      reason.trim().length < 3
        ? { "rejection-reason": "Tell the customer what is wrong — they see this text." }
        : {},
    rejectingFor ?? "none",
  );
  const [saving, setSaving] = useState(false);

  const index = documents.findIndex((d) => d._id === openId);
  const current = index >= 0 ? documents[index] : null;

  const ready = current && resolved?.id === current._id ? resolved : null;
  const loading = current !== null && ready === null;
  const url = ready?.url ?? null;
  const failed = ready?.error ?? null;
  const rejecting = current !== null && rejectingFor === current._id;

  const go = useCallback(
    (delta: number) => {
      if (index < 0) return;
      const next = documents[index + delta];
      if (next) onOpenChange(next._id);
    },
    [documents, index, onOpenChange],
  );

  // Resolve a fresh signed URL every time the viewer lands on a document.
  // They expire, so caching one across opens would show a broken frame.
  useEffect(() => {
    if (!current) return;

    const documentId = current._id;
    let cancelled = false;

    convex
      .query(api.documents.getSignedUrl, { documentId })
      .then((signed) => {
        if (cancelled) return;
        setResolved(
          signed
            ? { id: documentId, url: signed }
            : { id: documentId, error: "This file is no longer available in storage." },
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setResolved({
          id: documentId,
          error:
            friendlyError(error, "Could not open this document."),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [convex, current]);

  // Arrow keys page through the checklist the way a reviewer expects.
  useEffect(() => {
    if (!current) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") go(1);
      if (event.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, go]);

  async function decide(status: "approved" | "rejected") {
    if (!current) return;
    if (status === "rejected" && !reasonValidation.check()) return;

    setSaving(true);
    try {
      await review({
        documentId: current._id,
        status,
        ...(status === "rejected" ? { rejectionReason: reason.trim() } : {}),
      });
      toast.success(
        status === "approved" ? "Document approved." : "Document rejected.",
      );
      setRejectingFor(null);
      setReason("");
      // Move to the next unreviewed file so a checklist flows in one pass.
      const next = documents
        .slice(index + 1)
        .find((d) => d.status === "pending_review");
      if (next) onOpenChange(next._id);
    } catch (error) {
      toast.error(
        friendlyError(error, "Could not record that decision."),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={current !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(null);
      }}
    >
      <DialogContent className="max-w-4xl gap-0 p-0 sm:max-w-4xl">
        {current && (
          <>
            <DialogHeader className="border-b border-border px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pr-8">
                <div className="min-w-0">
                  <DialogTitle className="truncate text-base">
                    {current.label}
                  </DialogTitle>
                  <DialogDescription className="truncate text-xs">
                    {current.fileName} · v{current.version} · uploaded{" "}
                    {formatDateTime(current.createdAt)}
                  </DialogDescription>
                </div>
                <div className="flex items-center gap-2">
                  <DocumentStatusBadge status={current.status} />
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {index + 1} / {documents.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => go(-1)}
                    disabled={index <= 0}
                    aria-label="Previous document"
                  >
                    <ChevronLeft className="size-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => go(1)}
                    disabled={index >= documents.length - 1}
                    aria-label="Next document"
                  >
                    <ChevronRight className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            </DialogHeader>

            <div className="flex min-h-[55vh] items-center justify-center bg-surface p-4">
              {loading ? (
                <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" aria-hidden />
                  Opening the file…
                </div>
              ) : failed ? (
                <div className="max-w-sm text-center text-sm text-muted-foreground">
                  <FileText className="mx-auto mb-2 size-6" aria-hidden />
                  {failed}
                </div>
              ) : url && isImage(current.mimeType) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt={current.label}
                  className="max-h-[70vh] w-auto rounded-lg border border-border bg-background object-contain"
                />
              ) : url && isPdf(current.mimeType) ? (
                <iframe
                  src={url}
                  title={current.label}
                  className="h-[70vh] w-full rounded-lg border border-border bg-background"
                />
              ) : (
                <div className="max-w-sm text-center text-sm text-muted-foreground">
                  <FileText className="mx-auto mb-2 size-6" aria-hidden />
                  This file type cannot be previewed in the browser. Download it
                  to open it.
                </div>
              )}
            </div>

            {current.status === "rejected" && current.rejectionReason && (
              <p className="border-t border-border bg-background px-5 py-3 text-sm text-destructive">
                Rejected: {current.rejectionReason}
              </p>
            )}

            {rejecting && (
              <div className="space-y-2 border-t border-border bg-background px-5 py-4">
                <label
                  htmlFor="rejection-reason"
                  className="text-[13px] font-medium"
                >
                  Why is this being rejected?
                </label>
                <Textarea
                  id="rejection-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  aria-invalid={reasonValidation.errors["rejection-reason"] ? true : undefined}
                  aria-describedby={
                    reasonValidation.errors["rejection-reason"]
                      ? "rejection-reason-error"
                      : undefined
                  }
                  placeholder="The customer sees this — be specific. e.g. The passport photo page is cut off at the bottom."
                  rows={2}
                />
                <FieldError
                  id="rejection-reason"
                  message={reasonValidation.errors["rejection-reason"]}
                />
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-background px-5 py-3">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!url}
                  onClick={() => url && window.open(url, "_blank", "noopener,noreferrer")}
                >
                  <ExternalLink className="size-3.5" aria-hidden />
                  Open in a tab
                </Button>
                <Button variant="outline" size="sm" asChild disabled={!url}>
                  <a href={url ?? "#"} download={current.fileName}>
                    <Download className="size-3.5" aria-hidden />
                    Download
                  </a>
                </Button>
              </div>

              {canReview && (
                <div className="flex gap-2">
                  {rejecting ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRejectingFor(null)}
                        disabled={saving}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => decide("rejected")}
                        disabled={saving}
                      >
                        {saving && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                        Confirm rejection
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => current && setRejectingFor(current._id)}
                        disabled={saving || current.status === "rejected"}
                      >
                        <X className="size-3.5" aria-hidden />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => decide("approved")}
                        disabled={saving || current.status === "approved"}
                      >
                        {saving ? (
                          <Loader2 className="size-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Check className="size-3.5" aria-hidden />
                        )}
                        Approve
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
