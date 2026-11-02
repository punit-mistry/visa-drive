import { createElement } from "react";
import {
  CalendarClock,
  CalendarSync,
  FileSearch,
  FileText,
  HandCoins,
  Headset,
  MessagesSquare,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The icon names stored in `lib/constants/site.ts` are plain strings so the
 * constants file stays free of React imports. This resolves them, and falls
 * back to a neutral mark rather than rendering nothing if a name is changed.
 */
const ICONS: Record<string, LucideIcon> = {
  CalendarClock,
  CalendarSync,
  FileSearch,
  FileText,
  HandCoins,
  Headset,
  MessagesSquare,
  RefreshCw,
  Route,
  ShieldCheck,
  Users,
};

export function resolveIcon(name: string): LucideIcon {
  return ICONS[name] ?? Sparkles;
}

/** The bare resolved icon, without the surrounding tile. */
export function IconGlyph({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return createElement(resolveIcon(name), {
    className,
    "aria-hidden": true,
  });
}

/** Square, hairline-bordered icon tile used across the marketing sections. */
export function IconTile({
  name,
  className,
  iconClassName,
}: {
  name: string;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-xl border border-border bg-background text-brand",
        className,
      )}
    >
      <IconGlyph name={name} className={iconClassName ?? "size-[18px]"} />
    </span>
  );
}
