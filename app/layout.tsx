import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Manrope } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";

import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { SetupRequired } from "@/components/shared/setup-required";
import { Toaster } from "@/components/ui/sonner";
import { SITE } from "@/lib/constants/site";

import "./globals.css";

/**
 * Editorial pairing: a high-contrast serif carries the display type, a
 * humanist sans carries everything functional — navigation, forms, tables and
 * the whole of the portal and CRM. The serif never appears in UI chrome.
 */
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
  weight: ["400"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.heroSubline,
  applicationName: SITE.name,
  keywords: [
    "visa application",
    "DS-160 form filling",
    "visa appointment assistance",
    "visa interview guidance",
    "tourist visa",
    "business visa",
    "VisaDrive",
    "Mumbai visa consultancy",
  ],
  authors: [{ name: SITE.name, url: SITE.url }],
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: SITE.url,
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.heroSubline,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.heroSubline,
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "/brand/visadrive-logo-sm.png",
    apple: "/brand/visadrive-logo-sm.png",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#17141a" },
  ],
  width: "device-width",
  initialScale: 1,
};

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const body = clerkPublishableKey ? (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      appearance={{
        variables: {
          // Clerk's own token names, kept in step with the palette in
          // globals.css so its hosted forms are indistinguishable from ours.
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
      }}
    >
      <ConvexClientProvider>{children}</ConvexClientProvider>
    </ClerkProvider>
  ) : (
    <SetupRequired
      title="Clerk is not configured"
      missing={[
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
        "CLERK_SECRET_KEY",
      ]}
      steps={[
        "Create a free application at dashboard.clerk.com.",
        "Copy the publishable and secret keys into .env.local.",
        "Add a JWT template named `convex`, then run: npx convex env set CLERK_JWT_ISSUER_DOMAIN <issuer-url>",
        "Restart `npm run dev`.",
      ]}
    />
  );

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${manrope.variable} ${instrumentSerif.variable}`}
    >
      <body className="min-h-screen bg-background font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {body}
          <Toaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{ duration: 4500 }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
