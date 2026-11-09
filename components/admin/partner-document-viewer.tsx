"use client";

import { useEffect, useState } from "react";
import { useConvex, useMutation } from "convex/react";
import { Check, Download, ExternalLink, FileText, Loader2, X } from "lucide-react";
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
import { PartnerDocumentStatusBadge } from "@/components/shared/status-badge";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useValidation, type FieldErrors } from "@/hooks/use-validation";
import { FieldError } from "@/components/shared/form-field";
import { formatDateTime } from "@/lib/helpers/format";
import { PERMISSIONS } from "@/lib/constants/roles";
import type { PartnerDocumentStatus } from "@/lib/constants/partners";
import { friendlyError } from "@/lib/helpers/error-messages";

/**
 * Review a partner's business paperwork in place.
 *
 * Mirrors the traveller-document viewer deliberately: the verdict sits beside
 * the thing being judged, and the URL comes from `documents.getPartnerSignedUrl`
 * — the access-checked way to reach the bytes — rather than being handed
 * around as a link that outlives the review.
 */

type PartnerDocument = Doc<"partnerDocuments"> & { reviewerName?: string | null };

function isImage(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

function isPdf(mimeType: string): boolean {
  return mimeType === "application/pdf" || mimeType.endsWith("/pdf");
}

export function PartnerDocumentViewer({
  documents,
  openId,
  onOpenChange,
}: {
  documents: PartnerDocument[];
  openId: Id<"partnerDocuments"> | null;
  onOpenChange: (id: Id<"partnerDocuments"> | null) => void;
}) {
  const convex = useConvex();
  const review = useMutation(api.partnerDocuments.review);
  const { can } = useCurrentUser();
  const canReview = can(PERMISSIONS.PARTNER_APPROVE);

  /**
   * The resolved URL carries the id it was resolved for, so "is this ready?"
   * is derived rather than reset by an effect — the same shape the traveller
   * document viewer uses. Opening a different document makes the previous
   * result stale by comparison instead of by a `setState` cascade.
   */
  const [resolved, setResolved] = useState<{
    id: Id<"partnerDocuments">;
    url?: string;
    error?: string;
  } | null>(null);
  const [note, setNote] = useState("");
  const [notedFor, setNotedFor] = useState<string | null>(null);
  const [saving, setSaving] = useState<PartnerDocumentStatus | null>(null);

  const document = documents.find((d) => d._id === openId) ?? null;

  // Only a rejection needs a note, so only Reject runs the check.
  const noteValidation = useValidation(
    (): FieldErrors =>
      note.trim().length < 3
        ? { "partner-review-note": "Say why it was rejected — the partner is shown this." }
        : {},
    openId ?? "none",
  );

  const ready = document && resolved?.id === document._id ? resolved : null;
  const loading = document !== null && ready === null;
  const url = ready?.url ?? null;

  // Seeding the note is derived state, not an effect: a reactive re-read must
  // not wipe a verdict the reviewer is halfway through typing.
  const openKey = openId ?? null;
  if (openKey !== notedFor) {
    setNotedFor(openKey);
    setNote(document?.reviewNote ?? "");
  }

  // A signed URL expires, so one is resolved fresh every time the viewer
  // lands on a document rather than cached across opens.
  useEffect(() => {
    if (!document) return;

    const partnerDocumentId = document._id;
    let cancelled = false;

    convex
      .query(api.documents.getPartnerSignedUrl, { partnerDocumentId })
      .then((signed) => {
        if (cancelled) return;
        setResolved(
          signed
            ? { id: partnerDocumentId, url: signed }
            : {
                id: partnerDocumentId,
                error: "This file is no longer available in storage.",
              },
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setResolved({
          id: partnerDocumentId,
          error:
            friendlyError(error, "Could not open this document."),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [convex, document]);

  async function decide(status: PartnerDocumentStatus) {
    if (!document) return;
    if (status === "rejected" && !noteValidation.check()) return;

    setSaving(status);
    try {
      await review({
        partnerDocumentId: document._id,
        status,
        note: note.trim() || undefined,
      });
      toast.success(
        status === "verified"
          ? `${document.label} verified.`
          : `${document.label} rejected.`,
      );
      onOpenChange(null);
    } catch (error) {
      toast.error(
        friendlyError(error, "Could not save the verdict."),
      );
    } finally {
      setSaving(null);
    }
  }

  return (
    <Dialog open={!!openId} onOpenChange={(open) => !open && onOpenChange(null)}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {document?.label ?? "Document"}
            {document && (
              <PartnerDocumentStatusBadge
                status={document.status as PartnerDocumentStatus}
                size="sm"
              />
            )}
          </DialogTitle>
          <DialogDescription>
            {document
              ? `${document.fileName} · uploaded ${formatDateTime(document.createdAt)}${
                  document.version > 1 ? ` · version ${document.version}` : ""
                }`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          {loading ? (
            <div className="flex h-80 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
            </div>
          ) : !url || !document ? (
            <div className="flex h-80 flex-col items-center justify-center gap-3 text-center">
              <FileText className="size-6 text-muted-foreground" aria-hidden />
              <p className="max-w-sm text-sm text-muted-foreground">
                {ready?.error ?? "This file could not be opened."}
              </p>
            </div>
          ) : isImage(document.mimeType) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={document.label}
              className="max-h-[32rem] w-full bg-background object-contain"
            />
          ) : isPdf(document.mimeType) ? (
            <object
              data={url}
              type="application/pdf"
              className="h-[32rem] w-full bg-background"
              aria-label={document.label}
            >
              <div className="flex h-full flex-col items-center justify-center gap-3">
                <p className="text-sm text-muted-foreground">
                  Your browser cannot display this PDF inline.
                </p>
                <Button asChild variant="outline" size="sm">
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3.5" aria-hidden />
                    Open in a new tab
                  </a>
                </Button>
              </div>
            </object>
          ) : (
            <div className="flex h-80 flex-col items-center justify-center gap-3">
              <FileText className="size-6 text-muted-foreground" aria-hidden />
              <Button asChild variant="outline" size="sm">
                <a href={url} target="_blank" rel="noopener noreferrer">
                  <Download className="size-3.5" aria-hidden />
                  Download to view
                </a>
              </Button>
            </div>
          )}
        </div>

        {document?.reviewedAt && (
          <p className="text-xs text-muted-foreground">
            Last reviewed {formatDateTime(document.reviewedAt)}
            {document.reviewerName ? ` by ${document.reviewerName}` : ""}.
          </p>
        )}

        {canReview && document && (
          <div className="space-y-3">
            <Textarea
              id="partner-review-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Note for the partner — required when rejecting."
              aria-label="Review note"
              aria-invalid={noteValidation.errors["partner-review-note"] ? true : undefined}
              aria-describedby={
                noteValidation.errors["partner-review-note"]
                  ? "partner-review-note-error"
                  : undefined
              }
            />
            <FieldError
              id="partner-review-note"
              message={noteValidation.errors["partner-review-note"]}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              {url && (
                <Button asChild variant="ghost" size="sm">
                  <a href={url} target="_blank" rel="noopener noreferrer" download>
                    <Download className="size-3.5" aria-hidden />
                    Download
                  </a>
                </Button>
              )}
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => decide("rejected")}
                  disabled={saving !== null}
                >
                  {saving === "rejected" ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <X className="size-3.5" aria-hidden />
                  )}
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={() => decide("verified")}
                  disabled={saving !== null}
                >
                  {saving === "verified" ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  ) : (
                    <Check className="size-3.5" aria-hidden />
                  )}
                  Verify
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
