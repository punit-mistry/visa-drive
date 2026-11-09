"use client";

import { useCallback, useState } from "react";
import type { ZodType } from "zod";

/**
 * Validate-on-click, then live.
 *
 * Nothing is shown while the user is still filling the form in. The first
 * `check()` (a Save / Next / Add click) runs `validate`, reveals every error
 * at once and focuses the first offending field. After that the errors are
 * *derived* from the current values on every render, so they clear the moment
 * the user fixes the field — no effect, no per-keystroke `setErrors`.
 *
 * `validate` returns a map of `elementId -> message`, written in visual order.
 * The key is the id of the control, which is what gets focused.
 *
 * This is a convenience layer only; Convex re-validates every write.
 */
export type FieldErrors = Record<string, string>;

export function useValidation(
  validate: () => FieldErrors,
  /** Errors only show for the scope that was checked (e.g. the wizard step),
   *  so moving to another step starts clean. */
  scope: string | number = "form",
) {
  const [attemptedScope, setAttemptedScope] = useState<string | number | null>(
    null,
  );

  // Changing scope (another wizard step, a dialog reopened on a different
  // record) forgets the attempt, so coming back to a scope starts clean. Done
  // during render rather than in an effect so no stale error is ever painted.
  const [seenScope, setSeenScope] = useState(scope);
  if (seenScope !== scope) {
    setSeenScope(scope);
    setAttemptedScope(null);
  }

  const errors: FieldErrors =
    attemptedScope === scope && seenScope === scope ? validate() : {};

  /** Run the validator. Returns true when the form is valid. */
  const check = useCallback((): boolean => {
    const found = validate();
    setAttemptedScope(scope);
    const first = Object.keys(found)[0];
    if (first) {
      requestAnimationFrame(() => {
        const element = document.getElementById(first);
        element?.scrollIntoView({ block: "center", behavior: "smooth" });
        element?.focus({ preventScroll: true });
      });
      return false;
    }
    return true;
  }, [validate, scope]);

  /** Forget the attempt, e.g. after a successful add resets the form. */
  const reset = useCallback(() => setAttemptedScope(null), []);

  return { errors, check, reset };
}

/** Map a zod parse to `{ key: firstMessage }`. Keys are the first path segment
 *  unless `idFor` renames them to control ids. */
export function zodFieldErrors(
  schema: ZodType,
  values: unknown,
  idFor: (key: string) => string = (key) => key,
): FieldErrors {
  const result = schema.safeParse(values);
  if (result.success) return {};
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = idFor(String(issue.path[0] ?? ""));
    if (key && !(key in errors)) errors[key] = issue.message;
  }
  return errors;
}

/** First message from a single-value schema, or undefined when it passes. */
export function zodMessage(schema: ZodType, value: unknown): string | undefined {
  const result = schema.safeParse(value);
  return result.success ? undefined : result.error.issues[0]?.message;
}
