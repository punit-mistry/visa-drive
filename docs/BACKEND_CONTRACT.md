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
   `requireApplicationAccess`, `requireDocumentAccess`,
   `requireConversationAccess`. **Never** read a role from an argument.
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
| `setRole` | mutation | Requires `staff:assign_role`; blocks escalation above the actor. |
| `suspendCustomer` / `reactivateCustomer` | mutation | Requires `customer:suspend`. Audited. |
| `upsertFromClerk` | internalMutation | Called by the Clerk webhook. |
| `deleteFromClerk` | internalMutation | Soft-delete on Clerk user deletion. |
| `listStaff` | query | Requires `staff:view`. |
| `inviteStaff` | mutation | Requires `staff:manage`. Creates or promotes a user + staffProfile. |
| `updateStaffProfile` | mutation | Requires `staff:manage`. |
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
| `getDraft` | query | Owner only. Full wizard state. |
| `listMyDrafts` | query | Owner only. |
| `submit` | mutation | Validates completeness, freezes `pricing`, writes `statusHistory`, notifies. |
| `listMine` | query | Paginated. Owner only. |
| `getMine` | query | Owner only. Application + applicants + documents + timeline + payments. |
| `getByReference` | query | Owner-or-staff. For the confirmation page. |
| `cancelMine` | mutation | Owner only, and only while pre-processing. |
| `listForAdmin` | query | Paginated + filters `{ search?, status?, paymentStatus?, destinationId?, assignedAgentId?, dateFrom?, dateTo?, sort? }`. |
| `getForAdmin` | query | Full workspace payload. |
| `updateStatus` | mutation | Validates against `ALLOWED_TRANSITIONS`. Audited + notifies. |
| `bulkUpdateStatus` | mutation | Requires `application:bulk_update`. |
| `assignAgent` | mutation | Requires `application:assign`. |
| `uploadFinalDocument` | mutation | Requires `application:upload_final_document`. |
| `markCompleted` | mutation | Requires `application:update_status`. |
| `exportCsv` | action | Requires `application:export`. Returns a CSV string. |

## `convex/applicants.ts`

`listByApplication`, `upsert`, `remove`, `reorder`. Owner-or-staff, ownership
verified through the parent application.

## `convex/travelers.ts`

`listMine`, `upsert`, `remove`, `applyToApplication`. Owner only.

## `convex/documents.ts`

| Export | Kind | Purpose |
| --- | --- | --- |
| `generateUploadUrl` | mutation | Owner-or-staff. Checks the application is still editable. |
| `attach` | mutation | Records a document after upload. Supersedes any previous version. |
| `listByApplication` | query | Owner-or-staff. Returns the checklist merged with uploads. |
| `getSignedUrl` | query | **The only way a file URL is ever minted.** Ownership/permission checked. |
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

`submit` (**public mutation, no auth** — rate-limited, returns a reference),
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
