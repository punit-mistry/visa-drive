import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";

import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { SetupRequired } from "@/components/shared/setup-required";

/**
 * Clerk and an authenticated Convex client, for the three surfaces that need
 * an identity: the portal, the CRM and the auth pages.
 *
 * This deliberately does *not* wrap the public marketing site. Rendering
 * `ClerkProvider` is what pulls clerk-js into a page, and the public pages
 * read nothing that needs a token — so a visitor reading about a Schengen
 * visa no longer downloads an authentication SDK to do it. The marketing
 * header still knows whether someone is signed in; it reads the Clerk cookie
 * instead (see `hooks/use-clerk-session.ts`).
 *
 * Because this is mounted in three layouts rather than one, the appearance
 * block lives here. Those hex values are a copy of the palette in
 * `app/globals.css` — Clerk renders its forms outside our stylesheet, so the
 * two have to be moved together. `lib/notifications/templates.ts` and
 * `lib/payments/razorpay.ts` carry their own copies for the same reason.
 */

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

const CLERK_APPEARANCE = {
  variables: {
    // Clerk's own token names, kept in step with the palette in globals.css
    // so its hosted forms are indistinguishable from ours.
    colorPrimary: "#c62222",
    colorForeground: "#17141a",
    colorMutedForeground: "#716d78",
    colorBorder: "#e7e5ea",
    colorDanger: "#b42318",
    colorSuccess: "#0e9f6e",
    colorWarning: "#d97706",
    borderRadius: "0.625rem",
    fontFamily: "var(--font-manrope)",
  },
  elements: {
    formButtonPrimary:
      "bg-primary hover:bg-brand-deep text-primary-foreground shadow-none",
    card: "shadow-none border border-border",
  },
} as const;

export function AuthenticatedProviders({ children }: { children: ReactNode }) {
  if (!clerkPublishableKey) {
    return (
      <SetupRequired
        title="Clerk is not configured"
        missing={["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY"]}
        steps={[
          "Create a free application at dashboard.clerk.com.",
          "Copy the publishable and secret keys into .env.local.",
          "Add a JWT template named `convex` with claims for email, name and picture (see README).",
          "Run: npx convex env set CLERK_JWT_ISSUER_DOMAIN <issuer-url>",
          "Restart `npm run dev`.",
        ]}
      />
    );
  }

  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      appearance={CLERK_APPEARANCE}
    >
      <ConvexClientProvider>{children}</ConvexClientProvider>
    </ClerkProvider>
  );
}
