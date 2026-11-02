"use client";

import { useQuery } from "convex/react";
import { useMemo } from "react";

import { api } from "@/convex/_generated/api";
import {
  isStaffRole,
  roleAtLeast,
  type Permission,
  type UserRole,
} from "@/lib/constants/roles";

/**
 * The signed-in VisaDrive user.
 *
 * `undefined` while loading, `null` when signed out. Permissions come from the
 * server — this hook is for *hiding UI only*. Every protected Convex function
 * re-checks permission independently, so a tampered client gains nothing.
 */
export function useCurrentUser() {
  const user = useQuery(api.users.current);

  return useMemo(() => {
    const isLoading = user === undefined;
    const permissions = new Set<string>(user?.permissions ?? []);
    const role = (user?.role ?? "customer") as UserRole;

    return {
      user: user ?? null,
      isLoading,
      isSignedIn: !isLoading && user !== null,
      role,
      isStaff: !!user && isStaffRole(user.role),
      isSuspended: user?.status === "suspended",
      permissions,
      can: (permission: Permission) => permissions.has(permission),
      canAny: (...list: Permission[]) => list.some((p) => permissions.has(p)),
      canAll: (...list: Permission[]) => list.every((p) => permissions.has(p)),
      atLeast: (minimum: UserRole) => !!user && roleAtLeast(role, minimum),
    };
  }, [user]);
}

/** Convenience for conditional rendering: `const can = usePermissions();` */
export function usePermissions() {
  const { can, canAny, canAll, permissions, isLoading } = useCurrentUser();
  return { can, canAny, canAll, permissions, isLoading };
}
