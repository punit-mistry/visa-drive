import { ConvexError, v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import {
  internalAction,
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getAuthUser, requirePermission } from "./lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "./lib/audit";
import { isLeadDestination } from "./lib/destinationOrder";
import { generateReference } from "./lib/references";
import { PERMISSIONS } from "../lib/constants/roles";
import { DOCUMENT_TYPE_MAP, MAX_UPLOAD_BYTES } from "../lib/constants/documents";
import type { ApplicationStatus } from "../lib/constants/statuses";
import { computePricing } from "../lib/helpers/pricing";
import { SITE } from "../lib/constants/site";
import {
  DEMO_CLERK_PREFIX,
  DEMO_EMAIL_DOMAIN,
  DEMO_FEE_NOTICE,
  SEED_CONVERSATION_OPENERS,
  SEED_CUSTOMERS,
  SEED_ENQUIRY_MESSAGES,
  SEED_ENQUIRY_SUBJECTS,
  SEED_DESTINATIONS,
  SEED_GLOBAL_FAQS,
  SEED_STAFF,
  SEED_STAFF_REPLIES,
  SEED_TESTIMONIALS,
  demoClerkId,
  demoEmail,
  type SeedDestination,
  type SeedProduct,
} from "./seedData";

/* ============================================================================
 * Demo environment seeding.
 *
 * `run` is idempotent: the catalogue is upserted by its natural keys
 * (destination slug, destination+product slug, product+document key), and the
 * transactional demo data is only generated when none exists yet. Running it
 * twice leaves you with exactly one copy of everything.
 *
 * Honesty rules enforced here — see also the header of `seedData.ts`:
 *   • every seeded product gets `isDemoContent: true` and
 *     `lastVerifiedAt: undefined`;
 *   • `DEMO_FEE_NOTICE` is appended to every product's
 *     `importantInformation`, so a placeholder fee can never read as official;
 *   • demo people have obviously fictional names and `@example.com`
 *     addresses, and all of them live under the `seed_demo_` clerk prefix;
 *   • testimonials are written as explicit placeholders carrying
 *     `isDemo: true`.
 * ========================================================================== */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** How far back demo transactional data is spread, so charts have a shape. */
const SPREAD_DAYS = 90;

/** appSettings key holding the seed manifest, used by `status` and `reset`. */
const SEED_META_KEY = "system.demoSeed";
const TESTIMONIALS_KEY = "content.testimonials";

const SEED_VERSION = 1;

/* -------------------------------------------------------------------------- */
/*                                    auth                                    */
/* -------------------------------------------------------------------------- */

/**
 * Seeding is allowed when the caller holds `seed:run`, OR when the `users`
 * table is empty — which is the only way to bootstrap a fresh local
 * deployment that has no admin to grant the permission yet.
 */
async function assertCanSeed(
  ctx: MutationCtx | QueryCtx,
): Promise<{ actor: Doc<"users"> | null; bootstrapped: boolean }> {
  const anyUser = await ctx.db.query("users").take(1);

  if (anyUser.length === 0) {
    return { actor: await getAuthUser(ctx), bootstrapped: true };
  }

  const staff = await requirePermission(ctx, PERMISSIONS.SEED_RUN);
  return { actor: staff.user, bootstrapped: false };
}

/* -------------------------------------------------------------------------- */
/*                          deterministic randomness                          */
/* -------------------------------------------------------------------------- */

/**
 * A seeded LCG. Demo data must look varied but be reproducible: the same seed
 * always produces the same spread, so screenshots and tests stay stable.
 */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

/* -------------------------------------------------------------------------- */
/*                          cross-module references                           */
/* -------------------------------------------------------------------------- */

// `_generated/api` is only rebuilt by `npx convex dev`, so the two internal
// functions below are referenced by name. They resolve to exactly the same
// functions as `internal.seed.*` at runtime.
const seedDocumentsRef = makeFunctionReference<
  "action",
  Record<string, never>
>("seed:seedDemoDocuments");

const attachDocumentsRef = makeFunctionReference<
  "mutation",
  { storageIds: Id<"_storage">[]; [key: string]: unknown }
>("seed:attachDemoDocuments");

/* ============================================================================
 * Catalogue
 * ========================================================================== */

interface CatalogueCounts {
  destinationsCreated: number;
  destinationsUpdated: number;
  productsCreated: number;
  productsUpdated: number;
  requirementsCreated: number;
  requirementsUpdated: number;
  faqsCreated: number;
}

async function seedCatalogue(
  ctx: MutationCtx,
  now: number,
): Promise<CatalogueCounts> {
  const counts: CatalogueCounts = {
    destinationsCreated: 0,
    destinationsUpdated: 0,
    productsCreated: 0,
    productsUpdated: 0,
    requirementsCreated: 0,
    requirementsUpdated: 0,
    faqsCreated: 0,
  };

  // Persist the United States at displayOrder 0. The public queries sort it
  // first regardless, but the stored order should not disagree with them.
  const orderedDestinations = [...SEED_DESTINATIONS].sort(
    (a, b) => Number(isLeadDestination(b)) - Number(isLeadDestination(a)),
  );

  for (const [dIndex, dest] of orderedDestinations.entries()) {
    const destinationId = await upsertDestination(ctx, dest, dIndex, now, counts);

    // FAQs have no natural key, so the scope is cleared and rewritten. This is
    // what keeps `run` idempotent for editorial content.
    await clearFaqsForDestination(ctx, destinationId);
    for (const [i, faq] of dest.faqs.entries()) {
      await ctx.db.insert("visaFAQs", {
        scope: "destination",
        destinationId,
        question: faq.question,
        answer: faq.answer,
        displayOrder: i,
        isPublished: true,
        createdAt: now,
        updatedAt: now,
      });
      counts.faqsCreated += 1;
    }

    for (const [pIndex, product] of dest.products.entries()) {
      const productId = await upsertProduct(
        ctx,
        destinationId,
        dest,
        product,
        pIndex,
        now,
        counts,
      );

      await seedRequirements(ctx, productId, product, now, counts);

      await clearFaqsForProduct(ctx, productId);
      for (const [i, faq] of product.faqs.entries()) {
        await ctx.db.insert("visaFAQs", {
          scope: "visa_product",
          destinationId,
          visaProductId: productId,
          question: faq.question,
          answer: faq.answer,
          displayOrder: i,
          isPublished: true,
          createdAt: now,
          updatedAt: now,
        });
        counts.faqsCreated += 1;
      }
    }
  }

  // Global FAQs: matched on the question text so a re-run updates rather than
  // duplicating.
  const existingGlobal = await ctx.db
    .query("visaFAQs")
    .withIndex("by_scope", (q) => q.eq("scope", "global").eq("isPublished", true))
    .take(200);
  const globalByQuestion = new Map(existingGlobal.map((f) => [f.question, f]));

  for (const [i, faq] of SEED_GLOBAL_FAQS.entries()) {
    const existing = globalByQuestion.get(faq.question);
    if (existing) {
      await ctx.db.patch(existing._id, {
        answer: faq.answer,
        displayOrder: i,
        updatedAt: now,
      });
      continue;
    }
    await ctx.db.insert("visaFAQs", {
      scope: "global",
      question: faq.question,
      answer: faq.answer,
      displayOrder: i,
      isPublished: true,
      createdAt: now,
      updatedAt: now,
    });
    counts.faqsCreated += 1;
  }

  return counts;
}

async function upsertDestination(
  ctx: MutationCtx,
  dest: SeedDestination,
  order: number,
  now: number,
  counts: CatalogueCounts,
): Promise<Id<"destinations">> {
  const fields = {
    slug: dest.slug,
    name: dest.name,
    countryCode: dest.countryCode,
    flagEmoji: dest.flagEmoji,
    region: dest.region,
    tagline: dest.tagline,
    summary: dest.summary,
    description: dest.description,
    // Images are intentionally left unset: the UI has its own fallback, and
    // inventing a stock-photo URL would simply produce a broken image.
    heroImageUrl: undefined,
    cardImageUrl: undefined,
    currency: dest.currency,
    highlights: [...dest.highlights],
    travelNotes: dest.travelNotes,
    officialSourceUrl: dest.officialSourceUrl,
    // Never pretend seeded editorial has been checked against the source.
    lastVerifiedAt: undefined,
    isPopular: dest.isPopular,
    isPublished: true,
    displayOrder: order,
    seoTitle: dest.seoTitle,
    seoDescription: dest.seoDescription,
    updatedAt: now,
  };

  const existing = await ctx.db
    .query("destinations")
    .withIndex("by_slug", (q) => q.eq("slug", dest.slug))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, fields);
    counts.destinationsUpdated += 1;
    return existing._id;
  }

  counts.destinationsCreated += 1;
  return ctx.db.insert("destinations", { ...fields, createdAt: now });
}

