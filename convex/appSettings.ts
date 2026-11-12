import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requirePermission } from "./lib/auth";
import { AUDIT_ACTIONS, recordAudit } from "./lib/audit";
import { LEGAL, SITE } from "../lib/constants/site";
import { PERMISSIONS } from "../lib/constants/roles";

/* ============================================================================
 * Application settings.
 *
 * Two jobs:
 *
 *  1. Let staff change the phone number, the tax rate or the booking-reference
 *     prefix from Admin → Settings without a deploy.
 *  2. Make sure the site still works when nothing has been configured yet.
 *     That is what `SETTINGS_DEFAULTS` is for: every key already has a
 *     sensible value taken from `lib/constants/site.ts`, so a completely empty
 *     database still renders a correct footer and contact page rather than
 *     a page full of blanks.
 *
 * The key names here are the ones `hooks/use-site-settings.ts` reads — they
 * are a UI contract, not an internal detail. Renaming one silently blanks a
 * field on the marketing site.
 *
 * **Secrets never live here.** API keys, webhook secrets and access tokens are
 * Convex environment variables. The flags below record whether an integration
 * is *switched on*, not how to authenticate to it — a row in this table is one
 * `isPublic` mistake away from being world-readable, so `assertWritableKey`
 * refuses anything that looks like a credential.
 * ========================================================================== */

export interface SettingDefault {
  key: string;
  category: string;
  value: unknown;
  label: string;
  description?: string;
  /** Public settings are served to anonymous visitors by `getPublic`. */
  isPublic: boolean;
}

const A = SITE.address;
const C = SITE.contact;

