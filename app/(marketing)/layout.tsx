import type { ReactNode } from "react";
import { Suspense } from "react";

import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { SmoothScroll } from "@/components/providers/smooth-scroll";
import { WhatsAppButton } from "@/components/shared/whatsapp-button";

/**
 * Public marketing shell: header, content, footer, and the floating WhatsApp
 * entry point that a lot of VisaDrive's customers already use.
 *
 * Smooth scrolling is mounted here rather than in the root layout, so it
 * applies to the pages people read and not to the portal wizard or the CRM
 * tables, where an eased scroll gets in the way of working.
 */
export default function MarketingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Reads the current pathname for active-link state, which is runtime
          URL data, so both are suspended to let the rest of the page
          prerender while they stream in. */}
      <Suspense fallback={null}>
        <SmoothScroll />
      </Suspense>
      <Suspense fallback={<div className="h-20 border-b border-border" />}>
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