async function upsertProduct(
  ctx: MutationCtx,
  destinationId: Id<"destinations">,
  dest: SeedDestination,
  product: SeedProduct,
  order: number,
  now: number,
  counts: CatalogueCounts,
): Promise<Id<"visaProducts">> {
  // The demo notice is appended rather than replacing the product's own note,
  // so both the real caveat and the demo warning survive.
  const importantInformation = [product.importantInformation, DEMO_FEE_NOTICE]
    .filter(Boolean)
    .join("\n\n");

  const fields = {
    destinationId,
    destinationSlug: dest.slug,
    slug: product.slug,
    name: product.name,
    category: product.category,
    visaType: product.visaType,
    shortDescription: product.shortDescription,
    detailedDescription: product.detailedDescription,
    eligibleNationalities: [] as string[], // empty = all
    entryType: product.entryType,
    validityDays: product.validityDays,
    maxStayDays: product.maxStayDays,
    processingTimeMinDays: product.processingTimeMinDays,
    processingTimeMaxDays: product.processingTimeMaxDays,
    processingTimeNote: product.processingTimeNote,
    currency: dest.currency,
    governmentFee: product.governmentFee,
    serviceFee: product.serviceFee,
    additionalCharges: product.additionalCharges,
    taxPercent: product.taxPercent,
    promoPrice: undefined,
    promoLabel: undefined,
    promoEndsAt: undefined,
    paymentMode: product.paymentMode,
    eligibilityNotes: product.eligibilityNotes,
    importantInformation,
    requiredApplicantFields: [...product.requiredApplicantFields],
    officialSourceUrl: product.officialSourceUrl,
    // Non-negotiable: seeded figures are unverified demonstration content.
    lastVerifiedAt: undefined,
    isDemoContent: true,
    isPublished: true,
    displayOrder: order,
    updatedAt: now,
  };

  const existing = await ctx.db
    .query("visaProducts")
    .withIndex("by_slug", (q) =>
      q.eq("destinationSlug", dest.slug).eq("slug", product.slug),
    )
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, fields);
    counts.productsUpdated += 1;
    return existing._id;
  }

  counts.productsCreated += 1;
  return ctx.db.insert("visaProducts", { ...fields, createdAt: now });
}

async function seedRequirements(
  ctx: MutationCtx,
  productId: Id<"visaProducts">,
  product: SeedProduct,
  now: number,
  counts: CatalogueCounts,
): Promise<void> {
  for (const [i, req] of product.requirements.entries()) {
    const definition = DOCUMENT_TYPE_MAP[req.documentKey];
    if (!definition) {
      // A checklist entry that is not in DOCUMENT_TYPES would render without a
      // label, so it is skipped loudly rather than silently half-seeded.
      console.warn(
        `[seed] unknown document key "${req.documentKey}" on ${product.slug} — skipped`,
      );
      continue;
    }

    const fields = {
      visaProductId: productId,
      documentKey: definition.key,
      label: definition.label,
      description: req.description ?? definition.description,
      isMandatory: req.isMandatory ?? definition.defaultMandatory,
      appliesTo: req.appliesTo ?? definition.appliesTo,
      allowedMimeTypes: [...definition.allowedMimeTypes],
      maxSizeBytes: definition.maxSizeBytes,
      displayOrder: i,
    };

    const existing = await ctx.db
      .query("visaRequirements")
      .withIndex("by_product_key", (q) =>
        q.eq("visaProductId", productId).eq("documentKey", definition.key),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, fields);
      counts.requirementsUpdated += 1;
      continue;
    }

    await ctx.db.insert("visaRequirements", { ...fields, createdAt: now });
    counts.requirementsCreated += 1;
  }
}

async function clearFaqsForDestination(
  ctx: MutationCtx,
  destinationId: Id<"destinations">,
): Promise<void> {
  const rows = await ctx.db
    .query("visaFAQs")
    .withIndex("by_destinationId", (q) => q.eq("destinationId", destinationId))
    .take(200);
  for (const row of rows) {
    if (row.scope === "destination") await ctx.db.delete(row._id);
  }
}

async function clearFaqsForProduct(
  ctx: MutationCtx,
  visaProductId: Id<"visaProducts">,
): Promise<void> {
  const rows = await ctx.db
    .query("visaFAQs")
    .withIndex("by_visaProductId", (q) => q.eq("visaProductId", visaProductId))
    .take(200);
  for (const row of rows) await ctx.db.delete(row._id);
}

/* ============================================================================
 * Demo people
 * ========================================================================== */

async function upsertDemoUser(
  ctx: MutationCtx,
  args: {
    key: string;
    fullName: string;
    phone: string;
    role: Doc<"users">["role"];
    createdAt: number;
  },
): Promise<Id<"users">> {
  const clerkId = demoClerkId(args.key);
  const existing = await ctx.db
    .query("users")
    .withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId))
    .unique();

  if (existing) return existing._id;

  return ctx.db.insert("users", {
    clerkId,
    email: demoEmail(args.key),
    fullName: args.fullName,
    phone: args.phone,
    role: args.role,
    status: "active",
    emailVerified: true,
    applicationCount: 0,
    lastActiveAt: args.createdAt,
    marketingOptIn: false,
    whatsappOptIn: false,
    createdAt: args.createdAt,
  });
}

