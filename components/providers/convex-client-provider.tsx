"use client";

import { useAuth } from "@clerk/nextjs";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import type { ReactNode } from "react";

import { SetupRequired } from "@/components/shared/setup-required";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

/**
 * Created once at module scope. Convex reuses the same websocket across
 * navigations, which is what makes every query in the app live-updating.
 * Both providers below share this one client, so moving between the public
 * site and the portal does not open a second connection.
 */
const convex = convexUrl
  ? new ConvexReactClient(convexUrl, {
      // Surface dropped connections instead of silently retrying forever.
      verbose: process.env.NODE_ENV === "development",
    })
  : null;

function MissingConvex() {
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

/**
 * Convex with a Clerk identity attached. For the portal, the CRM and the auth
 * pages — anywhere a query needs to know who is asking.
 *
 * `useAuth` pulls from Clerk, so this may only be rendered inside a
 * `ClerkProvider`, and rendering it is what loads clerk-js into the page.
 */
export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) return <MissingConvex />;

  return (
    <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
      {children}
    </ConvexProviderWithClerk>
  );
}

/**
 * Convex with no identity, for the public marketing site.
 *
 * Everything the public pages read — destinations, visa products, FAQs, site
 * settings — is published catalogue data that a signed-out visitor is
 * entitled to, so none of it needs a token. Keeping Clerk out of this tree is
 * the point: it is roughly 360KB of JavaScript and a third-party round trip
 * that would otherwise be downloaded and run by every visitor who lands on
 * the homepage, almost none of whom are signed in.
 *
 * The header still shows a signed-in visitor their way back to the portal —
 * see `useClerkSession`, which reads the state from a cookie rather than from
 * a bundle.
 */
export function ConvexPublicProvider({ children }: { children: ReactNode }) {
  if (!convex) return <MissingConvex />;

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
