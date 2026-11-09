# VisaDrive — Convex backend contract

This file is the agreed surface between the Convex backend and the three
front-end surfaces (marketing, customer portal, admin CRM). **Function names
and argument shapes here are binding** — the UI is written against them.

If you need a function that is not listed, add it *and append it here* in the
same change.

## Ground rules

1. Every function declares `args` with `v.*` validators and a `returns`
   validator where practical.
2. `query` / `mutation` / `action` = public (still auth-checked inside).
   `internalQuery` / `internalMutation` / `internalAction` = callable only
   from other Convex functions or the scheduler.
3. Protected functions begin with a helper from `convex/lib/auth.ts`:
   `requireUser`, `requireStaff`, `requirePermission`, `requireRole`,
   `requireApplicationAccess`, `requireBookingEditor`, `requireDocumentAccess`,
   `requireConversationAccess`, `requirePartner`. **Never** read a role — or a
   partner id — from an argument.
4. Money is an integer in the smallest currency unit (paise).
5. Admin actions that change status, money, permissions or customer-visible
   data call `recordAudit` from `convex/lib/audit.ts`.
6. Notifications are never created inline. Call:
   `ctx.scheduler.runAfter(0, internal.notifications.dispatch, { ... })`.
7. Paginated list queries use Convex `paginationOpts` and return
   `{ page, isDone, continueCursor }`.

---

## `convex/users.ts`

| Export | Kind | Purpose |
| --- | --- | --- |
| `current` | query | Current user row + resolved permissions, or `null`. |
| `getById` | query | Staff-only lookup of one user. |
| `listCustomers` | query | Paginated, filter `{ search?, status?, sort? }`. Requires `customer:view`. |
| `customerProfile` | query | One customer + applications, payments, conversations summary. |
| `updateProfile` | mutation | Caller edits their own name/phone/opt-ins. |
| `markTourSeen` | mutation | Self-only. Records a dismissed guided tour on `users.dismissedTours`; capped at 20 ids. Unaudited — a UI preference, not a consequential change. |
| `resetTour` | mutation | Self-only. Removes one tour id so the walkthrough can be replayed. |
| `updateCustomer` | mutation | Requires `customer:edit`. Name, phone and opt-ins only; re-snapshots the name/phone onto the customer's recent applications. Refuses staff targets. |
| `setRole` | mutation | Requires `staff:assign_role`; blocks escalation above the actor. |
| `suspendCustomer` / `reactivateCustomer` | mutation | Requires `customer:suspend`. Audited. |
| `upsertFromClerk` | internalMutation | Called by the Clerk webhook. Returns the user id, or `null` when the address already belongs to another row and this identity has not verified it. |
| `syncFromClerk` | mutation | Self-heal when the webhook lags. Builds the row from the verified JWT only; `{ status: "ready" \| "incomplete" \| "deleted" }`. |
| `deleteFromClerk` | internalMutation | Soft-delete on Clerk user deletion. |
| `listStaff` | query | Requires `staff:view`. |
| `inviteStaff` | mutation | Requires `staff:manage`. Creates or promotes a user + staffProfile. Re-inviting an existing account is a role change, so it carries the same rank and last-super-admin guards as `setRole`. |
| `updateStaffProfile` | mutation | Requires `staff:manage`. Only a super admin may edit a super admin's profile; `extraPermissions` must be known permissions the actor already holds; cannot deactivate the last super admin. |
| `linkClerkAccount` | mutation | Requires `staff:manage`. Attaches a provisioned sign-in to an invited row; only ever rewrites a `pending:` placeholder, onto a Clerk id nobody else holds. |
| `deactivateStaff` | mutation | Requires `staff:manage`. |

## `convex/destinations.ts`

| Export | Kind | Purpose |
| --- | --- | --- |
| `listPublished` | query | Public. Ordered by `displayOrder`. Includes `startingPrice` + `productCount`. |
| `getBySlug` | query | Public. Returns destination + published products + FAQs, or `null`. |
| `listAll` | query | Admin. Requires `catalogue:view`. |
| `create` / `update` | mutation | Requires `catalogue:edit`. Audited. |
| `setPublished` | mutation | Requires `catalogue:publish`. Audited. |
| `remove` | mutation | Requires `catalogue:delete`. Refuses if products exist. |
| `reorder` | mutation | Requires `catalogue:edit`. |

## `convex/visaProducts.ts`