/* ============================================================================
 * The demo application plan
 *
 * Fixed rather than random so the dashboard always has the same, deliberately
 * chosen mix: a review queue, unassigned work, overdue leads, refunds, and a
 * spread of ages across the last 90 days.
 * ========================================================================== */

type DemoPayment = "none" | "pending" | "paid" | "refunded";

interface PlanEntry {
  status: ApplicationStatus;
  daysAgo: number;
  payment: DemoPayment;
}

const APPLICATION_PLAN: PlanEntry[] = [
  { status: "completed", daysAgo: 88, payment: "paid" },
  { status: "completed", daysAgo: 84, payment: "paid" },
  { status: "rejected", daysAgo: 81, payment: "paid" },
  { status: "completed", daysAgo: 77, payment: "paid" },
  { status: "cancelled", daysAgo: 74, payment: "refunded" },
  { status: "completed", daysAgo: 70, payment: "paid" },
  { status: "approved", daysAgo: 66, payment: "paid" },
  { status: "completed", daysAgo: 62, payment: "paid" },
  { status: "rejected", daysAgo: 58, payment: "paid" },
  { status: "visa_processing", daysAgo: 54, payment: "paid" },
  { status: "approved", daysAgo: 50, payment: "paid" },
  { status: "appointment_scheduled", daysAgo: 46, payment: "paid" },
  { status: "visa_processing", daysAgo: 43, payment: "paid" },
  { status: "on_hold", daysAgo: 40, payment: "paid" },
  { status: "ready_for_processing", daysAgo: 37, payment: "paid" },
  { status: "appointment_scheduled", daysAgo: 34, payment: "paid" },
  { status: "under_review", daysAgo: 31, payment: "paid" },
  { status: "ready_for_processing", daysAgo: 28, payment: "paid" },
  { status: "additional_documents_requested", daysAgo: 25, payment: "paid" },
  { status: "under_review", daysAgo: 22, payment: "paid" },
  { status: "documents_submitted", daysAgo: 19, payment: "paid" },
  { status: "under_review", daysAgo: 17, payment: "paid" },
  { status: "additional_documents_requested", daysAgo: 15, payment: "paid" },
  { status: "documents_submitted", daysAgo: 13, payment: "pending" },
  { status: "documents_pending", daysAgo: 11, payment: "paid" },
  { status: "documents_pending", daysAgo: 9, payment: "pending" },
  { status: "documents_pending", daysAgo: 7, payment: "none" },
  { status: "draft", daysAgo: 45, payment: "none" }, // deliberately stale
  { status: "documents_pending", daysAgo: 5, payment: "pending" },
  { status: "submitted", daysAgo: 4, payment: "pending" },
  { status: "submitted", daysAgo: 2, payment: "none" },
  { status: "draft", daysAgo: 1, payment: "none" },
  { status: "submitted", daysAgo: 0, payment: "pending" },
];

/** Statuses at which the customer has actually uploaded something. */
const STATUSES_WITH_DOCUMENTS = new Set<ApplicationStatus>([
  "documents_submitted",
  "under_review",
  "additional_documents_requested",
  "ready_for_processing",
  "appointment_scheduled",
  "visa_processing",
  "approved",
  "rejected",
  "completed",
  "on_hold",
]);

/** Statuses at which documents have been reviewed and signed off. */
const STATUSES_WITH_APPROVED_DOCUMENTS = new Set<ApplicationStatus>([
  "ready_for_processing",
  "appointment_scheduled",
  "visa_processing",
  "approved",
  "completed",
]);

function applicationPaymentStatus(entry: PlanEntry): Doc<"applications">["paymentStatus"] {
  switch (entry.payment) {
    case "paid":
      return "paid";
    case "pending":
      return "pending";
    case "refunded":
      return "refunded";
    default:
      return entry.status === "draft" ? "unpaid" : "unpaid";
  }
}

/* ============================================================================
 * Transactional demo data
 * ========================================================================== */

interface DemoCounts {
  users: number;
  staffProfiles: number;
  applications: number;
  applicants: number;
  statusHistory: number;
  payments: number;
  documentRequests: number;
  enquiries: number;
  conversations: number;
  messages: number;
}

