import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Route protection.
 *
 * This is the first gate only — it keeps signed-out visitors off private
 * routes and bounces non-staff away from /admin. It is NOT the security
 * boundary: every Convex query/mutation independently re-checks identity,
 * role and ownership, because middleware cannot be trusted for data access.
 */

const isCustomerRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/apply(.*)",
  "/checkout(.*)",
]);

const isAdminRoute = createRouteMatcher(["/admin(.*)"]);

/** Routes that must stay reachable while signed out. */
const isPublicApiRoute = createRouteMatcher([
  "/api/webhooks(.*)",
  "/api/health",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicApiRoute(req)) return NextResponse.next();

  if (isCustomerRoute(req)) {
    // Without an explicit URL, protect() answers a signed-out visitor with a
    // bare 404 — a dead end for anyone who clicked "Start application" while
    // logged out. Send them to sign-in and back to where they were going.
    // The search string matters: /apply?product=<id> starts that application
    // on arrival, and dropping the query would land them on a bare catalogue.
    const signIn = new URL("/sign-in", req.url);
    signIn.searchParams.set(
      "redirect_url",
      req.nextUrl.pathname + req.nextUrl.search,
    );
    await auth.protect({ unauthenticatedUrl: signIn.toString() });
    return NextResponse.next();
  }

  if (isAdminRoute(req)) {
    const { userId, sessionClaims } = await auth();

    if (!userId) {
      const signIn = new URL("/sign-in", req.url);
      signIn.searchParams.set(
        "redirect_url",
        req.nextUrl.pathname + req.nextUrl.search,
      );
      return NextResponse.redirect(signIn);
    }

    // `role` is published into the session token by a Clerk JWT claim that
    // mirrors the Convex users row. Convex re-reads the real role on every
    // call, so a stale or forged claim here only affects which page renders.
    const role = (sessionClaims?.metadata as { role?: string } | undefined)?.role;
    const staffRoles = [
      "support_agent",
      "visa_agent",
      "manager",
      "admin",
      "super_admin",
    ];

    if (role && !staffRoles.includes(role)) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }

    return NextResponse.next();
  }

  return NextResponse.next();
});

/**
 * Only the routes that have something to protect.
 *
 * This used to match every request, which meant Clerk ran on the public
 * marketing pages too — and a Clerk development instance answers the first
 * request from a new browser with a handshake redirect out to
 * `*.clerk.accounts.dev` and back. That round trip was adding roughly a
 * second to the first byte of a page that has nothing to authenticate.
 *
 * Anything not listed here never reaches Clerk, so `auth()` must not be
 * called from those routes. The one API route that uses it, `/api/admin/staff`,
 * is matched below; `/api/webhooks/*` verifies its own Svix signature and
 * deliberately stays outside.
 */
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/apply/:path*",
    "/checkout/:path*",
    "/admin/:path*",
    "/sign-in/:path*",
    "/sign-up/:path*",
    "/api/admin/:path*",
  ],
};
