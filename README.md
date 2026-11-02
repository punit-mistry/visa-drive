# VisaDrive

A visa application and booking platform for **VisaDrive** — a private visa
consultancy based in Khar West, Mumbai.

Three surfaces on one Convex backend:

| Surface | Route | Who |
| --- | --- | --- |
| Public website | `/` | Visitors discovering visa services |
| Customer portal | `/dashboard`, `/apply` | Registered customers |
| Admin CRM | `/admin` | VisaDrive staff |

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
shadcn/ui · lucide-react · Motion · Convex · Clerk · Razorpay · Resend ·
WhatsApp Business Cloud API.

---

## Getting started

```bash
npm install
cp .env.example .env.local     # then fill in the values below
npx convex dev                 # terminal 1 — backend
npm run dev                    # terminal 2 — frontend
```

A **local Convex deployment** is already configured in `.env.local`, so the
backend runs on your machine with no Convex account. To move to a cloud
deployment later, run `npx convex dev --configure` and pick a cloud dev
deployment.

### What you must configure before it works

**Clerk (required).** Without it the app renders a setup screen instead of
crashing.

1. Create an application at [dashboard.clerk.com](https://dashboard.clerk.com).
2. Copy the keys into `.env.local`:
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   ```
3. Create a **JWT template named exactly `convex`**. Copy its Issuer URL and
   set it on the Convex deployment (not in `.env.local`):
   ```bash
   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-app.clerk.accounts.dev
   ```
   A placeholder is currently set — **replace it**, or authentication will
   fail.
4. Add a webhook pointing at `<your-convex-site-url>/clerk-webhook` for
   `user.created`, `user.updated`, `user.deleted`, and put its signing secret
   in `CLERK_WEBHOOK_SECRET`. This is what creates the Convex `users` row.

**Everything else is optional** and degrades cleanly:

| Integration | Without it |
| --- | --- |
| Razorpay | Products set to `pay_now` fall back to the manual payment flow |
| Resend | Emails are logged to the Convex console instead of sent |
| WhatsApp Cloud API | Outbound WhatsApp notices are skipped and recorded as skipped. The click-to-chat button still works — it needs no credentials |

### Seeding the demo environment

```bash
npx convex env set SEED_SUPER_ADMIN_EMAIL you@example.com
```

Sign in once with that email, then run the seed from `/admin/settings`, or:

```bash
npx convex run seed:run
```

This creates the six launch destinations, their visa products, document
checklists, FAQs, and a set of demo customers, applications, payments,
enquiries and conversations so the dashboards have real data to aggregate.

`npx convex run seed:reset` removes only demo-flagged rows.

---

## ⚠ Content the client must verify before launch

The platform was rebuilt from the existing visadrive.in site (audited
2026-11-02). Some of what is there could not be taken at face value. The full
list lives in `NEEDS_VERIFICATION` in `lib/constants/site.ts` and is surfaced
in **Admin → Settings**. The important ones:

- **All seeded visa fees, processing times and document requirements are
  demonstration content.** Every seeded product carries `isDemoContent: true`
  and renders with a "Sample data" badge. An admin cannot publish a product
  until an official source URL and a verified date are recorded. Nothing here
  should be presented to a customer as official until that is done.
- **Headline statistics were dropped.** The current site shows "500 Satisfied
  Customers" and "100 Leads in Pipeline"; both read as WordPress theme filler,
  so neither was carried over.
- **The "interview dates within 30 days" claim was reworded.** It contradicts
  the site's own no-guarantee disclaimer.
- **The 24×7 number (8693898794)** appears only on the privacy page and is
  hidden until confirmed.
- **`premdesai@visadrive.in` is the founder's personal address.** A role
  address is recommended for a booking platform.
- **Testimonials are labelled demo content.** The current site has none; real,
  consented quotes must replace them.

The legal disclaimers in `LEGAL` (`lib/constants/site.ts`) are the client's own
words and are reproduced verbatim. They are the guard against the
guarantee-style marketing copy elsewhere, so they should not be paraphrased or
dropped.

---

## Architecture notes

**Authorisation.** Every protected Convex function begins with a helper from
`convex/lib/auth.ts`. A role or user id arriving as an argument is ignored —
the role is read from the `users` row, and ownership is verified against the
row being touched. The middleware in `middleware.ts` is a routing convenience,
not the security boundary.

**Money.** Integers in paise everywhere — storage, arithmetic, Razorpay calls.
Only `formatMoney()` converts for display. Totals are recomputed server-side on
every payment path; a client-supplied amount is never accepted. An application
is marked paid in exactly one place, reached only from a signature-verified
webhook or a permission-checked manual entry, and that path is idempotent so a
retried webhook cannot double-count revenue.

**Documents.** `ctx.storage.getUrl` is called in exactly one function,
`documents.getSignedUrl`, and only after an ownership/permission check. Passport
scans and bank statements are never reachable by URL alone.

**Notifications.** Everything funnels through
`internal.notifications.dispatch`, which dedupes on a `dedupeKey` before
writing or sending anything. That is what stops a retried webhook or a
double-clicked button from emailing a customer twice.

**Analytics.** Every figure on the admin dashboard is computed from real rows.
Nothing is hardcoded.

See `CLAUDE.md` for coding conventions and `docs/BACKEND_CONTRACT.md` for the
binding list of Convex functions.

---

## Design system

The palette is derived from the real VisaDrive logo rather than invented:
signal red `#D82828` (the "VISA" wordmark), ink charcoal `#201820` ("DRIVE"),
and navy `#2B4A9B` (the globe swoosh). Red is used as a signal colour — CTAs,
active state, brand marks — never as a background wash.

Tokens live in `app/globals.css` as OKLCH custom properties with a full dark
mode. Use semantic tokens (`bg-card`, `text-muted-foreground`, `border-border`)
rather than raw colours.

## Scripts

```bash
npm run dev      # Next.js dev server
npm run build    # production build
npm run start    # serve the production build
npm run lint     # ESLint
npx tsc --noEmit # typecheck
```
