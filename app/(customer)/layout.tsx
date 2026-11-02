import type { ReactNode } from "react";

import { CustomerShell } from "@/components/customer/customer-shell";

/**
 * The portal shell reads the current pathname for active-link state, which is
 * runtime URL data. Portal pages are authenticated and never part of a static
 * shell, so this segment is allowed to block rather than stream the chrome in
 * after the fact.
 */
export const instant = false;

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return <CustomerShell>{children}</CustomerShell>;
}