export const SETTINGS_DEFAULTS: Record<string, SettingDefault> = {
  /* ------------------------------- company ------------------------------- */
  "company.name": {
    key: "company.name",
    category: "company",
    value: SITE.name,
    label: "Company name",
    isPublic: true,
  },
  "company.legalName": {
    key: "company.legalName",
    category: "company",
    value: SITE.legalName,
    label: "Registered legal name",
    description:
      "Printed on invoices and receipts. Confirm the exact registered name (and LLPIN/GST) before billing.",
    isPublic: true,
  },
  "company.tagline": {
    key: "company.tagline",
    category: "company",
    value: SITE.tagline,
    label: "Tagline",
    isPublic: true,
  },
  "company.description": {
    key: "company.description",
    category: "company",
    value: SITE.footerDescription,
    label: "Footer description",
    isPublic: true,
  },
  "company.founder": {
    key: "company.founder",
    category: "company",
    value: SITE.founder,
    label: "Founder",
    isPublic: true,
  },
  "company.social": {
    key: "company.social",
    category: "company",
    value: SITE.social,
    label: "Social profiles",
    description:
      "Empty by default — the current site links no social accounts. Add them as { instagram: url, ... }.",
    isPublic: true,
  },

  /* ------------------------------- contact ------------------------------- */
  "contact.email": {
    key: "contact.email",
    category: "contact",
    value: C.email,
    label: "Contact email",
    description:
      "Currently the founder's personal address. A role address (hello@ / support@) is recommended for a booking platform.",
    isPublic: true,
  },
  "contact.phone": {
    key: "contact.phone",
    category: "contact",
    value: C.phonePrimary,
    label: "Primary phone (dial format)",
    isPublic: true,
  },
  "contact.phoneDisplay": {
    key: "contact.phoneDisplay",
    category: "contact",
    value: C.phonePrimaryDisplay,
    label: "Primary phone (display format)",
    isPublic: true,
  },
  "contact.phoneSecondary": {
    key: "contact.phoneSecondary",
    category: "contact",
    value: C.phoneSecondary,
    label: "Secondary phone (dial format)",
    isPublic: true,
  },
  "contact.phoneSecondaryDisplay": {
    key: "contact.phoneSecondaryDisplay",
    category: "contact",
    value: C.phoneSecondaryDisplay,
    label: "Secondary phone (display format)",
    isPublic: true,
  },
  "contact.whatsapp": {
    key: "contact.whatsapp",
    category: "contact",
    value: C.whatsapp,
    label: "WhatsApp number",
    description:
      "The number customers message, and the one outbound WhatsApp notifications come from. Not published on the current site — confirm before advertising it.",
    isPublic: true,
  },
  "contact.address": {
    key: "contact.address",
    category: "contact",
    value: A.full,
    label: "Full address",
    isPublic: true,
  },
  "contact.addressShort": {
    key: "contact.addressShort",
    category: "contact",
    value: A.short,
    label: "Short address",
    isPublic: true,
  },
  "contact.city": {
    key: "contact.city",
    category: "contact",
    value: A.city,
    label: "City",
    isPublic: true,
  },
  "contact.state": {
    key: "contact.state",
    category: "contact",
    value: A.state,
    label: "State",
    isPublic: true,
  },
  "contact.postalCode": {
    key: "contact.postalCode",
    category: "contact",
    value: A.postalCode,
    label: "Postal code",
    isPublic: true,
  },
  "contact.country": {
    key: "contact.country",
    category: "contact",
    value: A.country,
    label: "Country",
    isPublic: true,
  },
  "contact.businessHours": {
    key: "contact.businessHours",
    category: "contact",
    value: SITE.businessHours,
    label: "Business hours",
    description:
      "Empty on purpose — the current site publishes no hours. Fill this in to show them in the footer.",
    isPublic: true,
  },

  /* ------------------------------- finance ------------------------------- */
  "finance.currency": {
    key: "finance.currency",
    category: "finance",
    value: SITE.defaultCurrency,
    label: "Default currency",
    description:
      "ISO 4217 code. Amounts are always stored as integers in the smallest unit (paise for INR).",
    isPublic: true,
  },
  "finance.taxPercent": {
    key: "finance.taxPercent",
    category: "finance",
    value: 0,
    label: "Default tax percent",
    description:
      "Applied to the service fee when a visa product does not set its own rate. Left at 0 until the client confirms their GST position.",
    isPublic: true,
  },
  "finance.locale": {
    key: "finance.locale",
    category: "finance",
    value: SITE.defaultLocale,
    label: "Formatting locale",
    isPublic: true,
  },
  "finance.timezone": {
    key: "finance.timezone",
    category: "finance",
    value: SITE.defaultTimezone,
    label: "Timezone",
    isPublic: true,
  },
  "finance.serviceFeeNote": {
    key: "finance.serviceFeeNote",
    category: "finance",
    value: LEGAL.governmentFeesSeparate,
    label: "Fee note shown at checkout",
    isPublic: true,
  },

  /* ------------------------------- booking ------------------------------- */
  "booking.referencePrefix": {
    key: "booking.referencePrefix",
    category: "booking",
    value: "VD",
    label: "Booking reference prefix",
    description:
      "Display prefix for application references, e.g. VD-2026-00042. Changing it does not renumber existing bookings.",
    isPublic: true,
  },
  "booking.enquiryReferencePrefix": {
    key: "booking.enquiryReferencePrefix",
    category: "booking",
    value: "ENQ",
    label: "Enquiry reference prefix",
    isPublic: false,
  },
  "booking.termsVersion": {
    key: "booking.termsVersion",
    category: "booking",
    value: LEGAL.privacyLastUpdated,
    label: "Terms version accepted at booking",
    description: "Recorded against each application when the customer accepts.",
    isPublic: true,
  },
  "booking.maxTravellersPerApplication": {
    key: "booking.maxTravellersPerApplication",
    category: "booking",
    value: 10,
    label: "Maximum travellers per application",
    isPublic: true,
  },

  /* ---------------------------- notifications ---------------------------- */
  "notifications.inAppEnabled": {
    key: "notifications.inAppEnabled",
    category: "notifications",
    value: true,
    label: "In-app notifications",
    isPublic: false,
  },
  "notifications.emailEnabled": {
    key: "notifications.emailEnabled",
    category: "notifications",
    value: true,
    label: "Email notifications",
    description:
      "Needs RESEND_API_KEY in the Convex environment. Without it email is logged and skipped, never silently lost.",
    isPublic: false,
  },
  "notifications.whatsappEnabled": {
    key: "notifications.whatsappEnabled",
    category: "notifications",
    value: false,
    label: "WhatsApp notifications",
    description:
      "Off until the WhatsApp Business number is verified and Meta has approved the message templates.",
    isPublic: false,
  },
  "notifications.staffEmailOnNewEnquiry": {
    key: "notifications.staffEmailOnNewEnquiry",
    category: "notifications",
    value: true,
    label: "Email staff when a new enquiry arrives",
    isPublic: false,
  },
  "notifications.documentsReminderAfterDays": {
    key: "notifications.documentsReminderAfterDays",
    category: "notifications",
    value: 3,
    label: "Chase missing documents after (days)",
    isPublic: false,
  },

  /* ----------------------------- integrations ---------------------------- */
  // Flags only — the credentials themselves are environment variables.
  "integrations.razorpayEnabled": {
    key: "integrations.razorpayEnabled",
    category: "integrations",
    value: false,
    label: "Razorpay online payments",
    description:
      "Switch on once live keys are configured. Offline payment recording keeps working either way.",
    isPublic: true,
  },
  "integrations.razorpayMode": {
    key: "integrations.razorpayMode",
    category: "integrations",
    value: "test",
    label: "Razorpay mode",
    description:
      'Display only — "test" or "live". The API keys in the environment decide the real mode.',
    isPublic: false,
  },
  "integrations.resendEnabled": {
    key: "integrations.resendEnabled",
    category: "integrations",
    value: false,
    label: "Resend transactional email",
    isPublic: false,
  },
  "integrations.whatsappCloudEnabled": {
    key: "integrations.whatsappCloudEnabled",
    category: "integrations",
    value: false,
    label: "WhatsApp Business Cloud API",
    isPublic: false,
  },
  "integrations.whatsappBotEnabled": {
    key: "integrations.whatsappBotEnabled",
    category: "integrations",
    value: false,
    label: "WhatsApp enquiry bot",
    description:
      "Lets the bot answer inbound WhatsApp messages. Also requires WHATSAPP_BOT_ENABLED=true in the Convex environment (hard kill switch).",
    isPublic: false,
  },
  "integrations.analyticsEnabled": {
    key: "integrations.analyticsEnabled",
    category: "integrations",
    value: false,
    label: "Website analytics",
    isPublic: true,
  },

  /* ------------------------------- content ------------------------------- */
  "content.testimonials": {
    key: "content.testimonials",
    category: "content",
    value: [],
    label: "Testimonials",
    description:
      "Empty by default. The current site has no testimonials; anything added here must be a real, consented quote.",
    isPublic: true,
  },

  /* -------------------------------- legal -------------------------------- */
  "legal.notAffiliated": {
    key: "legal.notAffiliated",
    category: "legal",
    value: LEGAL.notAffiliated,
    label: "Not-affiliated disclaimer",
    description: "Reproduced verbatim in the site footer and in every email.",
    isPublic: true,
  },
  "legal.noGuarantee": {
    key: "legal.noGuarantee",
    category: "legal",
    value: LEGAL.noGuarantee,
    label: "No-guarantee disclaimer",
    isPublic: true,
  },
  "legal.noAdvancePayment": {
    key: "legal.noAdvancePayment",
    category: "legal",
    value: LEGAL.noAdvancePayment,
    label: "No-advance-payment promise",
    isPublic: true,
  },
  "legal.governingLaw": {
    key: "legal.governingLaw",
    category: "legal",
    value: LEGAL.governingLaw,
    label: "Governing law",
    isPublic: true,
  },
  "legal.privacyLastUpdated": {
    key: "legal.privacyLastUpdated",
    category: "legal",
    value: LEGAL.privacyLastUpdated,
    label: "Privacy policy last updated",
    isPublic: true,
  },
};

