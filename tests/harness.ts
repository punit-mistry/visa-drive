/**
 * Shared fixtures for the Convex backend test suite.
 *
 * Nothing here calls a Convex function with elevated arguments: roles, staff
 * profiles and ownership are written straight into the in-memory database with
 * `t.run`, exactly as a real deployment's rows would look. The functions under
 * test then have to decide, on their own, what each caller may do.
 */
import { convexTest } from "convex-test";
import type { TestConvex } from "convex-test";
import schema from "../convex/schema";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { computePricing } from "../lib/helpers/pricing";
import type { UserRole } from "../lib/constants/roles";

/** Every file under `convex/`, including `_generated`, as convex-test needs. */
export const modules = import.meta.glob("../convex/**/*.*s");

export type T = TestConvex<typeof schema>;

let currentTest: T | null = null;

export function newTest(): T {
  currentTest = convexTest(schema, modules);
  return currentTest;
}

/**
 * Let the notification fan-out a mutation scheduled actually run, so it cannot
 * surface later as an unhandled rejection against a closed transaction. The
 * email and WhatsApp actions no-op without their API keys, so nothing leaves
 * the machine.
 */
export async function drainScheduled(): Promise<void> {
  const t = currentTest;
  currentTest = null;
  if (!t) return;

  try {
    // `runAfter(0)` is a real `setTimeout`, so a job can still be *pending*
    // rather than in progress. Yield to the macrotask queue, let whatever
    // started finish, and repeat until the scheduler is empty.
    for (let i = 0; i < 12; i += 1) {
      const outstanding = await t.run(async (ctx) => {
        const jobs = await ctx.db.system.query("_scheduled_functions").collect();
        return jobs.filter(
          (job) => job.state.kind === "pending" || job.state.kind === "inProgress",
        ).length;
      });
      if (outstanding === 0) return;
      await new Promise((resolve) => setTimeout(resolve, 1));
      await t.finishInProgressScheduledFunctions();
    }
  } catch {
    // A function a test deliberately left throwing is not a suite failure.
  }
}

/** `t` scoped to a signed-in Clerk identity. */
export function as(t: T, clerkId: string, extra: Record<string, unknown> = {}) {
  return t.withIdentity({
    subject: clerkId,
    issuer: "https://clerk.test",
    ...extra,
  });
}

/* -------------------------------------------------------------------------- */
/*                                   users                                    */
/* -------------------------------------------------------------------------- */

export interface UserFixture {
  id: Id<"users">;
  clerkId: string;
  email: string;
}

export async function makeUser(
  t: T,
  opts: {
    role?: UserRole;
    clerkId?: string;
    email?: string;
    fullName?: string;
    status?: Doc<"users">["status"];
    /** Create a staffProfile too (default: yes for staff roles). */
    withProfile?: boolean;
    profileActive?: boolean;
    extraPermissions?: string[];
    revokedPermissions?: string[];
  } = {},
): Promise<UserFixture> {
  const role = opts.role ?? "customer";
  const suffix = Math.random().toString(36).slice(2, 8);
  const clerkId = opts.clerkId ?? `clerk_${role}_${suffix}`;
  const email = opts.email ?? `${role}.${suffix}@example.test`;
  const isStaff = role !== "customer";
  const withProfile = opts.withProfile ?? isStaff;

  const id = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {
      clerkId,
      email,
      fullName: opts.fullName ?? `${role} ${suffix}`,
      role,
      status: opts.status ?? "active",
      emailVerified: true,
      applicationCount: 0,
      createdAt: Date.now(),
    });

    if (withProfile) {
      await ctx.db.insert("staffProfiles", {
        userId,
        employeeCode: `VD-S-${suffix}`,
        extraPermissions: opts.extraPermissions ?? [],
        revokedPermissions: opts.revokedPermissions ?? [],
        assignedDestinationIds: [],
        isActive: opts.profileActive ?? true,
        createdAt: Date.now(),
      });
    }

    return userId;
  });

  return { id, clerkId, email };
}

/* -------------------------------------------------------------------------- */
/*                                  catalogue                                 */
/* -------------------------------------------------------------------------- */

export interface CatalogueFixture {
  destinationId: Id<"destinations">;
  productId: Id<"visaProducts">;
}