async function seedDemoData(
  ctx: MutationCtx,
  now: number,
): Promise<DemoCounts> {
  const counts: DemoCounts = {
    users: 0,
    staffProfiles: 0,
    applications: 0,
    applicants: 0,
    statusHistory: 0,
    payments: 0,
    documentRequests: 0,
    enquiries: 0,
    conversations: 0,
    messages: 0,
  };

  const rng = makeRng(20261102);

  /* ------------------------------- people ------------------------------- */

  const staffIds: Id<"users">[] = [];
  for (const [i, staff] of SEED_STAFF.entries()) {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", demoClerkId(staff.key)))
      .unique();

    const userId =
      existing?._id ??
      (await upsertDemoUser(ctx, {
        key: staff.key,
        fullName: staff.fullName,
        phone: staff.phone,
        role: staff.role,
        createdAt: now - (SPREAD_DAYS + 30 - i) * DAY_MS,
      }));

    if (!existing) counts.users += 1;
    staffIds.push(userId);

    const profile = await ctx.db
      .query("staffProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (!profile) {
      await ctx.db.insert("staffProfiles", {
        userId,
        employeeCode: staff.employeeCode,
        designation: staff.designation,
        department: staff.department,
        extraPermissions: [],
        revokedPermissions: [],
        assignedDestinationIds: [],
        isActive: true,
        createdAt: now - (SPREAD_DAYS + 30 - i) * DAY_MS,
      });
      counts.staffProfiles += 1;
    }
  }

  // Agents that can own an application. Support agents do not process.
  const agentIds = staffIds.filter(
    (_, i) => SEED_STAFF[i].role === "visa_agent" || SEED_STAFF[i].role === "manager",
  );

  const customerIds: Id<"users">[] = [];
  for (const [i, customer] of SEED_CUSTOMERS.entries()) {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", demoClerkId(customer.key)))
      .unique();

    const userId =
      existing?._id ??
      (await upsertDemoUser(ctx, {
        key: customer.key,
        fullName: customer.fullName,
        phone: customer.phone,
        role: "customer",
        // Customers register before they book, spread across the window.
        createdAt: now - (SPREAD_DAYS - i * 2) * DAY_MS,
      }));

    if (!existing) counts.users += 1;
    customerIds.push(userId);
  }

  /* ---------------------------- the catalogue --------------------------- */

  const products = await ctx.db
    .query("visaProducts")
    .withIndex("by_isPublished", (q) => q.eq("isPublished", true))
    .take(100);

  if (products.length === 0) {
    throw new ConvexError({
      code: "SEED_CATALOGUE_MISSING",
      message: "No published visa products to attach demo applications to.",
    });
  }

  const destinationIds = [...new Set(products.map((p) => p.destinationId as string))];
  const destinations = await Promise.all(
    destinationIds.map((id) => ctx.db.get(id as Id<"destinations">)),
  );
  const destinationById = new Map<string, Doc<"destinations">>();
  for (const d of destinations) if (d) destinationById.set(d._id as string, d);

  // Mandatory requirement counts, read once per product rather than per app.
  const mandatoryByProduct = new Map<string, number>();
  for (const product of products) {
    const reqs = await ctx.db
      .query("visaRequirements")
      .withIndex("by_visaProductId", (q) => q.eq("visaProductId", product._id))
      .take(50);
    mandatoryByProduct.set(
      product._id as string,
      reqs.filter((r) => r.isMandatory).length,
    );
  }

  /* ---------------------------- applications ---------------------------- */

  const createdApplications: Array<{
    id: Id<"applications">;
    userId: Id<"users">;
    status: ApplicationStatus;
    createdAt: number;
  }> = [];

  for (const [i, entry] of APPLICATION_PLAN.entries()) {
    const customerId = customerIds[i % customerIds.length];
    const customer = await ctx.db.get(customerId);
    if (!customer) continue;

    const product = products[i % products.length];
    const destination = destinationById.get(product.destinationId as string);
    if (!destination) continue;

    const createdAt =
      now - entry.daysAgo * DAY_MS - Math.floor(rng() * 20) * HOUR_MS;
    const travellerCount = 1 + Math.floor(rng() * 3);

    const pricing = computePricing({
      currency: product.currency,
      governmentFee: product.governmentFee,
      serviceFee: product.serviceFee,
      additionalCharges: product.additionalCharges,
      taxPercent: product.taxPercent,
      travellerCount,
      now: createdAt,
    });

    const isDraft = entry.status === "draft";
    const referenceId = await generateReference(ctx, "application", createdAt);
    const mandatory = mandatoryByProduct.get(product._id as string) ?? 0;

    const approvedDocs = STATUSES_WITH_APPROVED_DOCUMENTS.has(entry.status)
      ? mandatory
      : STATUSES_WITH_DOCUMENTS.has(entry.status)
        ? Math.max(0, mandatory - 1)
        : 0;

    // ~1 in 4 live applications is left unassigned on purpose so the admin
    // work queue has something real to show.
    const assignedAgentId =
      !isDraft && agentIds.length > 0 && rng() > 0.25
        ? agentIds[Math.floor(rng() * agentIds.length) % agentIds.length]
        : undefined;

    const submittedAt = isDraft ? undefined : createdAt + 2 * HOUR_MS;
    const completedAt =
      entry.status === "completed" ? createdAt + 14 * DAY_MS : undefined;
    const cancelledAt =
      entry.status === "cancelled" ? createdAt + 3 * DAY_MS : undefined;

    const updatedAt = Math.min(
      now,
      completedAt ?? cancelledAt ?? createdAt + Math.floor(rng() * 6) * DAY_MS,
    );

    const applicationId = await ctx.db.insert("applications", {
      referenceId,
      userId: customerId,
      destinationId: destination._id,
      visaProductId: product._id,
      destinationName: destination.name,
      visaProductName: product.name,
      customerName: customer.fullName,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      status: entry.status,
      paymentStatus: applicationPaymentStatus(entry),
      paymentMode: product.paymentMode,
      departureCountry: "IN",
      travelPurpose: product.category === "service" ? "Visa service" : product.visaType,
      intendedArrivalDate: createdAt + 45 * DAY_MS,
      intendedDepartureDate: createdAt + 55 * DAY_MS,
      travellerCount,
      hasPreviousVisaRejection: false,
      pricing,
      assignedAgentId,
      assignedAt: assignedAgentId ? createdAt + 4 * HOUR_MS : undefined,
      currentStep: isDraft ? 2 : 5,
      isDraft,
      lastAutosaveAt: isDraft ? createdAt + HOUR_MS : undefined,
      termsAcceptedAt: isDraft ? undefined : submittedAt,
      submittedAt,
      completedAt,
      cancelledAt,
      documentsRequiredCount: mandatory,
      documentsApprovedCount: approvedDocs,
      createdAt,
      updatedAt,
    });
    counts.applications += 1;

    await ctx.db.patch(customerId, {
      applicationCount: (await ctx.db.get(customerId))!.applicationCount + 1,
      lastActiveAt: Math.max(customer.lastActiveAt ?? 0, updatedAt),
    });

    createdApplications.push({
      id: applicationId,
      userId: customerId,
      status: entry.status,
      createdAt,
    });

    /* ---------------------------- applicants --------------------------- */
    for (let a = 0; a < travellerCount; a++) {
      await ctx.db.insert("applicants", {
        applicationId,
        userId: customerId,
        isPrimary: a === 0,
        orderIndex: a,
        firstName: a === 0 ? customer.fullName.split(" ").slice(0, 2).join(" ") : "Demo Traveller",
        lastName: a === 0 ? (customer.fullName.split(" ").pop() ?? "Demo") : `${a + 1}`,
        dateOfBirth: Date.UTC(1990 + (i % 15), i % 12, 1 + (a % 27)),
        gender: a % 2 === 0 ? "male" : "female",
        nationality: "IN",
        occupation: a === 0 ? "Demo occupation" : "Demo dependant",
        email: a === 0 ? customer.email : undefined,
        phone: a === 0 ? customer.phone : undefined,
        passportNumber: `DEMO${String(i).padStart(3, "0")}${a}`,
        passportIssueDate: createdAt - 900 * DAY_MS,
        passportExpiryDate: createdAt + 1800 * DAY_MS,
        passportIssuingCountry: "IN",
        createdAt,
        updatedAt,
      });
      counts.applicants += 1;
    }

    /* -------------------------- status history ------------------------- */
    if (!isDraft) {
      await ctx.db.insert("statusHistory", {
        applicationId,
        userId: customerId,
        fromStatus: "draft",
        toStatus: "submitted",
        note: "Application submitted by the customer.",
        visibleToCustomer: true,
        changedByName: customer.fullName,
        changedBy: customerId,
        createdAt: submittedAt!,
      });
      counts.statusHistory += 1;

      if (entry.status !== "submitted") {
        await ctx.db.insert("statusHistory", {
          applicationId,
          userId: customerId,
          fromStatus: "submitted",
          toStatus: entry.status,
          note: "Demo data — status set by the seed script.",
          visibleToCustomer: true,
          changedByName: "VisaDrive (demo seed)",
          createdAt: updatedAt,
        });
        counts.statusHistory += 1;
      }
    }

    /* ------------------------------ payment ---------------------------- */
    if (entry.payment !== "none") {
      const paidAt = createdAt + 6 * HOUR_MS;
      const receiptNumber = await generateReference(ctx, "receipt", createdAt);

      await ctx.db.insert("payments", {
        applicationId,
        userId: customerId,
        receiptNumber,
        amount: pricing.total,
        currency: pricing.currency,
        mode: rng() > 0.3 ? "razorpay" : "manual_bank_transfer",
        status:
          entry.payment === "paid"
            ? "paid"
            : entry.payment === "refunded"
              ? "refunded"
              : "pending",
        paidAt: entry.payment === "pending" ? undefined : paidAt,
        refundedAmount: entry.payment === "refunded" ? pricing.total : 0,
        refundedAt: entry.payment === "refunded" ? createdAt + 4 * DAY_MS : undefined,
        refundNote:
          entry.payment === "refunded"
            ? "Demo data — booking cancelled before processing began."
            : undefined,
        notes: "Demo payment created by the seed script.",
        createdAt,
        updatedAt: entry.payment === "refunded" ? createdAt + 4 * DAY_MS : paidAt,
      });
      counts.payments += 1;
    }

    /* ------------------------- document requests ----------------------- */
    if (entry.status === "additional_documents_requested" && assignedAgentId) {
      await ctx.db.insert("documentRequests", {
        applicationId,
        userId: customerId,
        requestedBy: assignedAgentId,
        documentKey: "bank_statement",
        label: DOCUMENT_TYPE_MAP.bank_statement.label,
        reason:
          "Demo data — the statement supplied does not cover the full period we need.",
        dueDate: updatedAt + 5 * DAY_MS,
        status: "open",
        createdAt: updatedAt,
      });
      counts.documentRequests += 1;
    }
  }

  /* ------------------------------ enquiries ----------------------------- */

  const leadPlan: Array<{
    leadStatus: Doc<"enquiries">["leadStatus"];
    daysAgo: number;
    followUpOffsetDays?: number;
    assign: boolean;
  }> = [
    { leadStatus: "converted", daysAgo: 85, assign: true },
    { leadStatus: "converted", daysAgo: 72, assign: true },
    { leadStatus: "lost", daysAgo: 68, assign: true },
    { leadStatus: "converted", daysAgo: 60, assign: true },
    { leadStatus: "qualified", daysAgo: 52, followUpOffsetDays: 2, assign: true },
    { leadStatus: "lost", daysAgo: 48, assign: false },
    { leadStatus: "contacted", daysAgo: 41, followUpOffsetDays: -6, assign: true },
    { leadStatus: "converted", daysAgo: 36, assign: true },
    { leadStatus: "qualified", daysAgo: 30, followUpOffsetDays: -3, assign: true },
    { leadStatus: "follow_up_required", daysAgo: 26, followUpOffsetDays: -2, assign: true },
    { leadStatus: "contacted", daysAgo: 21, followUpOffsetDays: 0, assign: true },
    { leadStatus: "follow_up_required", daysAgo: 18, followUpOffsetDays: 0, assign: false },
    { leadStatus: "qualified", daysAgo: 14, followUpOffsetDays: 1, assign: true },
    { leadStatus: "contacted", daysAgo: 11, followUpOffsetDays: 3, assign: true },
    { leadStatus: "new", daysAgo: 8, assign: false },
    { leadStatus: "follow_up_required", daysAgo: 6, followUpOffsetDays: 0, assign: true },
    { leadStatus: "new", daysAgo: 4, assign: false },
    { leadStatus: "contacted", daysAgo: 3, followUpOffsetDays: 4, assign: true },
    { leadStatus: "new", daysAgo: 1, assign: false },
    { leadStatus: "new", daysAgo: 0, assign: false },
  ];

  for (const [i, lead] of leadPlan.entries()) {
    const customer = SEED_CUSTOMERS[i % SEED_CUSTOMERS.length];
    const createdAt = now - lead.daysAgo * DAY_MS - Math.floor(rng() * 12) * HOUR_MS;
    const converted = lead.leadStatus === "converted";
    const convertedApplication = converted
      ? createdApplications[i % createdApplications.length]
      : undefined;

    await ctx.db.insert("enquiries", {
      referenceId: await generateReference(ctx, "enquiry", createdAt),
      fullName: customer.fullName,
      email: demoEmail(`lead-${customer.key}-${i}`),
      phone: customer.phone,
      interestedCountry: pick(rng, SEED_DESTINATIONS).name,
      visaCategory: pick(rng, ["tourist", "business", "student", "service"] as const),
      travelDate: createdAt + 60 * DAY_MS,
      subject: SEED_ENQUIRY_SUBJECTS[i % SEED_ENQUIRY_SUBJECTS.length],
      message: SEED_ENQUIRY_MESSAGES[i % SEED_ENQUIRY_MESSAGES.length],
      source: pick(rng, [
        "website_form",
        "whatsapp",
        "phone",
        "referral",
        "walk_in",
      ] as const),
      leadStatus: lead.leadStatus,
      assignedTo: lead.assign && staffIds.length > 0 ? staffIds[i % staffIds.length] : undefined,
      assignedAt: lead.assign ? createdAt + 3 * HOUR_MS : undefined,
      followUpAt:
        lead.followUpOffsetDays === undefined
          ? undefined
          : now + lead.followUpOffsetDays * DAY_MS,
      contactAttempts: lead.leadStatus === "new" ? 0 : 1 + Math.floor(rng() * 3),
      lastContactedAt: lead.leadStatus === "new" ? undefined : createdAt + DAY_MS,
      lostReason:
        lead.leadStatus === "lost"
          ? "Demo data — the customer decided not to travel."
          : undefined,
      convertedUserId: converted ? convertedApplication?.userId : undefined,
      convertedApplicationId: converted ? convertedApplication?.id : undefined,
      convertedAt: converted ? createdAt + 2 * DAY_MS : undefined,
      createdAt,
      updatedAt: createdAt + DAY_MS,
    });
    counts.enquiries += 1;
  }

  /* ---------------------------- conversations --------------------------- */

  const conversationSources = createdApplications
    .filter((a) => a.status !== "draft")
    .slice(0, 9);

  for (const [i, source] of conversationSources.entries()) {
    const application = await ctx.db.get(source.id);
    if (!application) continue;

    const openedAt = source.createdAt + DAY_MS;
    // Every third thread is left waiting on staff, so the work queue is real.
    const awaitingStaff = i % 3 === 0;
    const replyAt = openedAt + 5 * HOUR_MS;
    const lastMessageAt = awaitingStaff ? openedAt : replyAt;

    const conversationId = await ctx.db.insert("conversations", {
      subject: `${application.referenceId} — ${application.visaProductName}`,
      userId: application.userId,
      customerName: application.customerName,
      customerEmail: application.customerEmail,
      applicationId: application._id,
      status: awaitingStaff ? "open" : i % 4 === 1 ? "resolved" : "pending",
      priority: i % 5 === 0 ? "high" : "normal",
      assignedTo: application.assignedAgentId,
      channel: "portal",
      lastMessageAt,
      lastMessagePreview: awaitingStaff
        ? SEED_CONVERSATION_OPENERS[i % SEED_CONVERSATION_OPENERS.length]
        : SEED_STAFF_REPLIES[i % SEED_STAFF_REPLIES.length],
      unreadForCustomer: awaitingStaff ? 0 : 1,
      unreadForStaff: awaitingStaff ? 1 : 0,
      messageCount: awaitingStaff ? 1 : 2,
      resolvedAt: !awaitingStaff && i % 4 === 1 ? replyAt + HOUR_MS : undefined,
      resolvedBy:
        !awaitingStaff && i % 4 === 1 ? application.assignedAgentId : undefined,
      createdAt: openedAt,
    });
    counts.conversations += 1;

    await ctx.db.insert("messages", {
      conversationId,
      authorUserId: application.userId,
      authorName: application.customerName,
      authorRole: "customer",
      body: SEED_CONVERSATION_OPENERS[i % SEED_CONVERSATION_OPENERS.length],
      attachments: [],
      isInternal: false,
      readByCustomerAt: openedAt,
      createdAt: openedAt,
    });
    counts.messages += 1;

    if (!awaitingStaff) {
      await ctx.db.insert("messages", {
        conversationId,
        authorUserId: application.assignedAgentId,
        authorName: "VisaDrive Team",
        authorRole: "staff",
        body: SEED_STAFF_REPLIES[i % SEED_STAFF_REPLIES.length],
        attachments: [],
        isInternal: false,
        readByStaffAt: replyAt,
        createdAt: replyAt,
      });
      counts.messages += 1;
    }
  }

  return counts;
}

