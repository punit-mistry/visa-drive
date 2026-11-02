import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";

import { ConvexClientProvider } from "@/components/providers/convex-client-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { SetupRequired } from "@/components/shared/setup-required";
import { Toaster } from "@/components/ui/sonner";
import { SITE } from "@/lib/constants/site";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
  weight: ["400", "500", "600", "700"],
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
    { media: "(prefers-color-scheme: dark)", color: "#141017" },
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
          // Clerk's own token names. Kept in sync with the brand palette in
          // globals.css so its hosted forms match the rest of the product.
          colorPrimary: "#C62222",
          colorForeground: "#17141A",
          colorMutedForeground: "#716D78",
          colorBorder: "#E7E5EA",
          colorDanger: "#D82828",
          colorSuccess: "#0E9F6E",
          colorWarning: "#D97706",
          borderRadius: "0.625rem",
          fontFamily: "var(--font-inter)",
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
      className={`${inter.variable} ${playfair.variable}`}
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
