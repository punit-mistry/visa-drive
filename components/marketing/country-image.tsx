"use client";

import Image from "next/image";
import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Catalogue imagery, with a guaranteed graceful degradation.
 *
 * Two guards, because an admin can paste any URL into the catalogue and a
 * broken image on the homepage is worse than no image at all:
 *   1. the hostname must be one Next is configured to optimise, and
 *   2. a load failure swaps in a typographic panel built from the flag emoji.
 */
const ALLOWED_HOSTS = [
  "images.unsplash.com",
  "plus.unsplash.com",
  "upload.wikimedia.org",
  "res.cloudinary.com",
];

function isAllowedImageUrl(url?: string | null): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return (
      ALLOWED_HOSTS.includes(parsed.hostname) ||
      parsed.hostname.endsWith(".convex.cloud") ||
      parsed.hostname.endsWith(".convex.site")
    );
  } catch {
    return false;
  }
}

/**
 * Editorial defaults for the six launch destinations. These are decoration
 * only — never a source of fact — and an admin-set `cardImageUrl` always wins.
 */
const DEFAULT_IMAGES: Record<string, string> = {
  AE: "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=70",
  VN: "https://images.unsplash.com/photo-1528127269322-539801943592?auto=format&fit=crop&w=1200&q=70",
  JP: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1200&q=70",
  US: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=1200&q=70",
  CN: "https://images.unsplash.com/photo-1508804185872-d7badad00f7d?auto=format&fit=crop&w=1200&q=70",
  SG: "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?auto=format&fit=crop&w=1200&q=70",
};

export function CountryImage({
  src,
  countryCode,
  flagEmoji,
  name,
  className,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px",
  priority = false,
  fallbackTone = "light",
}: {
  src?: string | null;
  countryCode?: string | null;
  flagEmoji?: string | null;
  name: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
  /**
   * The poster card lays white type over this surface, so its fallback has
   * to be dark — a light panel there would leave the country name unreadable
   * for any destination an admin has not given a photo.
   */
  fallbackTone?: "light" | "dark";
}) {
  const candidate =
    (isAllowedImageUrl(src) ? src : undefined) ??
    (countryCode ? DEFAULT_IMAGES[countryCode.toUpperCase()] : undefined);

  const [failed, setFailed] = useState(false);
  const showImage = Boolean(candidate) && !failed;

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        fallbackTone === "dark" ? "bg-ink" : "bg-surface-strong",
        className,
      )}
    >
      {showImage ? (
        <Image
          src={candidate as string}
          alt=""
          fill
          sizes={sizes}
          priority={priority}
          onError={() => setFailed(true)}
          className="object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />
      ) : (
        <div
          aria-hidden
          className={cn(
            "flex h-full w-full flex-col items-center justify-center gap-2",
            fallbackTone === "dark" ? "bg-ink" : "bg-surface-strong",
          )}
        >
          <span className="text-4xl leading-none opacity-90">{flagEmoji ?? "✈"}</span>
          <span
            className={cn(
              "text-eyebrow",
              fallbackTone === "dark" ? "text-white/45" : "text-muted-foreground/80",
            )}
          >
            {name}
          </span>
        </div>
      )}
    </div>
  );
}

export { isAllowedImageUrl };
