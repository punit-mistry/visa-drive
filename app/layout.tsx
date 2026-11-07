import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Serif, Manrope } from "next/font/google";

import { FlightTransition } from "@/components/marketing/flight-transition";
import { ThemeProvider } from "@/components/providers/theme-provider";
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

/**
 * Dashboard display face. Used for the headings and figures inside the
 * portal and the CRM only, so the dashboards have their own voice while the
 * body type stays the calm sans. Marketing keeps the editorial serif.
 */
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  display: "swap",
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
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#17141a" },
  ],
  width: "device-width",
  initialScale: 1,
};

/**
 * The root layout carries the document, the fonts, the theme and the page
 * transition — and no authentication.
 *
 * Clerk and the authenticated Convex client are mounted per surface instead
 * (see `AuthenticatedProviders`), because mounting them here meant every
 * visitor to the public site downloaded and ran an authentication SDK to
 * read a page about tourist visas.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${manrope.variable} ${instrumentSerif.variable} ${bricolage.variable}`}
    >
      <body className="min-h-screen bg-background font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
          {/* Mounted at the root, not in the marketing layout: it has to
              outlive the navigation it is animating. It installs nothing
              while the visitor is inside the portal or the CRM. */}
          <FlightTransition />
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
