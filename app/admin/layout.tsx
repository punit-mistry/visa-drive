import type { ReactNode } from "react";

import { AdminShell } from "@/components/admin/admin-shell";

/**
 * The CRM shell reads the current pathname for active-link state, which is
 * runtime URL data. Admin pages are authenticated and never part of a static
 * shell, so this segment is allowed to block rather than stream the chrome in
 * after the fact.
 */
export const instant = false;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
