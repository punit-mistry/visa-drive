import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * VisaDrive wordmark.
 *
 * Set as type rather than the raster logo so it stays crisp at every size and
 * inherits the current colour. The split — "Visa" in brand red, "Drive" in ink
 * — mirrors the client's existing logo, where "VISA" is red (#D82828) and
 * "DRIVE" is charcoal.
 */
export function Logo({
  className,
  size = "md",
  href = "/",
  onDark = false,
  asLink = true,
}: {
  className?: string;
  size?: "sm" | "md" | "lg";
  href?: string;
  onDark?: boolean;
  asLink?: boolean;
}) {
  const sizeClasses = {
    sm: "text-lg",
    md: "text-xl",
    lg: "text-2xl",
  }[size];

  const content = (
    <span
      className={cn(
        "inline-flex select-none items-baseline font-semibold tracking-[-0.03em]",
        sizeClasses,
        className,
      )}
    >
      <span className="text-brand">Visa</span>
      <span className={onDark ? "text-white" : "text-foreground"}>Drive</span>
    </span>
  );

  if (!asLink) return content;

  return (
    <Link
      href={href}
      className="rounded-sm focus-brand"
      aria-label="VisaDrive — home"
    >
      {content}
    </Link>
  );
}

/**
 * Compact mark for tight spaces (mobile header, favicons, avatars).
 * A red rounded square with a white "V".
 */
export function LogoMark({
  className,
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg bg-brand font-semibold text-white",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.5 }}
      aria-hidden
    >
      V
    </span>
  );
}
