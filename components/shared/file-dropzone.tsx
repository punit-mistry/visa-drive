"use client";

import {
  AlertCircle,
  CheckCircle2,
  File as FileIcon,
  FileText,
  ImageIcon,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { useCallback, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  ACCEPT_ATTRIBUTE,
  ACCEPTED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  formatBytes,
  validateFile,
} from "@/lib/constants/documents";
import { cn } from "@/lib/utils";

export interface PendingUpload {
  id: string;
  file: File;
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
}

/**
 * Drag-and-drop file input.
 *
 * Purely presentational — it validates, shows progress and reports files
 * upward. The caller owns the actual upload (see `useDocumentUpload`), which
 * keeps this component usable from both the customer wizard and the admin
 * workspace without either knowing about the other's permissions.
 *
 * Accessibility: the drop area is a real `<label>` wrapping a visually hidden
 * `<input type="file">`, so it is keyboard reachable and announces correctly
 * without any ARIA gymnastics.
 */
export function FileDropzone({
  onFiles,
  uploads = [],
  onRemove,
  accept = ACCEPT_ATTRIBUTE,
  allowedMimeTypes = [...ACCEPTED_MIME_TYPES],
  maxSizeBytes = MAX_UPLOAD_BYTES,
  multiple = false,
  disabled = false,
  label = "Drag and drop, or click to choose",
  hint,
  className,
  compact = false,
}: {
  onFiles: (files: File[]) => void;
  uploads?: PendingUpload[];
  onRemove?: (id: string) => void;
  accept?: string;
  allowedMimeTypes?: string[];
  maxSizeBytes?: number;
  multiple?: boolean;
  disabled?: boolean;
  label?: string;
  hint?: string;
  className?: string;
  compact?: boolean;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  // Nested dragenter/dragleave on children would otherwise flicker the state.
  const dragDepth = useRef(0);

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;

      const incoming = Array.from(fileList);
      const accepted: File[] = [];
      const errors: string[] = [];

      for (const file of multiple ? incoming : incoming.slice(0, 1)) {
        const result = validateFile(file, { allowedMimeTypes, maxSizeBytes });
        if (result.ok) accepted.push(file);
        else errors.push(result.reason);
      }

      setRejected(errors);
      if (accepted.length > 0) onFiles(accepted);

      // Allow re-selecting the same file after a removal.
      if (inputRef.current) inputRef.current.value = "";
    },
    [allowedMimeTypes, maxSizeBytes, multiple, onFiles],
  );

  return (
    <div className={cn("space-y-3", className)}>
      <label
        htmlFor={inputId}
        onDragEnter={(e) => {
          e.preventDefault();
          if (disabled) return;
          dragDepth.current += 1;
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) {
            dragDepth.current = 0;
            setIsDragging(false);
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setIsDragging(false);
          if (disabled) return;
          handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed text-center transition-colors",
          "focus-within:ring-2 focus-within:ring-ring/50 focus-within:ring-offset-2 focus-within:ring-offset-background",
          compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-10",
          isDragging
            ? "border-brand bg-brand-tint"
            : "border-border bg-surface hover:border-border-strong hover:bg-surface-strong",
          disabled && "pointer-events-none cursor-not-allowed opacity-60",
        )}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          onChange={(e) => handleFiles(e.target.files)}
          className="sr-only"
        />

        <div
          className={cn(
            "flex items-center justify-center rounded-xl bg-background elev-sm",
            compact ? "size-8" : "size-10",
          )}
        >
          <Upload
            className={cn(
              isDragging ? "text-brand" : "text-muted-foreground",
              compact ? "size-4" : "size-5",
            )}
            aria-hidden
          />
        </div>

        <div>
          <p className={cn("font-medium", compact ? "text-sm" : "text-sm")}>
            {isDragging ? "Drop to upload" : label}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {hint ?? `PDF, JPG or PNG · up to ${formatBytes(maxSizeBytes)}`}
          </p>
        </div>
      </label>

      {rejected.length > 0 && (
        <ul className="space-y-1.5" role="alert">
          {rejected.map((reason) => (
            <li
              key={reason}
              className="flex items-start gap-2 rounded-lg border border-brand/20 bg-brand-tint px-3 py-2 text-xs text-brand-deep"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {reason}
            </li>
          ))}
        </ul>
      )}

      {uploads.length > 0 && (
        <ul className="space-y-2">
          {uploads.map((upload) => (
            <UploadRow key={upload.id} upload={upload} onRemove={onRemove} />
          ))}
        </ul>
      )}
    </div>
  );
}

function UploadRow({
  upload,
  onRemove,
}: {
  upload: PendingUpload;
  onRemove?: (id: string) => void;
}) {
  const Icon = upload.file.type.startsWith("image/")
    ? ImageIcon
    : upload.file.type === "application/pdf"
      ? FileText
      : FileIcon;

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-surface">
        {upload.status === "uploading" ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
        ) : upload.status === "done" ? (
          <CheckCircle2 className="size-4 text-success" aria-hidden />
        ) : upload.status === "error" ? (
          <AlertCircle className="size-4 text-brand" aria-hidden />
        ) : (
          <Icon className="size-4 text-muted-foreground" aria-hidden />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{upload.file.name}</p>
        {upload.status === "error" ? (
          <p className="mt-0.5 text-xs text-brand">{upload.error}</p>
        ) : upload.status === "uploading" ? (
          <Progress value={upload.progress} className="mt-1.5 h-1" />
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatBytes(upload.file.size)}
            {upload.status === "done" && " · Uploaded"}
          </p>
        )}
      </div>

      {onRemove && upload.status !== "uploading" && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          onClick={() => onRemove(upload.id)}
          aria-label={`Remove ${upload.file.name}`}
        >
          <X className="size-3.5" aria-hidden />
        </Button>
      )}
    </li>
  );
}