| Export | Kind | Purpose |
| --- | --- | --- |
| `listByDestinationSlug` | query | Public, published only. |
| `getBySlug` | query | Public. `{ destinationSlug, slug }` → product + requirements + FAQs. |
| `listAll` | query | Admin, filters `{ destinationId?, category?, isPublished? }`. |
| `create` / `update` | mutation | Requires `catalogue:edit`. Audited. |
| `setPublished` | mutation | Requires `catalogue:publish`. Audited. |
| `remove` | mutation | Requires `catalogue:delete`. |
| `duplicate` | mutation | Requires `catalogue:edit`. |
| `searchForDiscovery` | query | Public. Powers the homepage discovery form: `{ fromCountry?, toCountry?, purpose? }`. |

## `convex/visaRequirements.ts`

`listByProduct` (public query), `create`, `update`, `remove`, `reorder`
(mutations, `catalogue:edit`).

## `convex/visaFAQs.ts`

`listPublic` (query, `{ scope, destinationId?, visaProductId? }`), `listAll`,
`create`, `update`, `remove`, `reorder`.

## `convex/applications.ts`

| Export | Kind | Purpose |
| --- | --- | --- |
| `createDraft` | mutation | `{ visaProductId, travellerCount }` → `{ applicationId, referenceId }`. |
| `saveDraftStep` | mutation | Autosave. `{ applicationId, step, patch }`. Owner only. |
| `getDraft` | query | Owner, or the partner who placed a B2B booking. Full wizard state: application + applicants + documents + product + requirements + destination. `application.partnerMargin` is present only for the partner. |
| `listMyDrafts` | query | Owner only. Never includes `partnerMargin`. |
| `submit` | mutation | Validates completeness, freezes `pricing`, writes `statusHistory`, notifies. |
| `listMine` | query | Paginated. Owner only. Never includes `partnerMargin`. |
| `getMine` | query | Owner only. Application + applicants + documents + timeline + payments. `partnerMargin` is stripped for the owner (the end traveller on a B2B booking); kept only for the placing partner or staff. |
| `getByReference` | query | Owner-or-staff. For the confirmation page. Same `partnerMargin` rule as `getMine`. |
| `cancelMine` | mutation | Owner only, and only while pre-processing. |
| `listForAdmin` | query | Paginated + filters `{ search?, status?, paymentStatus?, destinationId?, assignedAgentId?, dateFrom?, dateTo?, sort? }`. Each row also carries `assignedAgentName` and `partnerName` (agency name for B2B bookings, else `null`). `partnerMargin` is always stripped from rows (the list never renders it). |
| `getForAdmin` | query | Full workspace payload, plus for B2B bookings: `partner: { _id, partnerCode, agencyName, contactPersonName, contactEmail, contactPhone, businessType, city, country, status, bookingCount } \| null`, `partnerCustomer: { _id, fullName, email, phone?, reference? } \| null` (the partner's `partnerCustomers` row for the booking's customer), `commercials: { partnerMargin: <frozen snapshot> \| null } \| null`. `partner` is `null` unless the caller holds `partner:view`. `commercials` is `null` and `application.partnerMargin` is removed unless the caller holds `partner:pricing`; `partnerMargin: null` means not frozen yet. |
| `updateStatus` | mutation | Validates against `ALLOWED_TRANSITIONS`. Audited + notifies. |
| `bulkUpdateStatus` | mutation | Requires `application:bulk_update`. |
| `updateTripDetails` | mutation | Requires `application:update_status`. Staff correcting travel dates, purpose, departure country and contact phone after submission. Cannot reach status, pricing or travellerCount. Audited. |
| `assignAgent` | mutation | Requires `application:assign`. |
| `uploadFinalDocument` | mutation | Requires `application:upload_final_document`. |
| `markCompleted` | mutation | Requires `application:update_status`. |
| `exportCsv` | action | Requires `application:export`. Returns a CSV string. |

## `convex/partners.ts`

B2B partner accounts. Approval (`setStatus` → `approved`) is the **only** thing
that grants the `partner` role, and anything else takes it back;
`users.setRole` deliberately cannot reach the role at all
(`assignableRoles` excludes it).

