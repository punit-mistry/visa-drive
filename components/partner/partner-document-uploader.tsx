"use client";

import { useCallback, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import {
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { PartnerDocumentStatusBadge } from "@/components/shared/status-badge";
import { ListSkeleton } from "@/components/shared/states";
import { formatDate } from "@/lib/helpers/format";
import { validateFile } from "@/lib/constants/documents";
import {
  PARTNER_DOCUMENT_DEFINITIONS,
  type PartnerDocumentStatus,
} from "@/lib/constants/partners";

/**
 * The partner's verification checklist.
 *
 * Same three-step upload the traveller checklist uses — ask the server for a
 * URL, PUT the bytes, record the row — so there is one upload story in the
 * product rather than two. The file is never reachable afterwards except
 * through `documents.getPartnerSignedUrl`, which re-checks who is asking.
 */
export function PartnerDocumentUploader({
  partnerId,
}: {
  /** Omit for the signed-in partner's own documents. */
  partnerId?: Id<"partners">;
}) {
  const convex = useConvex();
  const data = useQuery(api.partnerDocuments.listMine, {});
  const generateUploadUrl = useMutation(api.partnerDocuments.generateUploadUrl);
  const attach = useMutation(api.partnerDocuments.attach);
  const remove = useMutation(api.partnerDocuments.remove);

  const [uploading, setUploading] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File, documentKind: string) => {
      const check = validateFile(file);
      if (!check.ok) {
        toast.error(check.reason);
        return;
      }

      setUploading(documentKind);
      try {
        const url = await generateUploadUrl({ partnerId });

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        if (!response.ok) {
          throw new Error(`Upload failed (${response.status}).`);
        }
        const { storageId } = (await response.json()) as { storageId: string };

        await attach({
          partnerId,
          storageId: storageId as Id<"_storage">,
          documentKind,
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
        });

        toast.success(`${file.name} uploaded.`, {
          description: "Our team will verify it shortly.",
        });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not upload the file.",
        );
      } finally {
        setUploading(null);
      }
    },
    [attach, generateUploadUrl, partnerId],
  );

  async function open(documentId: Id<"partnerDocuments">) {
    setOpening(documentId);
    try {
      const url = await convex.query(api.documents.getPartnerSignedUrl, {
        partnerDocumentId: documentId,
      });
      if (!url) {
        toast.error("That file could not be opened.");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not open the file.",
      );
    } finally {
      setOpening(null);
    }
  }

  if (data === undefined) return <ListSkeleton rows={4} />;

  const byKind = new Map(data.documents.map((d) => [d.documentKind, d]));

  return (
    <div className="space-y-3">
      {PARTNER_DOCUMENT_DEFINITIONS.map((definition) => {
        const document = byKind.get(definition.key);
        const busy = uploading === definition.key;

        return (
          <Card key={definition.key}>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {definition.label}
                    {definition.isMandatory && (
                      <span className="ml-0.5 text-destructive" aria-label="required">
                        *
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {definition.description}
                  </p>
                </div>

                {document && (
                  <PartnerDocumentStatusBadge
                    status={document.status as PartnerDocumentStatus}
                    size="sm"
                  />
                )}
              </div>

              {document ? (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3">
                  <FileText
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{document.fileName}</p>
                    <p className="text-xs text-muted-foreground">
                      Uploaded {formatDate(document.createdAt)}
                      {document.version > 1 ? ` · version ${document.version}` : ""}
                    </p>
                    {document.reviewNote && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {document.status === "rejected" ? "Rejected: " : "Note: "}
                        {document.reviewNote}
                      </p>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => open(document._id)}
                    disabled={opening === document._id}
                  >
                    {opening === document._id ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Download className="size-3.5" aria-hidden />
                    )}
                    View
                  </Button>

                  {document.status === "pending_review" && (
                    <ConfirmDialog
                      title={`Remove ${definition.label}?`}
                      description="You can upload a replacement afterwards."
                      confirmLabel="Remove"
                      destructive
                      onConfirm={async () => {
                        try {
                          await remove({ partnerDocumentId: document._id });
                          toast.success(`${definition.label} removed.`);
                        } catch (error) {
                          toast.error(
                            error instanceof Error
                              ? error.message
                              : "Could not remove the file.",
                          );
                        }
                      }}
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${definition.label}`}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      }
                    />
                  )}
                </div>
              ) : null}

              <div className="mt-3">
                {busy ? (
                  <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-surface px-4 py-6 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Uploading…
                  </div>
                ) : (
                  <FileDropzone
                    compact
                    label={
                      document
                        ? "Upload a replacement"
                        : "Drag and drop, or click to choose"
                    }
                    onFiles={(files) => {
                      const file = files[0];
                      if (file) void upload(file, definition.key);
                    }}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {data.documents.length > 0 &&
        data.documents.every((d) => d.status === "verified") && (
          <p className="flex items-center gap-2 rounded-lg border border-success/25 bg-success-soft px-4 py-3 text-sm text-success">
            <CheckCircle2 className="size-4" aria-hidden />
            Every document you have uploaded is verified.
          </p>
        )}

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Upload className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        PDFs and images up to 10 MB. Uploading a replacement keeps the previous
        version on record rather than overwriting it.
      </p>
    </div>
  );
}
