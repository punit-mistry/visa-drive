import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Create a sign-in for a B2B partner: Clerk account + link to the partner row.
 *
 * Mirrors `app/api/admin/staff/route.ts`. Lives in Next because creating a
 * Clerk account needs `CLERK_SECRET_KEY`. Authorisation is NOT decided here:
 * `partners.prepareLogin` (which requires `partner:manage`) is called first, so
 * a refused caller never causes a Clerk account to be created. The link step
 * is `partners.linkLogin`, which enforces the same permission again.
 *
 * The password is returned once, to the operator, and stored nowhere.
 */

const bodySchema = z.object({
  partnerId: z.string().min(1),
  // Blank means "generate one". Clerk enforces its own strength rules on top.
  password: z.string().min(8).max(100).optional().or(z.literal("")),
});

/** A readable password with real entropy, meeting Clerk's default policy. */
function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  const core = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `${core}#7`;
}

function failure(status: number, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}

function clerkErrorMessage(error: unknown, fallback: string): string {
  const errors = (error as { errors?: Array<{ longMessage?: string; message?: string }> })
    ?.errors;
  const first = errors?.[0];
  return first?.longMessage ?? first?.message ?? fallback;
}

export async function POST(request: Request) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) return failure(503, "The Convex deployment URL is not configured.");
  if (!process.env.CLERK_SECRET_KEY) {
    return failure(503, "CLERK_SECRET_KEY is not set, so sign-ins cannot be created from here.");
  }

  const { userId, getToken } = await auth();
  if (!userId) return failure(401, "You must be signed in.");

  const token = await getToken({ template: "convex" });
  if (!token) {
    return failure(
      401,
      "Could not read your Convex session token. Check the Clerk JWT template named `convex`.",
    );
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return failure(400, "Please check the details and try again.");
  }

  const convex = new ConvexHttpClient(convexUrl);
  convex.setAuth(token);

  /* ---------------------------------------------------------------- 1. grant */
  let prepared: { email: string; agencyName: string; contactPersonName: string; hasSignIn: boolean };
  try {
    prepared = await convex.query(api.partners.prepareLogin, {
      partnerId: parsed.partnerId as Id<"partners">,
    });
  } catch (error) {
    const data = (error as { data?: { code?: string; message?: string } })?.data;
    const status = data?.code === "FORBIDDEN" ? 403 : 400;
    return failure(status, data?.message ?? "Could not create a sign-in for that partner.");
  }

  /* ----------------------------------------------------------- 2. the sign-in */
  const clerk = await clerkClient();
  const nameParts = prepared.contactPersonName.trim().split(/\s+/);
  const firstName = nameParts[0] || undefined;
  const lastName = nameParts.slice(1).join(" ") || undefined;

  let password: string | undefined;
  let clerkUserId: string;
  let accountNote: "created" | "existing" = "created";

  try {
    const existing = await clerk.users.getUserList({ emailAddress: [prepared.email] });
    if (existing.totalCount > 0) {
      // Already has an account on this email. Their password is theirs; a
      // new one is only set when the operator explicitly supplies it.
      clerkUserId = existing.data[0].id;
      accountNote = "existing";
      if (parsed.password) {
        await clerk.users.updateUser(clerkUserId, { password: parsed.password });
        password = parsed.password;
      }
    } else {
      password = parsed.password || generatePassword();
      const created = await clerk.users.createUser({
        emailAddress: [prepared.email],
        password,
        firstName,
        lastName,
        skipPasswordChecks: false,
      });
      clerkUserId = created.id;
    }
  } catch (error) {
    console.error("[admin/partners/login] Clerk account provisioning failed", error);
    return failure(
      400,
      clerkErrorMessage(error, "Could not create the sign-in for that email address."),
    );
  }

  /* -------------------------------------------------------------- 3. link it */
  try {
    await convex.mutation(api.partners.linkLogin, {
      partnerId: parsed.partnerId as Id<"partners">,
      clerkId: clerkUserId,
    });
  } catch (error) {
    const data = (error as { data?: { code?: string; message?: string } })?.data;
    return failure(
      409,
      data?.message ??
        "The sign-in was created but could not be attached to the partner. Check the partner record.",
      { partial: true },
    );
  }

  return NextResponse.json({
    ok: true,
    email: prepared.email,
    account: accountNote,
    // Only present when a password was generated or supplied in this request.
    password: password ?? null,
    message:
      accountNote === "created"
        ? "Sign-in created. Share the password with the partner now — it is not shown again."
        : password
          ? "Existing account found. Its password has been reset to the one you set."
          : "Existing account found and linked. Its password is unchanged.",
  });
}
