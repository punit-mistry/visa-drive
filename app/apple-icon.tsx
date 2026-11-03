import { ImageResponse } from "next/og";

/**
 * iOS home-screen icon.
 *
 * Apple will not take an SVG for `apple-touch-icon`, so this one is
 * rasterised at build time from the same mark as `app/icon.svg`. Generating
 * it rather than committing a PNG means the two can never drift apart, and
 * the brand red lives in one place per file rather than in a binary nobody
 * can diff.
 *
 * iOS applies its own rounding and never uses transparency, so this draws a
 * full-bleed red field with no corner radius of its own.
 */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#D82828",
        }}
      >
        <svg width="112" height="112" viewBox="0 0 64 64">
          <path
            d="M14 18 L23 18 L32 38 L41 18 L50 18 L36 47 L28 47 Z"
            fill="#FFFFFF"
          />
        </svg>
      </div>
    ),
    size,
  );
}