| Export | Kind | Purpose |
| --- | --- | --- |
| `register` | mutation | Signed-in caller applies to become a partner. Re-submitting while pending/rejected updates the same row rather than creating a second. Notifies staff holding `partner:approve`. |
| `myProfile` | query | The caller's own partner row via `publicPartnerView` (no internal note, no reviewer), or `null`. Never throws — the "not a partner yet" screen needs it. |
| `updateMyProfile` | mutation | Partner edits their own business details. Changing name, type or GSTIN on an approved account returns it to `under_review`. |
| `listForAdmin` | query | Paginated + filters `{ search?, status?, businessType?, sort? }`. Requires `partner:view`. |
| `overview` | query | KPI strip, top partners, pending approvals, recent activity. Requires `partner:view`. |
| `getForAdmin` | query | Partner + login + documents + allowed transitions. Requires `partner:view`. |
| `bookingsForAdmin` / `customersForAdmin` | query | Paginated, scoped to one partner. Requires `partner:view`. |
| `activityForAdmin` | query | The partner's timeline, read from `auditLogs` by entity. |
| `createByAdmin` | mutation | Requires `partner:manage` (plus `partner:approve` for `approveNow`). Reuses an existing login by email; refuses a staff address. |
| `updateByAdmin` / `setInternalNote` | mutation | Requires `partner:manage`. |
| `setDefaultMarkup` | mutation | Requires `partner:pricing`. Audited + notifies the partner. |
| `setStatus` | mutation | Requires `partner:approve`. Validates against `PARTNER_TRANSITIONS`; reject/suspend demand a reason. Grants or revokes the role. Audited + notifies. |
| `remove` | mutation | Requires `partner:manage`. Soft delete — bookings and audit trail survive. |
| `recount` | mutation | Rebuilds the denormalised counters. |
| `exportCsv` | action | Requires `partner:export`. |
| `myDashboard` | query | The partner's own KPIs and trend. Scoped by `requirePartner`. |
| `myQuote` | query | Server-computed price for one product at one traveller count. |

## `convex/partnerPricing.ts`

One rule per (partner, visa product); the row stores the *recipe*
(`markup_percent` / `markup_amount` / `fixed_price`), never a resolved total,
so a catalogue change flows through without a backfill.

| Export | Kind | Purpose |
| --- | --- | --- |
| `listForPartner` | query | The margin table. Requires `partner:view`. |
| `setRule` | mutation | Requires `partner:pricing`. Refuses a fixed price below the government fee. Audited + notifies. |
| `clearRule` | mutation | Requires `partner:pricing`. Deactivates rather than deletes. |
| `bulkSetForDestination` | mutation | Requires `partner:pricing`. Markup modes only. |
| `myCatalogue` | query | The partner's own read-only price list. Partner id comes from the session. |
| `myProduct` | query | One product + requirements + the partner's quote, for the booking wizard. |

## `convex/partnerBookings.ts`

**No function here takes a partner id as an argument** — every one resolves it
from the session with `requirePartner`, which is what makes cross-partner
access impossible rather than merely checked.

| Export | Kind | Purpose |
| --- | --- | --- |
| `upsertCustomer` | mutation | Add or edit a customer on the caller's own book. Links an existing `users` row by email; refuses a staff address. |
| `listMyCustomers` / `myCustomer` | query | The caller's customer book and one customer's booking history. |
| `archiveCustomer` | mutation | Archive / restore. |
| `createDraft` | mutation | Starts a booking. `pricing` and `partnerMargin` are computed by `resolvePartnerQuote`; the traveller owns the application, the partner is stamped on it. Idempotent per (product, customer). |
| `listMine` / `getMine` / `listMyDrafts` | query | Scoped reads. `getMine` strips the internal timeline and the assigned agent, and adds the margin. |
| `discardDraft` | mutation | Cancels an unsubmitted draft. |

Submission goes through the existing `applications.submit` — there is no second
booking system. `requireBookingEditor` in `convex/lib/auth.ts` is what lets the
partner reach the wizard mutations (`getDraft`, `saveDraftStep`, `submit`,
`cancelMine`) on an application the traveller owns.

## `convex/partnerDocuments.ts`

`generateUploadUrl`, `attach`, `listMine`, `listForAdmin` (`partner:view`),
`review` (`partner:approve`, rejection needs a note), `remove`. Also exports
`requirePartnerDocumentAccess`, used by `documents.getPartnerSignedUrl`.

## `convex/applicants.ts`

`listByApplication`, `upsert`, `remove`, `reorder`. Owner-or-staff, ownership
verified through the parent application.

## `convex/travelers.ts`

`listMine`, `upsert`, `remove`, `applyToApplication`. Owner only.

## `convex/documents.ts`

| Export | Kind | Purpose |
| --- | --- | --- |
| `generateUploadUrl` | mutation | Owner-or-staff-or-partner. Checks the application is still editable. |
| `attach` | mutation | Records a document after upload. Supersedes any previous version. |
| `listByApplication` | query | Owner-or-staff. Returns the checklist merged with uploads. |
| `getSignedUrl` | query | Mints a traveller file's URL after `requireDocumentAccess`. |
| `getPartnerSignedUrl` | query | Mints a partner's business-document URL after `requirePartnerDocumentAccess`. |

**These two exports are the only places in the codebase that call
`ctx.storage.getUrl`.** Both live in this module so "where can a file URL come
from?" has a one-file answer.
| `review` | mutation | Requires `document:review`. `{ documentId, status, note? }`. Audited + notifies. |
| `remove` | mutation | Owner (before submit) or `document:delete`. |
| `listForAdmin` | query | Paginated, filter `{ status?, applicationId?, reviewerId? }`. |