/* ============================================================================
 * run
 * ========================================================================== */

export const run = mutation({
  args: {
    withDemoData: v.optional(v.boolean()),
    withDocuments: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { actor, bootstrapped } = await assertCanSeed(ctx);
    const now = Date.now();

    const catalogue = await seedCatalogue(ctx, now);

    /* ------------------------- settings / content ----------------------- */
    await upsertSetting(ctx, {
      key: TESTIMONIALS_KEY,
      category: "content",
      value: {
        isDemo: true,
        note:
          "These testimonials are demonstration content with no real customer " +
          "behind them. Every entry carries isDemo: true and the marketing " +
          "site labels them as sample data. Replace with real, consented " +
          "quotes before launch.",
        items: SEED_TESTIMONIALS,
      },
      label: "Homepage testimonials",
      description:
        "Demo placeholders. The live VisaDrive site has no testimonials yet.",
      isPublic: true,
      actor,
      now,
    });

    /* --------------------------- demo data ------------------------------ */
    let demo: DemoCounts | null = null;
    let demoSkipped = false;

    if (args.withDemoData !== false) {
      const existingDemoApps = await findDemoApplications(ctx, 1);
      if (existingDemoApps.length > 0) {
        // Idempotency: the catalogue is upserted above, but transactional rows
        // have no natural key, so they are generated exactly once.
        demoSkipped = true;
      } else {
        demo = await seedDemoData(ctx, now);

        if (args.withDocuments !== false) {
          // Document rows need a real `_storage` id, which only an action can
          // create. The action stores a handful of generated placeholder PDFs
          // and calls back into `attachDemoDocuments`.
          await ctx.scheduler.runAfter(0, seedDocumentsRef, {});
        }
      }
    }

    await upsertSetting(ctx, {
      key: SEED_META_KEY,
      category: "system",
      value: {
        version: SEED_VERSION,
        seededAt: now,
        bootstrapped,
        destinationSlugs: SEED_DESTINATIONS.map((d) => d.slug),
        catalogue,
        demo,
        demoSkipped,
      },
      label: "Demo seed manifest",
      description: "What the last seed run created. Used by seed.status and seed.reset.",
      isPublic: false,
      actor,
      now,
    });

    await recordAudit(ctx, {
      actor,
      action: AUDIT_ACTIONS.SEED_RUN,
      entityType: "setting",
      entityId: SEED_META_KEY,
      summary: bootstrapped
        ? "Demo environment seeded on an empty deployment (bootstrap)."
        : "Demo environment seeded.",
      after: { catalogue, demo, demoSkipped },
    });

    return {
      ok: true as const,
      bootstrapped,
      catalogue,
      demo,
      demoSkipped,
      note:
        "All seeded visa products carry isDemoContent: true and unverified " +
        "placeholder fees. Verify them against the official source before " +
        "publishing to real customers.",
    };
  },
});

