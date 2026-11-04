"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A country's flag, as an image.
 *
 * Not the emoji. Windows ships no colour glyph for a regional-indicator pair,
 * so `🇦🇪` degrades there to the bare letters "AE" in whatever colour the
 * surrounding text happens to be — which on a dark hero is near-invisible,
 * and which is why the flags looked "dark" at all.
 *
 * The URL is built from the destination's own ISO-3166 alpha-2 code, never
 * from an admin-supplied string, so the catalogue cannot point this anywhere.
 * If the request fails the component falls back to the same mono code tile
 * the destination cards stamp on their photographs, so the row keeps its shape
 * and still says which country it is.
 */

const SIZES = {
  sm: { box: "size-6 rounded", w: 40, text: "text-[9px]" },
  md: { box: "size-9 rounded-lg", w: 80, text: "text-[13px]" },
  lg: { box: "size-12 rounded-lg", w: 120, text: "text-base" },
} as const;

export function CountryFlag({
  countryCode,
  name,
  size = "md",
  className,
}: {
  countryCode: string;
  /** Used for the alt text; omit on purely decorative rows. */
  name?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const code = countryCode.trim().toLowerCase();
  const spec = SIZES[size];

  const valid = /^[a-z]{2}$/.test(code);

  if (!valid || failed) {
    return (
      <span
        aria-hidden
        className={cn(
          "flex shrink-0 items-center justify-center border border-white/20 bg-white/10 font-mono font-bold uppercase tracking-[0.06em] text-white/85",
          spec.box,
          spec.text,
          className,
        )}
      >
        {countryCode.slice(0, 2)}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "relative block shrink-0 overflow-hidden border border-white/20 bg-white/10",
        spec.box,
        className,
      )}
    >
      <Image
        src={`https://flagcdn.com/w${spec.w}/${code}.png`}
        alt={name ? `${name} flag` : ""}
        aria-hidden={name ? undefined : true}
        fill
        sizes={`${spec.w}px`}
        className="object-cover"
        onError={() => setFailed(true)}
        unoptimized
      />
    </span>
  );
}
