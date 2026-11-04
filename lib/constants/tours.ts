/**
 * Guided tours.
 *
 * Each step points at a real element through `data-tour="<anchor>"`. The tour
 * runner skips any step whose anchor is not on the page — which is what makes
 * one staff tour work for six different roles: a support agent simply never
 * sees the Payments step, because the nav item their role cannot open was
 * never rendered.
 *
 * Bump `version` when the steps change materially. The id the runner stores is
 * `${id}@${version}`, so an edited tour re-introduces itself once to people who
 * had already dismissed the old one, instead of staying invisible forever.
 */

export interface TourStep {
  /** Matches `data-tour="…"` in the DOM. Omit for a centred, anchorless step. */
  anchor?: string;
  title: string;
  body: string;
  /** Preferred side; the runner flips it when there is no room. */
  placement?: "top" | "bottom" | "left" | "right";
}

export interface Tour {
  id: string;
  version: number;
  label: string;
  steps: TourStep[];
}

/** The key actually persisted, so an edited tour can be shown again. */
export function tourKey(tour: Tour): string {
  return `${tour.id}@${tour.version}`;
}

export const CUSTOMER_TOUR: Tour = {
  id: "customer-portal",
  version: 1,
  label: "Portal walkthrough",
  steps: [
    {
      title: "Welcome to your VisaDrive portal",
      body: "A quick thirty-second tour of where everything lives. You can stop at any point, and replay it later from the Help button.",
    },
    {
      anchor: "customer-nav",
      placement: "right",
      title: "Everything is in this menu",
      body: "Dashboard for a summary, Applications for each booking, Payments for receipts, Notifications for anything we need from you, and Profile for your details.",
    },
    {
      anchor: "customer-apply",
      placement: "bottom",
      title: "Start a new application here",
      body: "Pick your destination and visa type, and we open a draft. Drafts save themselves as you go — you can close the tab and finish later.",
    },
    {
      anchor: "customer-nav-applications",
      placement: "right",
      title: "Track every application",
      body: "Each one shows its current status, the documents we have received, and a timeline that updates as we lodge and follow up with the consulate.",
    },
    {
      anchor: "customer-nav-notifications",
      placement: "right",
      title: "We tell you the moment something changes",
      body: "If a document needs replacing, this is where you will see exactly what to change. Nothing important only goes to email.",
    },
    {
      anchor: "help-launcher",
      placement: "left",
      title: "Stuck? Ask here",
      body: "The Help button answers common questions instantly. If it cannot, it passes your question to our team with one click — you do not have to find an email address.",
    },
  ],
};

export const STAFF_TOUR: Tour = {
  id: "staff-crm",
  version: 1,
  label: "CRM walkthrough",
  steps: [
    {
      title: "Welcome to the VisaDrive CRM",
      body: "A short tour of the workspace. You will only be shown the areas your role can open, so this is already tailored to your account.",
    },
    {
      anchor: "admin-nav",
      placement: "right",
      title: "Your workspace, grouped by job",
      body: "Overview for the day's numbers, Operations for live work, People for customers and colleagues, System for the catalogue and settings. Anything your role cannot open is simply not listed.",
    },
    {
      anchor: "admin-nav-applications",
      placement: "right",
      title: "Applications is where the work happens",
      body: "Filter by status, payment, destination or assigned agent. Open one to review documents, change its status, correct trip details and talk to the customer — all on a single page.",
    },
    {
      anchor: "admin-nav-enquiries",
      placement: "right",
      title: "Enquiries are leads, not bookings",
      body: "Everything from the website form and the help assistant lands here. Assign it, set a follow-up date, log each contact attempt, and convert it to an application when it closes.",
    },
    {
      anchor: "admin-nav-conversations",
      placement: "right",
      title: "Customer messages, plus internal notes",
      body: "Internal notes are stripped before a customer ever loads the thread, so you can brief a colleague in the same place you answer the customer.",
    },
    {
      anchor: "help-launcher",
      placement: "left",
      title: "Help is always one click away",
      body: "Ask how any part of the CRM works — permissions, statuses, refunds, document review. You can replay this tour from there too.",
    },
  ],
};