async function upsertSetting(
  ctx: MutationCtx,
  args: {
    key: string;
    category: string;
    value: unknown;
    label: string;
    description: string;
    isPublic: boolean;
    actor: Doc<"users"> | null;
    now: number;
  },
): Promise<void> {
  const existing = await ctx.db
    .query("appSettings")
    .withIndex("by_key", (q) => q.eq("key", args.key))
    .unique();

  const fields = {
    key: args.key,
    category: args.category,
    value: args.value,
    label: args.label,
    description: args.description,
    isPublic: args.isPublic,
    updatedBy: args.actor?._id,
    updatedAt: args.now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, fields);
    return;
  }
  await ctx.db.insert("appSettings", fields);
}

/* ============================================================================
 * Demo documents (storage-backed, so they must come from an action)
 * ========================================================================== */

/** How many distinct placeholder files are stored and then cycled. */
const PLACEHOLDER_FILE_COUNT = 6;

/**
 * Build a small, genuinely valid single-page PDF. Everything written here is
 * ASCII, so the byte offsets in the xref table equal string offsets.
 */
function buildPlaceholderPdf(lines: string[]): Uint8Array {
  const escape = (s: string) => s.replace(/([\\()])/g, "\\$1");
  const content = lines
    .map(
      (line, i) =>
        `BT /F1 ${i === 0 ? 16 : 11} Tf 56 ${780 - i * 24} Td (${escape(line)}) Tj ET`,
    )
    .join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(pdf);
}

export const seedDemoDocuments = internalAction({
  args: {},
  returns: v.object({ stored: v.number(), attached: v.number() }),
  handler: async (ctx: ActionCtx) => {
    const storageIds: Id<"_storage">[] = [];

    for (let i = 0; i < PLACEHOLDER_FILE_COUNT; i++) {
      const bytes = buildPlaceholderPdf([
        "VisaDrive — demonstration document",
        `Placeholder file ${i + 1} of ${PLACEHOLDER_FILE_COUNT}.`,
        "This file was generated by the demo seed script.",
        "It contains no real personal data and is not a real document.",
        `Generated: ${new Date().toISOString()}`,
      ]);
      const storageId = await ctx.storage.store(
        new Blob([bytes as BlobPart], { type: "application/pdf" }),
      );
      storageIds.push(storageId);
    }

    const result = (await ctx.runMutation(attachDocumentsRef, { storageIds })) as {
      attached: number;
    };

    return { stored: storageIds.length, attached: result.attached };
  },
});

