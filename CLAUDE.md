# VisaDrive — project conventions

A visa application and booking SaaS platform for VisaDrive (visadrive.in), a
private visa consultancy in Khar West, Mumbai.

Four surfaces, one Convex backend:
- **Public website** — `app/(marketing)` — discovery, destinations, services.
- **Customer portal** — `app/(customer)` — booking wizard, documents, payments, tracking.
- **Partner portal** — `app/partner` — B2B agents booking for their own customers.
- **Admin CRM** — `app/admin` — applications, leads, catalogue, finance, support, staff, partners.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui
(new-york) · lucide-react · motion (Framer Motion) · Convex 1.49 · Clerk ·
Razorpay · Resend · WhatsApp Business Cloud API.

## Running it

```bash
npm run dev          # Next.js
npx convex dev       # Convex backend (local deployment already configured)
```

A **local** Convex deployment is configured in `.env.local` — no cloud account
needed for development. The dashboard URL is printed by `npx convex dev`.

Before the app is usable you also need Clerk keys in `.env.local`; see
`.env.example`. Without them the app renders a setup screen rather than
crashing.

## Non-negotiables

1. **Never trust the client for authorisation.** Every protected Convex
   function starts with a helper from `convex/lib/auth.ts`. A role or user id
   arriving as an argument is ignored. UI permission checks
   (`useCurrentUser().can`) hide controls; they do not secure anything.
2. **Never trust the client for money.** Totals are recomputed server-side with
   `computePricing` on every payment path. An application is marked paid only
   by `payments.markPaidInternal`, reached from a signature-verified Razorpay
   webhook or a permission-checked manual entry.
3. **Documents are private.** `ctx.storage.getUrl` is called in exactly one
   module — `convex/documents.ts` — in two exports: `getSignedUrl` (after
   `requireDocumentAccess`) for a traveller's files, and `getPartnerSignedUrl`
   (after `requirePartnerDocumentAccess`) for a B2B partner's business
   paperwork. Passport scans must never be reachable by URL alone.
4. **Internal notes stay internal.** `messages.listByConversation` strips
   `isInternal` rows for customer callers.
5. **No invented facts.** Visa fees, processing times, document requirements
   and embassy availability are admin-configured. Seeded values carry
   `isDemoContent: true` and render with a "Sample data" badge. Do not present
   placeholder figures as official, and do not fabricate testimonials or
   business statistics. See `NEEDS_VERIFICATION` in `lib/constants/site.ts`.
6. **No dead buttons.** Every rendered control does something real.
7. **Audit the consequential.** Status changes, money, permissions and
   customer-visible edits call `recordAudit`.
8. **A partner reaches only their own.** Every function in
   `convex/partnerBookings.ts` and `partnerPricing.myCatalogue` resolves the
   partner from the session via `requirePartner` — a partner id never arrives
   as an argument, so there is no parameter to tamper with. Partners have the
   *applicant* side of a booking (fill in, upload, cancel before processing)
   and never the office side: no status changes, no internal timeline.

## Money

Integers in the smallest currency unit (paise) everywhere — storage, Razorpay
calls, and arithmetic. Only `formatMoney()` converts for display. Never floats.

On a **B2B booking**, `applications.pricing.total` is the *partner price* —
what the agent's customer pays, and therefore what Razorpay is asked for.
`applications.partnerMargin` carries the base price VisaDrive charges the
partner and the margin between the two, frozen at submission so a later rate
change never rewrites what was earned. The maths lives in
`lib/helpers/partner-pricing.ts` and is resolved server-side by
`convex/lib/partners.ts` on every write — a partner never supplies a price.

## Dates

Epoch milliseconds. Display via `lib/helpers/format.ts`, which renders in
`en-IN` / `Asia/Kolkata`.

## Design system

Tokens live in `app/globals.css`. The palette is derived from the real
VisaDrive logo: signal red `#D82828`, primary action `#C62222`, ink charcoal
`#17141A`, on warm white `#FAF9FA` surfaces.

- Red is a **signal** colour — CTAs, links, focus, active state and the brand
  mark. Never a background wash, never a gradient field, never a full-page tint.
