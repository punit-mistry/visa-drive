import { Scale } from "lucide-react";

import { LEGAL } from "@/lib/constants/site";
import { cn } from "@/lib/utils";

export type LegalKey = keyof typeof LEGAL;

/**
 * Reproduces `LEGAL.*` statements verbatim.
 *
 * These are the client's own words and the only guard the site has against
 * the guarantee-style claims visa marketing tends to attract, so they are
 * never paraphrased, shortened or summarised — this component only chooses
 * which of them to print.
 */
export function LegalNotes({
  keys,
  title = "Important",
  className,
  variant = "panel",
}: {
  keys: LegalKey[];
  title?: string;
  className?: string;
  variant?: "panel" | "plain";
}) {
  const statements: string[] = keys.map((key) => LEGAL[key]);

  if (statements.length === 0) return null;

  if (variant === "plain") {
    return (
      <div className={cn("space-y-2", className)}>
        {statements.map((statement) => (
          <p
            key={statement}
            className="max-w-3xl text-xs leading-relaxed text-muted-foreground"
          >
            {statement}
          </p>
        ))}
      </div>
    );
  }

  return (
    <aside
      className={cn(
        "rounded-2xl border border-border bg-surface p-5 sm:p-6",
        className,
      )}
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Scale className="size-4 text-brand" aria-hidden />
        {title}
      </h2>
      <ul className="mt-3 space-y-2">
        {statements.map((statement) => (
          <li
            key={statement}
            className="max-w-3xl text-sm leading-relaxed text-muted-foreground"
          >
            {statement}
          </li>
        ))}
      </ul>
    </aside>
  );
}
