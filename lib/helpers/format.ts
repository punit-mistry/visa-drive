/**
 * Display formatting helpers.
 *
 * Everything defaults to en-IN / Asia-Kolkata because that is where VisaDrive
 * and its customers are. Dates are stored as epoch milliseconds throughout.
 */

const LOCALE = "en-IN";
const TIME_ZONE = "Asia/Kolkata";

export function formatDate(
  timestamp?: number | null,
  style: "short" | "medium" | "long" = "medium",
): string {
  if (timestamp == null) return "—";

  const options: Intl.DateTimeFormatOptions =
    style === "short"
      ? { day: "2-digit", month: "short", year: "2-digit" }
      : style === "long"
        ? { day: "numeric", month: "long", year: "numeric" }
        : { day: "numeric", month: "short", year: "numeric" };

  return new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: TIME_ZONE }).format(
    new Date(timestamp),
  );
}

export function formatDateTime(timestamp?: number | null): string {
  if (timestamp == null) return "—";
  return new Intl.DateTimeFormat(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: TIME_ZONE,
  }).format(new Date(timestamp));
}

export function formatTime(timestamp?: number | null): string {
  if (timestamp == null) return "—";
  return new Intl.DateTimeFormat(LOCALE, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: TIME_ZONE,
  }).format(new Date(timestamp));
}

/** "just now", "4 min ago", "yesterday", "12 Mar". */
export function formatRelative(timestamp?: number | null, now = Date.now()): string {
  if (timestamp == null) return "—";

  const diff = now - timestamp;
  const abs = Math.abs(diff);
  const future = diff < 0;

  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const DAY = 24 * HOUR;

  if (abs < 45_000) return "just now";
  if (abs < HOUR) {
    const n = Math.round(abs / MIN);
    return future ? `in ${n} min` : `${n} min ago`;
  }
  if (abs < DAY) {
    const n = Math.round(abs / HOUR);
    return future ? `in ${n} hr` : `${n} hr ago`;
  }
  if (abs < 2 * DAY) return future ? "tomorrow" : "yesterday";
  if (abs < 7 * DAY) {
    const n = Math.round(abs / DAY);
    return future ? `in ${n} days` : `${n} days ago`;
  }

  return formatDate(timestamp, "short");
}

/** Whole days between two timestamps, calendar-aware in IST. */
export function daysBetween(from: number, to: number): number {
  const startOfDay = (ts: number) => {
    const d = new Date(ts + 5.5 * 60 * 60 * 1000);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  };
  return Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000);
}

export function formatDateRange(from?: number | null, to?: number | null): string {
  if (from == null && to == null) return "—";
  if (from != null && to == null) return `From ${formatDate(from)}`;
  if (from == null && to != null) return `Until ${formatDate(to)}`;
  return `${formatDate(from!)} – ${formatDate(to!)}`;
}

/* -------------------------------- people --------------------------------- */

export function initials(name?: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function fullName(parts: {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
}): string {
  return [parts.firstName, parts.middleName, parts.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
}

/** `+917710020694` → `+91 77100 20694`. Leaves anything unexpected alone. */
export function formatPhone(phone?: string | null): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return phone;
}

/** Digits-only form that `wa.me` and `tel:` want. */
export function phoneDigits(phone?: string | null): string {
  return (phone ?? "").replace(/\D/g, "");
}

/** `pr***@example.com` — for showing an address without fully exposing it. */
export function maskEmail(email?: string | null): string {
  if (!email) return "—";
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(1, local.length - 2))}@${domain}`;
}

/** `A1234567` → `A12****7`. Passport numbers should not sit in plain sight. */
export function maskPassport(value?: string | null): string {
  if (!value) return "—";
  if (value.length <= 4) return value;
  return `${value.slice(0, 3)}${"*".repeat(value.length - 4)}${value.slice(-1)}`;
}

/* --------------------------------- text ---------------------------------- */

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

export function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function pluralise(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

export function countLabel(count: number, singular: string, plural?: string): string {
  return `${count} ${pluralise(count, singular, plural)}`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/* --------------------------------- misc ---------------------------------- */

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`;
}

export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(LOCALE, { notation: "compact" }).format(value);
}

/** Escape one CSV field. Used by the export actions and the client download. */
export function csvCell(value: unknown): string {
  if (value == null) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(rows: Array<Record<string, unknown>>, headers?: string[]): string {
  if (rows.length === 0) return "";
  const cols = headers ?? Object.keys(rows[0]);
  const head = cols.map(csvCell).join(",");
  const body = rows.map((row) => cols.map((c) => csvCell(row[c])).join(",")).join("\n");
  return `${head}\n${body}`;
}

/** Trigger a browser download of a generated CSV. Client-side only. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