- `--destructive` is a deeper crimson `#B42318`, deliberately distinct from the
  brand red so a delete button never reads as the primary action. `--navy`
  `#2B4A9B` carries the "progress" status tone for the same reason.
- The Clerk appearance block in `app/layout.tsx`, the email accents in
  `lib/notifications/templates.ts` and the Razorpay checkout theme in
  `lib/payments/razorpay.ts` each carry their own copy of these hex values,
  because those surfaces render outside our CSS. Change the palette and all
  three have to move with it.
- White-dominant, high contrast, generous whitespace, hairline borders,
  restrained shadows (`elev-sm` … `elev-xl`).
- Use semantic tokens (`bg-card`, `text-muted-foreground`, `border-border`),
  not raw colours, so dark mode works for free.
- Status colours come from `TONE_CLASSES` in `lib/constants/statuses.ts` via
  the badges in `components/shared/status-badge.tsx`. Do not hand-roll a badge.
- Page gutters: `.container-page` (1200px) or `.container-wide` (1440px).
- The customer portal, the partner portal and the CRM must look like three
  products from one design system.

## Structure

```
app/(marketing)   public site          components/marketing
app/(auth)        sign-in / sign-up    components/forms
app/(customer)    portal + wizard      components/dashboard, components/application
app/partner       B2B partner portal   components/partner
app/admin         CRM                  components/admin, components/tables
convex/           backend              components/ui (shadcn), components/shared
lib/              constants, helpers, validators, payments, notifications
```

`docs/BACKEND_CONTRACT.md` is the binding list of Convex function names. If you
add a function, append it there in the same change.

## Convex conventions

- `args` validators on every function; `returns` where practical.
- `query`/`mutation`/`action` are public (still auth-checked inside);
  `internal*` variants are not reachable from the client.
- Use indexes. Never `.filter()` where an index exists; never `.collect()` an
  unbounded table in a page-load query.
- Throw `ConvexError({ code, message })` so the UI can branch on `code`.
- Notifications go through `internal.notifications.dispatch`, which dedupes on
  `dedupeKey` — that is what stops a retried webhook emailing twice.

## UX baseline

Loading skeletons, empty states, error states, toasts (`sonner`), confirmation
dialogs for destructive actions, inline form validation, autosaved drafts,
unsaved-change protection, working search/filter/sort/pagination, keyboard
navigable menus and dialogs, and visible focus rings (`.focus-brand`).

Admin is desktop-first; the customer booking flow is mobile-first. The partner
portal sits between the two — agents work at a desk but check status on a
phone, so it is responsive throughout.

## Model routing

You are the orchestrator. Do not do bulk work in the main conversation: delegate it.

| Task type | Delegate to | Model · effort |
| - | - | - |
| Find files, symbols, usages, "where is X" | `code-searcher` | haiku · low |
| Scoped edit: feature, fix, refactor in a few files | `implementer` | sonnet · medium |
| Debug an unclear or repeated failure | `implementer`, then `test-runner` | sonnet · medium |
| Review a risky diff: auth, payments, migrations, security, public API, concurrency | `reviewer` | opus · high |
| Anything else / unsure | `implementer` | sonnet · medium |

The `ai-router` MCP server (`.mcp.json`) exposes `route_task`,
`get_routing_policy` and `routing_stats`. Call `route_task` before delegating.

Rules:

1. Every delegation names one of the agents above, or passes `model` explicitly. Never let a subagent inherit the main model by accident.
2. When unsure of the tier, use the middle tier (sonnet). Never the cheapest tier on risky work.
3. Verify by risk: after every `implementer` edit, run `test-runner`. Send the diff to `reviewer` only when it touches the risky list above.
4. Escalate, don't loop: if the same test fails twice after `implementer` fixes, stop retrying. Send the diff and the failure to `reviewer`, then re-run `implementer` with the reviewer's findings. Do not re-run the whole task on a bigger model.
5. Keep one model per task. Do not run `/model` mid-task; delegate instead. A model switch re-reads the whole conversation with no cache hits.
6. Use the advisor before committing to an approach on a multi-file change, and before declaring a long task done.

<!-- by @donimas · AI Levels series -->

