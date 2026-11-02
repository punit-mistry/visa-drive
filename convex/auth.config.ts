/**
 * Convex ↔ Clerk integration.
 *
 * `CLERK_JWT_ISSUER_DOMAIN` must be set on the Convex deployment (not just in
 * .env.local) — set it with:
 *
 *   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-app>.clerk.accounts.dev
 *
 * It is the "Issuer" URL shown on the Clerk dashboard under
 * JWT Templates → convex. The template must be named exactly `convex`, which
 * is what `applicationID` below matches against.
 */
const authConfig = {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