/** Shape a setting key must take: `category.name`, no credentials. */
const KEY_PATTERN = /^[a-z][a-zA-Z0-9]*(\.[a-zA-Z0-9_]+)+$/;

const publicRowValidator = v.object({
  key: v.string(),
  value: v.any(),
  category: v.string(),
});

/* -------------------------------------------------------------------------- */
/*                                   Reads                                    */
/* -------------------------------------------------------------------------- */

/**
 * **Public query — no auth.** Powers the marketing footer, the contact page
 * and anything else rendered for an anonymous visitor.
 *
 * Returns `{ key, value, category }` rows: the public defaults, with any
 * stored public row layered on top. `hooks/use-site-settings.ts` turns it
 * into a map and applies its own fallbacks, so the site renders correctly on
 * a database with no `appSettings` rows at all.
 *
 * A stored row whose key has a *private* default is dropped: the default
 * decides visibility for keys we know about, so a row flipped public by
 * mistake (or by a migration) cannot leak an internal flag.
 */
export const getPublic = query({
  args: {},
  returns: v.array(publicRowValidator),
  handler: async (ctx) => {
    const merged = new Map<string, { key: string; value: unknown; category: string }>();

    for (const def of Object.values(SETTINGS_DEFAULTS)) {
      if (def.isPublic) {
        merged.set(def.key, {
          key: def.key,
          value: def.value,
          category: def.category,
        });
      }
    }

    const rows = await ctx.db
      .query("appSettings")
      .withIndex("by_isPublic", (q) => q.eq("isPublic", true))
      .take(500);

    for (const row of rows) {
      const def = SETTINGS_DEFAULTS[row.key];
      if (def && !def.isPublic) continue; // never publishable
      merged.set(row.key, {
        key: row.key,
        value: row.value,
        category: row.category,
      });
    }

    return Array.from(merged.values());
  },
});

