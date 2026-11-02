import type { ReactNode } from "react";
import { Suspense } from "react";

import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { WhatsAppButton } from "@/components/shared/whatsapp-button";

/**
 * Public marketing shell: sticky header, content, footer, and the floating
 * WhatsApp entry point that a lot of VisaDrive's customers already use.
 */
export default function MarketingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* The header reads the current pathname for active-link state, which is
          runtime URL data. A Suspense boundary lets the rest of the page
          prerender while the header streams in. */}
      <Suspense fallback={<div className="h-16 border-b border-border" />}>
        <SiteHeader />
      </Suspense>
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <WhatsAppButton />
    </div>
  );
}
