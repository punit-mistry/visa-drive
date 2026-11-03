"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";

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
 * `undefined` while loading, `null` when signed out.
 *
 * A Clerk session and a Convex `users` row are not created at the same moment:
 * the webhook that inserts the row can lag behind first sign-in. Every
 * protected query throws `NO_PROFILE` until it lands, so this hook repairs the
 * gap itself - once the token authenticates but no row exists, it asks the
 * server to create one from the (verified) JWT identity. The reactive
 * `users.current` query then picks the new row up on its own.
 *
 * Permissions come from the server - this hook is for *hiding UI only*. Every
 * protected Convex function re-checks permission independently, so a tampered
 * client gains nothing.
 */
export function useCurrentUser() {
  const user = useQuery(api.users.current);
  const syncProfile = useMutation(api.users.syncFromClerk);
  const { isAuthenticated } = useConvexAuth();
  const [profileIssue, setProfileIssue] = useState<
    "incomplete" | "deleted" | "error" | null
  >(null);

  useEffect(() => {
    // `null` (not `undefined`) means the query has answered and there is no
    // row. Undefined is still loading, and an object means we are done.
    if (user !== null) return;

    // The portal must never spin forever. If nothing has resolved in a few
    // seconds - the deployment is missing `syncFromClerk`, the Clerk JWT
    // template is wrong, the network is wedged - say so and offer a retry
    // instead of an endless "Setting up your account…".
    const stall = setTimeout(() => {
      setProfileIssue((current) => current ?? "error");
    }, 10_000);

    if (!isAuthenticated) {
      return () => clearTimeout(stall);
    }

    let cancelled = false;
    let attempts = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      attempts += 1;
      try {
        const result = await syncProfile({});
        if (cancelled) return;
        // These cannot be fixed by retrying: the token carries no email to
        // key a row on, or the account was deliberately deleted.
        setProfileIssue(result.status === "ready" ? null : result.status);
      } catch (error) {
        console.error("[visadrive] could not set up the Convex profile", error);
        if (cancelled) return;
        if (attempts < 3) {
          retry = setTimeout(run, 1500 * attempts);
        } else {
          // Most often a deployment that has not received the new Convex
          // functions yet. Stop pretending it is still in progress.
          setProfileIssue((current) => current ?? "error");
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
      clearTimeout(stall);
      if (retry) clearTimeout(retry);
    };
  }, [isAuthenticated, user, syncProfile]);

  return useMemo(() => {
    const isLoading = user === undefined;
    const permissions = new Set<string>(user?.permissions ?? []);
    const role = (user?.role ?? "customer") as UserRole;
    const isSuspended = user?.status === "suspended";

    return {
      user: user ?? null,
      isLoading,
      isSignedIn: !isLoading && user !== null,
      /** Authenticated, but the Convex row is still being created. */
      isProfilePending: isAuthenticated && !isLoading && user === null,
      /** Why the profile could not be created automatically, if it could not. */
      profileIssue: user === null ? profileIssue : null,
      role,
      isStaff: !!user && isStaffRole(user.role),
      isSuspended,
      permissions,
      can: (permission: Permission) => permissions.has(permission),
      canAny: (...list: Permission[]) => list.some((p) => permissions.has(p)),
      canAll: (...list: Permission[]) => list.every((p) => permissions.has(p)),
      atLeast: (minimum: UserRole) => !!user && roleAtLeast(role, minimum),
    };
  }, [user, isAuthenticated, profileIssue]);
}

/** Convenience for conditional rendering: `const can = usePermissions();` */
export function usePermissions() {
  const { can, canAny, canAll, permissions, isLoading } = useCurrentUser();
  return { can, canAny, canAll, permissions, isLoading };
}
