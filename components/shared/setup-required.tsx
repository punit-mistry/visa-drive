import { AlertTriangle, Terminal } from "lucide-react";

/**
 * Shown instead of a crash when a required integration is not configured.
 * Keeps local development usable before Convex/Clerk/Razorpay keys exist,
 * and tells the developer exactly which variable is missing.
 */
export function SetupRequired({
  title,
  missing,
  steps,
}: {
  title: string;
  missing: string[];
  steps: string[];
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-16">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-8 elev-md">
        <div className="flex size-11 items-center justify-center rounded-xl bg-warning-soft">
          <AlertTriangle className="size-5 text-warning" aria-hidden />
        </div>

        <h1 className="mt-5 text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          VisaDrive needs this configured before the app can run.
        </p>

        <div className="mt-6 rounded-xl border border-border bg-surface p-4">
          <p className="text-eyebrow">Missing environment variables</p>
          <ul className="mt-2 space-y-1">
            {missing.map((key) => (
              <li key={key} className="font-mono text-sm text-foreground">
                {key}
              </li>
            ))}
          </ul>
        </div>

        <ol className="mt-6 space-y-3">
          {steps.map((step, index) => (
            <li key={step} className="flex gap-3 text-sm">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-semibold text-background">
                {index + 1}
              </span>
              <span className="pt-0.5 text-muted-foreground">{step}</span>
            </li>
          ))}
        </ol>

        <p className="mt-6 flex items-center gap-2 border-t border-border pt-5 text-xs text-muted-foreground">
          <Terminal className="size-3.5" aria-hidden />
          See <span className="font-mono">.env.example</span> for the full list.
        </p>
      </div>
    </div>
  );
}
