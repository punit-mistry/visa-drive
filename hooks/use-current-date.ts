"use client";

import { useSyncExternalStore } from "react";

/**
 * Time-derived display values.
 *
 * Reading the clock during render makes a prerendered page bake in the build
 * date, which Next.js rejects as an unstable value. `useSyncExternalStore`
 * lets the server snapshot stay empty while the client snapshot reads the
 * clock after hydration, without a `setState` inside an effect.
 *
 * Snapshots are deliberately coarse (a day, a year, a minute) so React sees
 * the same value across calls instead of re-rendering forever.
 */
function subscribeNoop() {
  return () => {};
}

const emptyToday = () => "";
const todayIso = () => new Date().toISOString().slice(0, 10);

/** Today as `YYYY-MM-DD` — use for presentational hints such as `min`. */
export function useTodayIso(): string {
  return useSyncExternalStore(subscribeNoop, todayIso, emptyToday);
}

const nullYear = () => null;
const currentYear = () => new Date().getFullYear();

/** The current calendar year, or `null` while prerendering. */
export function useCurrentYear(): number | null {
  return useSyncExternalStore(subscribeNoop, currentYear, nullYear);
}

const nullMinute = () => null;
const currentMinute = () => Math.floor(Date.now() / 60_000);

/**
 * Current time in epoch milliseconds, rounded down to the minute, or `null`
 * while prerendering. Good enough for promo windows, which do not need
 * millisecond precision.
 */
export function useNow(): number | null {
  const minute = useSyncExternalStore(subscribeNoop, currentMinute, nullMinute);
  return minute === null ? null : minute * 60_000;
}