/**
 * Every setting with its metadata, for Admin → Settings.
 *
 * Defaults appear as rows flagged `isDefault: true`, so the UI can show
 * "not configured — using the built-in value" instead of pretending somebody
 * chose it.
 */
export const getAll = query({
  args: { category: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requirePermission(ctx, PERMISSIONS.SETTINGS_VIEW);

    const rows = args.category
      ? await ctx.db
          .query("appSettings")
          .withIndex("by_category", (q) => q.eq("category", args.category!))
          .take(500)
      : await ctx.db.query("appSettings").take(500);

    const byKey = new Map(rows.map((row) => [row.key, row]));

    const merged = Object.values(SETTINGS_DEFAULTS)
      .filter((def) => !args.category || def.category === args.category)
      .map((def) => {
        const row = byKey.get(def.key);
        byKey.delete(def.key);
        return {
          key: def.key,
          category: def.category,
          label: row?.label ?? def.label,
          description: row?.description ?? def.description ?? null,
          value: row ? row.value : def.value,
          defaultValue: def.value as unknown,
          isPublic: row ? row.isPublic : def.isPublic,
          isDefault: !row,
          updatedAt: row?.updatedAt ?? null,
          updatedBy: row?.updatedBy ?? null,
        };
      });

    // Rows with no matching default — added by hand or by a later migration.
    for (const row of byKey.values()) {
      merged.push({
        key: row.key,
        category: row.category,
        label: row.label ?? row.key,
        description: row.description ?? null,
        value: row.value,
        defaultValue: null,
        isPublic: row.isPublic,
        isDefault: false,
        updatedAt: row.updatedAt,
        updatedBy: row.updatedBy ?? null,
      });
    }

    return merged.sort((a, b) =>
      a.category === b.category
        ? a.key.localeCompare(b.key)
        : a.category.localeCompare(b.category),
    );
  },
});

/* -------------------------------------------------------------------------- */
/*                                   Writes                                   */
/* -------------------------------------------------------------------------- */