export const attachDemoDocuments = internalMutation({
  args: { storageIds: v.array(v.id("_storage")) },
  returns: v.object({ attached: v.number() }),
  handler: async (ctx, args) => {
    if (args.storageIds.length === 0) return { attached: 0 };

    const applications = await findDemoApplications(ctx, 200);
    let attached = 0;
    let fileCursor = 0;

    for (const application of applications) {
      if (!STATUSES_WITH_DOCUMENTS.has(application.status)) continue;

      const requirements = await ctx.db
        .query("visaRequirements")
        .withIndex("by_product_order", (q) =>
          q.eq("visaProductId", application.visaProductId),
        )
        .take(20);

      const mandatory = requirements.filter((r) => r.isMandatory).slice(0, 4);
      const allApproved = STATUSES_WITH_APPROVED_DOCUMENTS.has(application.status);

      for (const [i, requirement] of mandatory.entries()) {
        // Idempotent: re-running the action never produces a second copy.
        const existing = await ctx.db
          .query("documents")
          .withIndex("by_application_key", (q) =>
            q
              .eq("applicationId", application._id)
              .eq("applicantId", undefined)
              .eq("documentKey", requirement.documentKey),
          )
          .first();
        if (existing) continue;

        const storageId = args.storageIds[fileCursor % args.storageIds.length];
        fileCursor += 1;

        // The last document of a non-approved application is left waiting so
        // the admin review queue has genuine work in it.
        const status = allApproved
          ? "approved"
          : i === mandatory.length - 1
            ? "pending_review"
            : "approved";

        const createdAt = application.createdAt + (i + 1) * 3 * HOUR_MS;

        await ctx.db.insert("documents", {
          applicationId: application._id,
          userId: application.userId,
          storageId,
          documentKey: requirement.documentKey,
          label: requirement.label,
          fileName: `demo-${requirement.documentKey}.pdf`,
          mimeType: "application/pdf",
          size: MAX_UPLOAD_BYTES / 1000,
          status,
          reviewedBy: status === "approved" ? application.assignedAgentId : undefined,
          reviewedAt: status === "approved" ? createdAt + HOUR_MS : undefined,
          reviewNote:
            status === "approved" ? "Demo data — auto-approved by the seed." : undefined,
          version: 1,
          isCurrent: true,
          createdAt,
        });
        attached += 1;
      }
    }

    return { attached };
  },
});

/* ============================================================================
 * reset
 * ========================================================================== */

/** Demo users are exactly those under the reserved clerk-id prefix. */
async function findDemoUsers(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">[]> {
  const rows = await ctx.db.query("users").withIndex("by_createdAt").take(2000);
  return rows.filter((u) => u.clerkId.startsWith(DEMO_CLERK_PREFIX));
}