export async function makeCatalogue(
  t: T,
  opts: {
    published?: boolean;
    paymentMode?: Doc<"visaProducts">["paymentMode"];
    governmentFee?: number;
    serviceFee?: number;
    taxPercent?: number;
    requiredApplicantFields?: string[];
    slug?: string;
  } = {},
): Promise<CatalogueFixture> {
  const now = Date.now();
  const slug = opts.slug ?? `prod-${Math.random().toString(36).slice(2, 8)}`;

  return await t.run(async (ctx) => {
    const destinationId = await ctx.db.insert("destinations", {
      slug: `dest-${slug}`,
      name: "Testland",
      countryCode: "TL",
      flagEmoji: "TL",
      summary: "A destination used by the test suite.",
      currency: "INR",
      highlights: [],
      isPopular: false,
      isPublished: true,
      displayOrder: 1,
      createdAt: now,
      updatedAt: now,
    });

    const productId = await ctx.db.insert("visaProducts", {
      destinationId,
      destinationSlug: `dest-${slug}`,
      slug,
      name: "Tourist visa",
      category: "tourist",
      visaType: "e-Visa",
      shortDescription: "Test product",
      eligibleNationalities: [],
      entryType: "single",
      currency: "INR",
      governmentFee: opts.governmentFee ?? 500_000,
      serviceFee: opts.serviceFee ?? 250_000,
      additionalCharges: 0,
      taxPercent: opts.taxPercent ?? 18,
      paymentMode: opts.paymentMode ?? "pay_now",
      requiredApplicantFields: opts.requiredApplicantFields ?? [],
      isDemoContent: false,
      isPublished: opts.published ?? true,
      displayOrder: 1,
      createdAt: now,
      updatedAt: now,
    });

    return { destinationId, productId };
  });
}

/* -------------------------------------------------------------------------- */
/*                                applications                                */
/* -------------------------------------------------------------------------- */

/**
 * An application written straight into the database, so a test can start from
 * any status without walking the whole wizard.
 */
export async function makeApplication(
  t: T,
  opts: {
    owner: UserFixture;
    catalogue: CatalogueFixture;
    status?: Doc<"applications">["status"];
    isDraft?: boolean;
    paymentStatus?: Doc<"applications">["paymentStatus"];
    paymentMode?: Doc<"applications">["paymentMode"];
    assignedAgentId?: Id<"users">;
    travellerCount?: number;
    reference?: string;
  },
): Promise<Id<"applications">> {
  const now = Date.now();
  const travellerCount = opts.travellerCount ?? 1;
  const status = opts.status ?? "submitted";
  const isDraft = opts.isDraft ?? status === "draft";

  return await t.run(async (ctx) => {
    const product = (await ctx.db.get(opts.catalogue.productId))!;
    const pricing = computePricing({
      currency: product.currency,
      governmentFee: product.governmentFee,
      serviceFee: product.serviceFee,
      additionalCharges: product.additionalCharges,
      taxPercent: product.taxPercent,
      travellerCount,
      now,
    });

    return await ctx.db.insert("applications", {
      referenceId:
        opts.reference ??
        `VD-TEST-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      userId: opts.owner.id,
      destinationId: opts.catalogue.destinationId,
      visaProductId: opts.catalogue.productId,
      destinationName: "Testland",
      visaProductName: product.name,
      customerName: "Test Customer",
      customerEmail: opts.owner.email,
      status,
      paymentStatus: opts.paymentStatus ?? "unpaid",
      paymentMode: opts.paymentMode ?? product.paymentMode,
      travellerCount,
      pricing,
      assignedAgentId: opts.assignedAgentId,
      assignedAt: opts.assignedAgentId ? now : undefined,
      currentStep: 1,
      isDraft,
      documentsRequiredCount: 0,
      documentsApprovedCount: 0,
      submittedAt: isDraft ? undefined : now,
      createdAt: now,
      updatedAt: now,
    });
  });
}

/* -------------------------------------------------------------------------- */
/*                                 assertions                                 */
/* -------------------------------------------------------------------------- */

/** The `code` carried on a `ConvexError`, whichever way it was thrown. */
export function errorCode(error: unknown): string | undefined {
  const data = (error as { data?: unknown })?.data;
  if (data && typeof data === "object" && "code" in data) {
    return String((data as { code: unknown }).code);
  }
  // convex-test re-throws some errors with the payload serialised into the
  // message; fall back to a scan so a test never passes on the wrong failure.
  const message = String((error as { message?: unknown })?.message ?? error);
  const match = message.match(/"code"\s*:\s*"([A-Z_]+)"/);
  return match?.[1];
}

/** Run `fn` and return the ConvexError code it threw, or `null` if it did not. */
export async function codeOf(
  fn: () => Promise<unknown>,
): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (error) {
    return (
      errorCode(error) ??
      `UNKNOWN(${String((error as Error).message).slice(0, 160)})`
    );
  }
}
