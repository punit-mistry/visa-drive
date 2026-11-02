import type { MutationCtx } from "../_generated/server";

/* ============================================================================
 * Human-readable reference numbers.
 *
 * Backed by the `counters` table so numbering survives restarts and never
 * reuses a value. Convex mutations are serialisable transactions, so the
 * read-modify-write below is safe without extra locking.
 * ========================================================================== */

export type ReferenceKind = "application" | "enquiry" | "receipt";

const PREFIX: Record<ReferenceKind, string> = {
  application: "VD",
  enquiry: "ENQ",
  receipt: "RCP",
};

async function nextSequence(ctx: MutationCtx, name: string): Promise<number> {
  const existing = await ctx.db
    .query("counters")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();

  if (!existing) {
    await ctx.db.insert("counters", { name, value: 1 });
    return 1;
  }

  const next = existing.value + 1;
  await ctx.db.patch(existing._id, { value: next });
  return next;
}

/**
 * Generate the next reference for `kind`, e.g. `VD-2026-00042`.
 * Counters reset each calendar year (IST), which is what the office expects.
 */
export async function generateReference(
  ctx: MutationCtx,
  kind: ReferenceKind,
  now: number = Date.now(),
): Promise<string> {
  const year = new Date(now).getUTCFullYear();
  const seq = await nextSequence(ctx, `${kind}:${year}`);
  return `${PREFIX[kind]}-${year}-${String(seq).padStart(5, "0")}`;
}

/** Loose shape check used when a reference arrives from a URL or form. */
export function isValidReference(value: string): boolean {
  return /^(VD|ENQ|RCP)-\d{4}-\d{5}$/.test(value.trim().toUpperCase());
}

export function normaliseReference(value: string): string {
  return value.trim().toUpperCase();
}
