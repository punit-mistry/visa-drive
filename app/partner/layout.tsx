import type { ReactNode } from "react";

import { AuthenticatedProviders } from "@/components/providers/authenticated-providers";
import { PartnerShell } from "@/components/partner/partner-shell";

/**
 * The partner portal shell reads the current pathname for active-link state,
 * which is runtime URL data. Partner pages are authenticated and never part
 * of a static shell, so this segment blocks rather than streaming the chrome
 * in after the fact — the same choice the customer portal and the CRM make.
 */
export const instant = false;

export default function PartnerLayout({ children }: { children: ReactNode }) {
  return (
    <AuthenticatedProviders>
      <PartnerShell>{children}</PartnerShell>
    </AuthenticatedProviders>
  );
}