function assertWritableKey(key: string) {
  if (key.length > 120 || !KEY_PATTERN.test(key)) {
    throw new ConvexError({
      code: "VALIDATION",
      message:
        "A setting key must look like `category.name` and contain only letters, digits, dots and underscores.",
    });
  }
  // Belt and braces: nothing that smells like a credential goes in this table,
  // which is readable by anyone with `settings:view` and, if marked public, by
  // the whole internet.
  if (/(secret|token|password|api_?key|private_?key)/i.test(key)) {
    throw new ConvexError({
      code: "VALIDATION",
      message:
        "Credentials belong in the Convex environment variables, not in app settings.",
    });
  }
}

export const set = mutation({
  args: {
    key: v.string(),
    value: v.any(),
    category: v.optional(v.string()),
    label: v.optional(v.string()),
    description: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.SETTINGS_EDIT);
    assertWritableKey(args.key);

    const def = SETTINGS_DEFAULTS[args.key];
    const now = Date.now();

    const existing = await ctx.db
      .query("appSettings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    // Visibility of a *known* key is fixed by its default, so the admin UI
    // cannot accidentally publish an internal flag.
    const isPublic = def ? def.isPublic : (args.isPublic ?? false);

    const before = existing ? existing.value : (def?.value ?? null);

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        category: args.category ?? existing.category,
        label: args.label ?? existing.label,
        description: args.description ?? existing.description,
        isPublic,
        updatedBy: staff.user._id,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("appSettings", {
        key: args.key,
        category: args.category ?? def?.category ?? "general",
        value: args.value,
        label: args.label ?? def?.label,
        description: args.description ?? def?.description,
        isPublic,
        updatedBy: staff.user._id,
        updatedAt: now,
      });
    }

    await recordAudit(ctx, {
      actor: staff.user,
      action: AUDIT_ACTIONS.SETTINGS_UPDATED,
      entityType: "setting",
      entityId: args.key,
      summary: `Updated setting ${args.key}`,
      before: { value: before },
      after: { value: args.value },
    });

    return null;
  },
});

/** Save a whole settings panel in one transaction. */
export const setMany = mutation({
  args: {
    settings: v.array(v.object({ key: v.string(), value: v.any() })),
  },
  returns: v.object({ updated: v.number() }),
  handler: async (ctx, args) => {
    const staff = await requirePermission(ctx, PERMISSIONS.SETTINGS_EDIT);

    if (args.settings.length > 100) {
      throw new ConvexError({
        code: "VALIDATION",
        message: "Too many settings in one request.",
      });
    }

    const now = Date.now();
    const changed: { key: string; before: unknown; after: unknown }[] = [];

    for (const setting of args.settings) {
      assertWritableKey(setting.key);

      const def = SETTINGS_DEFAULTS[setting.key];
      const existing = await ctx.db
        .query("appSettings")
        .withIndex("by_key", (q) => q.eq("key", setting.key))
        .unique();

      const before = existing ? existing.value : (def?.value ?? null);
      // Skip no-op saves so the audit log records intent, not form submits.
      if (JSON.stringify(before) === JSON.stringify(setting.value)) continue;

      if (existing) {
        await ctx.db.patch(existing._id, {
          value: setting.value,
          updatedBy: staff.user._id,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("appSettings", {
          key: setting.key,
          category: def?.category ?? "general",
          value: setting.value,
          label: def?.label,
          description: def?.description,
          isPublic: def?.isPublic ?? false,
          updatedBy: staff.user._id,
          updatedAt: now,
        });
      }

      changed.push({ key: setting.key, before, after: setting.value });
    }

    if (changed.length > 0) {
      // One audit row for the whole save, so the timeline reads "updated 4
      // settings" rather than four near-identical entries.
      await recordAudit(ctx, {
        actor: staff.user,
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        entityType: "setting",
        entityId: changed.map((c) => c.key).join(","),
        summary: `Updated ${changed.length} setting${
          changed.length === 1 ? "" : "s"
        }: ${changed.map((c) => c.key).join(", ")}`,
        before: Object.fromEntries(changed.map((c) => [c.key, c.before])),
        after: Object.fromEntries(changed.map((c) => [c.key, c.after])),
      });
    }

    return { updated: changed.length };
  },
});
