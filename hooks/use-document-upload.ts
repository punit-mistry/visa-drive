"use client";

import { useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { PendingUpload } from "@/components/shared/file-dropzone";
import { validateFile } from "@/lib/constants/documents";

/**
 * Uploads a file to Convex File Storage and records it against an application.
 *
 * Three steps, in order:
 *   1. `generateUploadUrl` — the server checks the caller may upload here.
 *   2. POST the bytes straight to the returned storage URL.
 *   3. `attach` — record the storageId, supersede any previous version.
 *
 * `XMLHttpRequest` is used rather than `fetch` purely because fetch still has
 * no upload-progress event, and a passport scan on a slow connection needs a
 * progress bar more than it needs a modern API.
 */
export function useDocumentUpload({
  applicationId,
  applicantId,
  onUploaded,
}: {
  applicationId: Id<"applications">;
  applicantId?: Id<"applicants">;
  onUploaded?: (documentId: Id<"documents">) => void;
}) {
  const generateUploadUrl = useMutation(api.documents.generateUploadUrl);
  const attach = useMutation(api.documents.attach);

  const [uploads, setUploads] = useState<PendingUpload[]>([]);

  const patchUpload = useCallback(
    (id: string, patch: Partial<PendingUpload>) => {
      setUploads((current) =>
        current.map((u) => (u.id === id ? { ...u, ...patch } : u)),
      );
    },
    [],
  );

  const removeUpload = useCallback((id: string) => {
    setUploads((current) => current.filter((u) => u.id !== id));
  }, []);

  const upload = useCallback(
    async (
      file: File,
      options: {
        documentKey: string;
        label: string;
        constraints?: { allowedMimeTypes?: string[]; maxSizeBytes?: number };
      },
    ) => {
      const localId = `${file.name}-${file.size}-${Date.now()}`;

      const check = validateFile(file, options.constraints);
      if (!check.ok) {
        toast.error(check.reason);
        return null;
      }

      setUploads((current) => [
        ...current,
        { id: localId, file, progress: 0, status: "uploading" },
      ]);

      try {
        const uploadUrl = await generateUploadUrl({
          applicationId,
          documentKey: options.documentKey,
        });

        const storageId = await putWithProgress(uploadUrl, file, (pct) =>
          patchUpload(localId, { progress: pct }),
        );

        const documentId = await attach({
          applicationId,
          applicantId,
          storageId: storageId as Id<"_storage">,
          documentKey: options.documentKey,
          label: options.label,
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
        });

        patchUpload(localId, { status: "done", progress: 100 });
        onUploaded?.(documentId as Id<"documents">);

        // Clear the row shortly after success — the document now appears in
        // the real checklist, so leaving it here would show it twice.
        setTimeout(() => removeUpload(localId), 1200);

        return documentId as Id<"documents">;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Upload failed. Please try again.";
        patchUpload(localId, { status: "error", error: message });
        toast.error(`Could not upload ${file.name}`, { description: message });
        return null;
      }
    },
    [
      applicantId,
      applicationId,
      attach,
      generateUploadUrl,
      onUploaded,
      patchUpload,
      removeUpload,
    ],
  );

  const uploadMany = useCallback(
    async (
      files: File[],
      options: {
        documentKey: string;
        label: string;
        constraints?: { allowedMimeTypes?: string[]; maxSizeBytes?: number };
      },
    ) => {
      // Sequential, not parallel: several large scans at once on a mobile
      // connection is how uploads start timing out.
      const results = [];
      for (const file of files) {
        results.push(await upload(file, options));
      }
      return results;
    },
    [upload],
  );

  return {
    uploads,
    upload,
    uploadMany,
    removeUpload,
    isUploading: uploads.some((u) => u.status === "uploading"),
  };
}

function putWithProgress(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Content-Type", file.type);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const { storageId } = JSON.parse(xhr.responseText);
          if (!storageId) {
            reject(new Error("The storage service did not return a file id."));
            return;
          }
          resolve(storageId);
        } catch {
          reject(new Error("Unexpected response from the storage service."));
        }
      } else {
        reject(new Error(`Upload failed (${xhr.status}). Please try again.`));
      }
    };

    xhr.onerror = () =>
      reject(new Error("Network error during upload. Check your connection."));
    xhr.ontimeout = () => reject(new Error("The upload timed out."));

    xhr.timeout = 120_000;
    xhr.send(file);
  });
}
