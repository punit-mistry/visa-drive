"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";

import { SetupRequired } from "@/components/shared/setup-required";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

/**
 * Created once at module scope. Convex reuses the same websocket across
 * navigations, which is what makes every query in the app live-updating.
 */
const convex = convexUrl
  ? new ConvexReactClient(convexUrl, {
      // Surface dropped connections instead of silently retrying forever.
      verbose: process.env.NODE_ENV === "development",
    })
  : null;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) {
    return (
      <SetupRequired
        title="Convex is not connected"
        missing={["NEXT_PUBLIC_CONVEX_URL"]}
        steps={[
          "Run `npx convex dev` in the project root.",
          "It will create a deployment and write NEXT_PUBLIC_CONVEX_URL into .env.local for you.",
          "Restart `npm run dev`.",
        ]}
      />
    );
  }

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}