async function findDemoApplications(
  ctx: QueryCtx | MutationCtx,
  limit: number,
): Promise<Doc<"applications">[]> {
  const users = await findDemoUsers(ctx);
  const out: Doc<"applications">[] = [];
  for (const user of users) {
    const apps = await ctx.db
      .query("applications")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .take(limit);
    out.push(...apps);
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

export const reset = mutation({
  args: { keepCatalogue: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const { actor } = await assertCanSeed(ctx);
    const now = Date.now();

    const deleted = {
      messages: 0,
      conversations: 0,
      documents: 0,
      storageFiles: 0,
      documentRequests: 0,
      payments: 0,
      statusHistory: 0,
      applicants: 0,
      applications: 0,
      notifications: 0,
      internalNotes: 0,
      staffAssignments: 0,
      enquiries: 0,
      staffProfiles: 0,
      users: 0,
      visaRequirements: 0,
      visaFAQs: 0,
      visaProducts: 0,
      destinations: 0,
      appSettings: 0,
    };

    const users = await findDemoUsers(ctx);
    const userIds = new Set(users.map((u) => u._id as string));

    /* --------------------- everything owned by a demo user --------------- */
    for (const user of users) {
      const applications = await ctx.db
        .query("applications")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .take(500);

      for (const application of applications) {
        const conversations = await ctx.db
          .query("conversations")
          .withIndex("by_applicationId", (q) => q.eq("applicationId", application._id))
          .take(50);
        for (const conversation of conversations) {
          const messages = await ctx.db
            .query("messages")
            .withIndex("by_conversationId", (q) => q.eq("conversationId", conversation._id))
            .take(200);
          for (const message of messages) {
            await ctx.db.delete(message._id);
            deleted.messages += 1;
          }
          await ctx.db.delete(conversation._id);
          deleted.conversations += 1;
        }

        const documents = await ctx.db
          .query("documents")
          .withIndex("by_applicationId", (q) => q.eq("applicationId", application._id))
          .take(100);
        // One storage object can back several demo rows, so delete each file
        // exactly once.
        const seenStorage = new Set<string>();
        for (const document of documents) {
          if (!seenStorage.has(document.storageId as string)) {
            seenStorage.add(document.storageId as string);
            try {
              await ctx.storage.delete(document.storageId);
              deleted.storageFiles += 1;
            } catch {
              // Already gone; nothing to do.
            }
          }
          await ctx.db.delete(document._id);
          deleted.documents += 1;
        }

        for (const table of ["documentRequests", "payments", "statusHistory", "applicants"] as const) {
          const rows = await ctx.db
            .query(table)
            .withIndex("by_applicationId", (q) => q.eq("applicationId", application._id))
            .take(200);
          for (const row of rows) {
            await ctx.db.delete(row._id);
            deleted[table] += 1;
          }
        }

        await ctx.db.delete(application._id);
        deleted.applications += 1;
      }

      // Payments not attached to an application, plus leftovers.
      const payments = await ctx.db
        .query("payments")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .take(200);
      for (const payment of payments) {
        await ctx.db.delete(payment._id);
        deleted.payments += 1;
      }

      const notifications = await ctx.db
        .query("notifications")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .take(500);
      for (const notification of notifications) {
        await ctx.db.delete(notification._id);
        deleted.notifications += 1;
      }

      const notes = await ctx.db
        .query("internalNotes")
        .withIndex("by_authorId", (q) => q.eq("authorId", user._id))
        .take(200);
      for (const note of notes) {
        await ctx.db.delete(note._id);
        deleted.internalNotes += 1;
      }

      const assignments = await ctx.db
        .query("staffAssignments")
        .withIndex("by_staffUserId", (q) => q.eq("staffUserId", user._id))
        .take(200);
      for (const assignment of assignments) {
        await ctx.db.delete(assignment._id);
        deleted.staffAssignments += 1;
      }

      const profile = await ctx.db
        .query("staffProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", user._id))
        .unique();
      if (profile) {
        await ctx.db.delete(profile._id);
        deleted.staffProfiles += 1;
      }
    }

    /* ------------------------------ enquiries ---------------------------- */
    // Demo leads are the ones on the reserved example.com domain, or linked to
    // a demo user.
    const enquiries = await ctx.db.query("enquiries").withIndex("by_createdAt").take(2000);
    for (const enquiry of enquiries) {
      const isDemo =
        enquiry.email.endsWith(`@${DEMO_EMAIL_DOMAIN}`) ||
        (enquiry.convertedUserId !== undefined &&
          userIds.has(enquiry.convertedUserId as string));
      if (!isDemo) continue;

      const threads = await ctx.db
        .query("conversations")
        .withIndex("by_enquiryId", (q) => q.eq("enquiryId", enquiry._id))
        .take(20);
      for (const thread of threads) {
        const messages = await ctx.db
          .query("messages")
          .withIndex("by_conversationId", (q) => q.eq("conversationId", thread._id))
          .take(200);
        for (const message of messages) {
          await ctx.db.delete(message._id);
          deleted.messages += 1;
        }
        await ctx.db.delete(thread._id);
        deleted.conversations += 1;
      }

      await ctx.db.delete(enquiry._id);
      deleted.enquiries += 1;
    }

    /* -------------------------------- users ------------------------------ */
    for (const user of users) {
      await ctx.db.delete(user._id);
      deleted.users += 1;
    }

    /* ------------------------------ catalogue ---------------------------- */
    if (args.keepCatalogue !== true) {
      for (const seedDest of SEED_DESTINATIONS) {
        const destination = await ctx.db
          .query("destinations")
          .withIndex("by_slug", (q) => q.eq("slug", seedDest.slug))
          .unique();
        if (!destination) continue;

        const products = await ctx.db
          .query("visaProducts")
          .withIndex("by_destinationId", (q) => q.eq("destinationId", destination._id))
          .take(100);

        for (const product of products) {
          // Only demo-flagged products are removed. If an admin has verified a
          // product it is left alone, and the destination is kept with it.
          if (!product.isDemoContent) continue;

          const requirements = await ctx.db
            .query("visaRequirements")
            .withIndex("by_visaProductId", (q) => q.eq("visaProductId", product._id))
            .take(100);
          for (const requirement of requirements) {
            await ctx.db.delete(requirement._id);
            deleted.visaRequirements += 1;
          }

          const faqs = await ctx.db
            .query("visaFAQs")
            .withIndex("by_visaProductId", (q) => q.eq("visaProductId", product._id))
            .take(100);
          for (const faq of faqs) {
            await ctx.db.delete(faq._id);
            deleted.visaFAQs += 1;
          }

          await ctx.db.delete(product._id);
          deleted.visaProducts += 1;
        }

        const remaining = await ctx.db
          .query("visaProducts")
          .withIndex("by_destinationId", (q) => q.eq("destinationId", destination._id))
          .take(1);

        if (remaining.length === 0) {
          const faqs = await ctx.db
            .query("visaFAQs")
            .withIndex("by_destinationId", (q) => q.eq("destinationId", destination._id))
            .take(100);
          for (const faq of faqs) {
            await ctx.db.delete(faq._id);
            deleted.visaFAQs += 1;
          }
          await ctx.db.delete(destination._id);
          deleted.destinations += 1;
        }
      }

      // Global FAQs the seed owns, matched on their exact question text.
      const globalQuestions = new Set(SEED_GLOBAL_FAQS.map((f) => f.question));
      const globals = await ctx.db
        .query("visaFAQs")
        .withIndex("by_scope", (q) => q.eq("scope", "global").eq("isPublished", true))
        .take(200);
      for (const faq of globals) {
        if (!globalQuestions.has(faq.question)) continue;
        await ctx.db.delete(faq._id);
        deleted.visaFAQs += 1;
      }
    }

    /* ---------------------------- demo settings -------------------------- */
    for (const key of [TESTIMONIALS_KEY, SEED_META_KEY]) {
      const setting = await ctx.db
        .query("appSettings")
        .withIndex("by_key", (q) => q.eq("key", key))
        .unique();
      if (!setting) continue;
      await ctx.db.delete(setting._id);
      deleted.appSettings += 1;
    }

    await recordAudit(ctx, {
      actor,
      action: "seed.reset",
      entityType: "setting",
      entityId: SEED_META_KEY,
      summary: `Demo data reset (${deleted.applications} applications, ${deleted.users} demo accounts${
        args.keepCatalogue === true ? ", catalogue kept" : ", catalogue removed"
      }).`,
      after: deleted,
    });

    return { ok: true as const, resetAt: now, deleted };
  },
});

/* ============================================================================
 * status
 * ========================================================================== */

export const status = query({
  args: {},
  handler: async (ctx) => {
    const anyUser = await ctx.db.query("users").take(1);
    if (anyUser.length > 0) {
      await requirePermission(ctx, PERMISSIONS.SEED_RUN);
    }

    const meta = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", SEED_META_KEY))
      .unique();

    const testimonials = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", TESTIMONIALS_KEY))
      .unique();

    const destinations = await ctx.db
      .query("destinations")
      .withIndex("by_isPublished", (q) => q.eq("isPublished", true))
      .take(100);

    const products = await ctx.db
      .query("visaProducts")
      .withIndex("by_isPublished", (q) => q.eq("isPublished", true))
      .take(200);

    const demoUsers = await findDemoUsers(ctx);
    const demoApplications = await findDemoApplications(ctx, 500);

    let demoDocuments = 0;
    let demoPayments = 0;
    for (const application of demoApplications.slice(0, 200)) {
      demoDocuments += (
        await ctx.db
          .query("documents")
          .withIndex("by_applicationId", (q) => q.eq("applicationId", application._id))
          .take(50)
      ).length;
      demoPayments += (
        await ctx.db
          .query("payments")
          .withIndex("by_applicationId", (q) => q.eq("applicationId", application._id))
          .take(10)
      ).length;
    }

    const enquiries = await ctx.db.query("enquiries").withIndex("by_createdAt").take(2000);
    const demoEnquiries = enquiries.filter((e) =>
      e.email.endsWith(`@${DEMO_EMAIL_DOMAIN}`),
    ).length;

    const testimonialValue = testimonials?.value as
      | { items?: unknown[]; isDemo?: boolean }
      | undefined;

    return {
      isSeeded: meta !== null,
      seededAt: (meta?.value as { seededAt?: number } | undefined)?.seededAt ?? null,
      version: (meta?.value as { version?: number } | undefined)?.version ?? null,
      canBootstrap: anyUser.length === 0,
      catalogue: {
        destinations: destinations.length,
        products: products.length,
        demoProducts: products.filter((p) => p.isDemoContent).length,
        verifiedProducts: products.filter((p) => !p.isDemoContent).length,
        serviceProducts: products.filter((p) => p.category === "service").length,
      },
      demo: {
        users: demoUsers.length,
        customers: demoUsers.filter((u) => u.role === "customer").length,
        staff: demoUsers.filter((u) => u.role !== "customer").length,
        applications: demoApplications.length,
        drafts: demoApplications.filter((a) => a.isDraft).length,
        payments: demoPayments,
        documents: demoDocuments,
        enquiries: demoEnquiries,
      },
      testimonials: {
        present: testimonials !== null,
        count: Array.isArray(testimonialValue?.items)
          ? testimonialValue.items.length
          : 0,
        isDemo: testimonialValue?.isDemo === true,
      },
      warnings: buildWarnings(products.filter((p) => p.isDemoContent).length),
    };
  },
});

function buildWarnings(demoProductCount: number): string[] {
  const warnings: string[] = [];
  if (demoProductCount > 0) {
    warnings.push(
      `${demoProductCount} visa product${demoProductCount === 1 ? "" : "s"} still carry isDemoContent: true. Their fees, validity, maximum stay and processing times are unverified placeholders and must be checked against the official source before being shown to real customers.`,
    );
  }
  warnings.push(
    `Demo accounts use obviously fictional names on the reserved ${DEMO_EMAIL_DOMAIN} domain and can never receive real email.`,
  );
  warnings.push(
    `Seeded testimonials are placeholders, not real customers. ${SITE.name}'s live site has none; replace them with consented quotes before launch.`,
  );
  return warnings;
}