## `convex/documentRequests.ts`

`create` (`document:request`), `listByApplication`, `cancel`, `fulfil`
(internal, called by `documents.attach`).

## `convex/payments.ts`

| Export | Kind | Purpose |
| --- | --- | --- |
| `createRazorpayOrder` | action | Owner only. Recomputes the total server-side; never trusts a client amount. |
| `verifyRazorpayPayment` | action | Verifies HMAC signature. Idempotent via `providerEventId`. |
| `handleWebhookEvent` | internalAction | Called from `http.ts`. The authoritative paid signal. |
| `markPaidInternal` | internalMutation | Single place that flips an application to `paid`. |
| `recordManualPayment` | mutation | Requires `payment:record`. Audited. |
| `recordRefund` | mutation | Requires `payment:refund`. Audited. |
| `listMine` | query | Owner only. |
| `listForAdmin` | query | Paginated + filters. Requires `payment:view`. |
| `financeSummary` | query | Totals for the finance dashboard. |
| `exportCsv` | action | Requires `payment:export`. |

## `convex/enquiries.ts`

`submit` (**public mutation, no auth** — rate-limited, returns a reference;
`source` accepts `help_assistant` for questions handed over from the in-app
help panel),
`listForAdmin`, `getForAdmin`, `updateLeadStatus`, `assign`,
`setFollowUp`, `recordContactAttempt`, `convertToApplication`, `exportCsv`.

## `convex/conversations.ts`

`createForApplication`, `listMine`, `getMine`, `listForAdmin`, `getForAdmin`,
`updateStatus`, `assign`, `markRead`.

## `convex/messages.ts`

`listByConversation` (strips `isInternal` rows for customers), `send`,
`sendInternalNote`, `markRead`.

## `convex/notifications.ts`

| Export | Kind | Purpose |
| --- | --- | --- |
| `dispatch` | internalMutation | **The single entry point.** Dedupes on `dedupeKey`, writes the in-app row, schedules email/WhatsApp. |
| `listMine` / `unreadCount` | query | Owner only. |
| `markRead` / `markAllRead` | mutation | Owner only. |
| `sendEmail` | internalAction | Resend. No-ops with a log line when `RESEND_API_KEY` is unset. |
| `sendWhatsApp` | internalAction | WhatsApp Cloud API. No-ops when unset. |

`dispatch` args:
```ts
{
  userId: Id<"users">,
  type: string,              // see lib/constants/notifications.ts
  title: string,
  body: string,
  link?: string,
  dedupeKey: string,         // e.g. `app:${applicationId}:status:${status}`
  channels?: ("in_app" | "email" | "whatsapp")[],
  applicationId?, conversationId?, enquiryId?,
  emailTemplate?: string,
  emailData?: any,
}
```

## `convex/analytics.ts`

All require `analytics:view`. Every figure is computed from real rows — no
hardcoded numbers anywhere.

`overviewKpis`, `applicationsOverTime`, `revenueOverTime`,
`destinationBreakdown`, `categoryBreakdown`, `statusDistribution`,
`recentBookings`, `recentEnquiries`, `pendingTasks`, `followUpReminders`,
`conversionFunnel`.

## `convex/appSettings.ts`

`getPublic` (public query), `getAll` (`settings:view`), `set`
(`settings:edit`, audited), `setMany`.

## `convex/auditLogs.ts`

`listForAdmin` (paginated, `audit:view`), `listForEntity`.

## `convex/internalNotes.ts`

`listForEntity`, `add`, `remove`, `togglePin`. Staff only.

## `convex/admin.ts`

`dashboardSummary` (one call powering the admin home), `globalSearch`
(applications + customers + enquiries), `pendingWorkQueue`.

## `convex/seed.ts`

`run` (mutation, requires `seed:run` **or** an empty database on a local
deployment), `reset`, `status`. Seeds the six destinations, their visa
products, requirements, FAQs, plus demo customers/applications/payments/
conversations — all flagged `isDemoContent: true`.

## `convex/http.ts`

| Route | Purpose |
| --- | --- |
| `POST /clerk-webhook` | Svix-verified. → `users.upsertFromClerk` / `deleteFromClerk`. |
| `POST /razorpay-webhook` | HMAC-verified. → `payments.handleWebhookEvent`. |
| `GET /health` | Liveness. |

## `convex/crons.ts`

- Daily: follow-up reminder notifications for leads due today.
- Daily: nudge customers whose applications sit in `documents_pending` > 3 days.
- Hourly: expire abandoned drafts older than 30 days (soft, notifies first).
