"use client";

import { AlertCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { IncompleteApplication } from "@/lib/helpers/error-messages";

/**
 * "Here is exactly what is still missing", shown after a submit is refused as
 * incomplete. Grouped per traveller, in plain words, with a shortcut to the
 * step that fixes each group. Shared by the customer wizard and the partner
 * wizard so both read the same.
 */
export function IncompleteChecklist({
  info,
  onFix,
  className,
}: {
  info: IncompleteApplication;
  /** Jump to the step that holds the travellers or the documents. */
  onFix?: (target: "travellers" | "documents") => void;
  className?: string;
}) {
  const hasTravellers = info.travellers.some((t) => t.missing.length > 0);

  return (
    <div
      role="alert"
      className={
        className ??
        "rounded-2xl border border-warning/30 bg-warning-soft p-5 animate-fade-up"
      }
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
        <div className="min-w-0 flex-1 space-y-4 text-sm">
          <p className="font-semibold text-foreground">
            A few things still need your attention
          </p>

          {info.problems.length > 0 && (
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              {info.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          )}

          {hasTravellers && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-foreground">Traveller details</p>
                {onFix && (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => onFix("travellers")}
                  >
                    Fix traveller details
                  </Button>
                )}
              </div>
              <ul className="mt-1 space-y-1 text-muted-foreground">
                {info.travellers
                  .filter((t) => t.missing.length > 0)
                  .map((traveller) => (
                    <li key={`${traveller.applicantId ?? "none"}-${traveller.name}`}>
                      <span className="font-medium text-foreground">
                        {traveller.name}
                      </span>
                      {": please fill in "}
                      {traveller.missing.length > 1
                        ? `${traveller.missing.slice(0, -1).join(", ")} and ${
                            traveller.missing[traveller.missing.length - 1]
                          }`
                        : traveller.missing[0]}
                      .
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {info.documents.length > 0 && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-foreground">Still to upload</p>
                {onFix && (
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => onFix("documents")}
                  >
                    Go to documents
                  </Button>
                )}
              </div>
              <ul className="mt-1 list-inside list-disc space-y-1 text-muted-foreground">
                {info.documents.map((document, index) => (
                  <li key={`${document.documentKey}-${document.applicantId ?? index}`}>
                    {document.label}
                    {document.applicantName ? ` (${document.applicantName})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
