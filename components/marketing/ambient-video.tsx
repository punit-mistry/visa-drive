"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * A silent, looping background video that is always optional.
 *
 * It layers over a still that the caller has already rendered, and it only
 * ever adds to it: the still is the real content and the video is the
 * flourish. It declines to load at all on a phone, or when the visitor has
 * asked for reduced motion or is on a metered or slow connection, and `onError` puts
 * it back to the still if the file is missing or will not decode. There is
 * no broken state to design for, which is what makes it safe to use on a
 * hero.
 *
 * The file is served from this app rather than a third-party CDN — a
 * hotlinked clip is someone else's uptime and someone else's licence.
 */
export function AmbientVideo({
  src,
  className,
  /** Hold the video back until the still has had a moment to paint. */
  delayMs = 400,
}: {
  src: string;
  className?: string;
  delayMs?: number;
}) {
  const reduceMotion = useReducedMotion();
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (reduceMotion) return;

    // Phones never get it. Most of VisaDrive's customers are on a handset on
    // mobile data, and a multi-megabyte decorative loop behind a gradient is
    // not something to spend their data or their battery on. The still that
    // the caller rendered underneath is the whole picture on small screens.
    if (!window.matchMedia("(min-width: 1024px)").matches) return;

    // Respect Data Saver and obviously slow connections: a decorative loop is
    // not worth someone's mobile data.
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    if (connection?.saveData) return;
    if (
      connection?.effectiveType &&
      /^(slow-2g|2g|3g)$/.test(connection.effectiveType)
    ) {
      return;
    }

    const timer = setTimeout(() => setEnabled(true), delayMs);
    return () => clearTimeout(timer);
  }, [reduceMotion, delayMs]);

  if (!enabled) return null;

  return (
    <video
      src={src}
      // No `poster`: the caller's <Image> is already painted underneath, and
      // a poster would fetch the same photograph a second time, unoptimised.
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      aria-hidden
      tabIndex={-1}
      onCanPlay={() => setReady(true)}
      onError={() => setEnabled(false)}
      className={cn(
        "absolute inset-0 size-full object-cover object-center transition-opacity duration-1000",
        ready ? "opacity-100" : "opacity-0",
        className,
      )}
    />
  );
}
