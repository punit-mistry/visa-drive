import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    // Destination and visa imagery is admin-configured, so only hosts we have
    // deliberately allowed are optimised. `components/marketing/country-image`
    // checks the same list and falls back to a CSS panel for anything else,
    // which is why a bad URL in the catalogue can never render as a broken
    // image on the public site.
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "plus.unsplash.com" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "**.convex.cloud" },
      { protocol: "https", hostname: "**.convex.site" },
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
