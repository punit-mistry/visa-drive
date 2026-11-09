import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { z } from "zod";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ROLE_LABELS, STAFF_ROLES, type StaffRole } from "@/lib/constants/roles";
import { staffInviteEmail } from "@/lib/notifications/templates";
import { SITE } from "@/lib/constants/site";

/**
 * Provision a colleague: Clerk sign-in + Convex role + the credentials email.
 *
 * It lives in Next rather than Convex because creating a Clerk account needs
 * `CLERK_SECRET_KEY`, which belongs to the web server, and because the
 * password must reach exactly one place — the colleague's inbox — and never
 * the `notifications` table that `notifications.dispatch` writes to.
 *
 * Authorisation is NOT decided here. The route forwards the caller's own Clerk
 * token to Convex and lets `users.inviteStaff` answer: that is the function
 * holding `staff:manage` and the privilege-escalation guards, and duplicating
 * them here would mean two places to get wrong. Convex is called *first* for
 * exactly that reason — nothing is created in Clerk until the grant is
 * allowed.
 */

// No `export const runtime` here: this project builds with
// `cacheComponents`, which rejects a route segment runtime override. Route
// handlers already run on Node by default, which is what `clerkClient()`
// needs.

const bodySchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(160),
  role: z.enum(STAFF_ROLES as unknown as [StaffRole, ...StaffRole[]]),
  // Blank means "generate one". Clerk enforces its own strength rules on top.
  password: z.string().min(8).max(100).optional().or(z.literal("")),
  designation: z.string().trim().max(120).optional(),
  department: z.string().trim().max(120).optional(),
  sendEmail: z.boolean().optional(),
});

/** A readable password that still has real entropy (~72 bits). */
function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  const core = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  // Guarantee the symbol/digit classes Clerk's default policy looks for.
  return `${core}#7`;
}

function failure(status: number, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}

/** Clerk returns a list of `{ message, longMessage, code }` on a 4xx. */
function clerkErrorMessage(error: unknown, fallback: string): string {
  const errors = (error as { errors?: Array<{ longMessage?: string; message?: string }> })
    ?.errors;
  const first = errors?.[0];
  return first?.longMessage ?? first?.message ?? fallback;
}

export async function POST(request: Request) {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!convexUrl) {
    return failure(503, "The Convex deployment URL is not configured.");
  }
  if (!process.env.CLERK_SECRET_KEY) {
    return failure(
      503,
      "CLERK_SECRET_KEY is not set, so sign-ins cannot be created from here.",
    );
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

  const { fullName, email, role, designation, department } = parsed;
  const convex = new ConvexHttpClient(convexUrl);
  convex.setAuth(token);

  /* ---------------------------------------------------------------- 1. grant */
  // Permission, role-escalation and last-super-admin guards all live here.
  let invited: { userId: Id<"users">; promoted: boolean };
  try {
    invited = await convex.mutation(api.users.inviteStaff, {
      email,
      fullName,
      role,
      designation: designation || undefined,
      department: department || undefined,
    });
  } catch (error) {
    const data = (error as { data?: { code?: string; message?: string } })?.data;
    const message = data?.message ?? "Could not grant that role.";
    const status = data?.code === "FORBIDDEN" ? 403 : 400;
    return failure(status, message);
  }

  /* ----------------------------------------------------------- 2. the sign-in */
  const clerk = await clerkClient();
  const [firstName, ...restOfName] = fullName.split(/\s+/);
  const lastName = restOfName.join(" ") || undefined;

  let password: string | undefined;
  let clerkUserId: string | null = null;
  let accountNote: "created" | "existing" = "created";

  try {
    const existing = await clerk.users.getUserList({ emailAddress: [email] });
    if (existing.totalCount > 0) {
      // They already sign in to VisaDrive — this was a promotion, not a new
      // account. Their password is theirs; we neither know nor reset it.
      clerkUserId = existing.data[0].id;
      accountNote = "existing";
    } else {
      password = parsed.password || generatePassword();
      const created = await clerk.users.createUser({
        emailAddress: [email],
        password,
        firstName,
        lastName,
        skipPasswordChecks: false,
      });
      clerkUserId = created.id;
    }
  } catch (error) {
    console.error("[admin/staff] Clerk account provisioning failed", error);
    return failure(
      400,
      clerkErrorMessage(error, "Could not create the sign-in for that email address."),
      {
        // The Convex row exists and carries the role, so say so rather than
        // letting the operator think nothing happened.
        partial: true,
        userId: invited.userId,
      },
    );
  }

  /* -------------------------------------------------------------- 3. link it */
  // Only rewrites a `pending:` placeholder, so promoting somebody who already
  // had an account is a no-op here rather than a repointed login.
  let linked = false;
  if (clerkUserId) {
    try {
      await convex.mutation(api.users.linkClerkAccount, {
        userId: invited.userId,
        clerkId: clerkUserId,
      });
      linked = true;
    } catch (error) {
      const code = (error as { data?: { code?: string } })?.data?.code;
      if (code !== "ALREADY_LINKED") {
        console.error("[admin/staff] could not link the Clerk account", error);
      }
    }
  }

  /* ------------------------------------------------------------- 4. the email */
  const wantsEmail = parsed.sendEmail !== false;
  let emailed: "sent" | "skipped" | "failed" = "skipped";
  let emailReason: string | undefined;

  if (wantsEmail) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      emailReason = "RESEND_API_KEY is not set on this server.";
      console.log(
        `[admin/staff] credentials email skipped (RESEND_API_KEY unset) to=${email}`,
      );
    } else {
      const inviter = await clerk.users.getUser(userId).catch(() => null);
      const rendered = staffInviteEmail({
        fullName,
        email,
        roleLabel: ROLE_LABELS[role],
        password,
        designation: designation || undefined,
        signInUrl: `${SITE.url.replace(/\/$/, "")}/sign-in`,
        invitedByName:
          [inviter?.firstName, inviter?.lastName].filter(Boolean).join(" ") || undefined,
      });

      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM_EMAIL ?? "VisaDrive <notifications@visadrive.in>",
            to: [email],
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
            ...(process.env.RESEND_REPLY_TO
              ? { reply_to: process.env.RESEND_REPLY_TO }
              : {}),
          }),
        });

        if (response.ok) {
          emailed = "sent";
        } else {
          emailed = "failed";
          emailReason = `Resend returned ${response.status}.`;
          console.error(
            "[admin/staff] Resend rejected the credentials email",
            (await response.text()).slice(0, 400),
          );
        }
      } catch (error) {
        emailed = "failed";
        emailReason = "The email could not be sent.";
        console.error("[admin/staff] credentials email failed", error);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    userId: invited.userId,
    promoted: invited.promoted,
    account: accountNote,
    linked,
    email: { status: emailed, reason: emailReason },
    // Returned once so the operator can hand it over in person when the email
    // has not gone out. It is never persisted anywhere.
    password: password ?? null,
  });
}
