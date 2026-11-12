import type { QueryCtx } from "../_generated/server";
import { SETTINGS_DEFAULTS } from "../appSettings";

/**
 * Server-side read of one setting: the stored row if present, otherwise the
 * default from `SETTINGS_DEFAULTS`, otherwise `undefined`. Index read only.
 */
export async function readSetting(ctx: QueryCtx, key: string): Promise<unknown> {
  const row = await ctx.db
    .query("appSettings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  return row ? row.value : SETTINGS_DEFAULTS[key]?.value;
}
