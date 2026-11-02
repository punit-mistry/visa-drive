import type { Metadata } from "next";

import {
  LegalDocument,
  type LegalSection,
} from "@/components/marketing/legal-document";
import { LEGAL, SITE } from "@/lib/constants/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms on which VisaDrive provides visa documentation, appointment and interview preparation services.",
  alternates: { canonical: "/terms" },
};

/**
 * Built from the statements VisaDrive already publishes. Clauses they have
 * not written — liability, cancellation, dispute handling — are listed as
 * outstanding rather than drafted, because terms invented here would not be
 * terms they have agreed to.
 */
const SECTIONS: LegalSection[] = [
  {
    id: "about-these-terms",
    heading: "About these terms",
    body: [
      `These terms apply to the services ${SITE.name} provides through this website and to anyone who books one of them.`,
      LEGAL.notAffiliated,
    ],
  },
  {
    id: "what-we-do",
    heading: "What we do",
    body: [
      "We prepare and check visa applications, assist with appointments, and help you prepare for a visa interview. We act for you — we do not decide anything on an authority's behalf.",
      LEGAL.noGuarantee,
    ],
  },
  {
    id: "your-responsibilities",
    heading: "Your responsibilities",
    body: [
      LEGAL.accuracyObligation,
      "If something in your application changes — your travel dates, your passport, your circumstances — tell us as soon as you can, because it may change what is possible.",
    ],
  },
  {
    id: "appointments",
    heading: "Appointments",
    body: [LEGAL.appointmentAvailability, LEGAL.noAdvancePayment],
  },
  {
    id: "fees",
    heading: "Fees and payment",
    body: [LEGAL.governmentFeesSeparate],
    placeholder:
      "When service fees become payable, accepted payment methods, invoicing and tax treatment, and what happens if a payment fails.",
  },
  {
    id: "cancellation",
    heading: "Cancellation and changes",
    placeholder:
      "How a customer cancels or changes a booked service, any notice period, and the effect on fees already paid. See also the Refund Policy.",
  },
  {
    id: "liability",
    heading: "Liability",
    placeholder:
      "The limits of VisaDrive's liability, including for a refused visa, a missed appointment, or a delay caused by an authority.",
  },
  {
    id: "intellectual-property",
    heading: "Intellectual property",
    placeholder:
      "Ownership of the website, its content and any materials VisaDrive supplies to customers.",
  },
  {
    id: "governing-law",
    heading: "Governing law",
    body: [LEGAL.governingLaw],
  },
  {
    id: "changes",
    heading: "Changes to these terms",
    placeholder:
      "How changes are notified, and whether they apply to applications already in progress.",
  },
];

export default function TermsPage() {
  return (
    <LegalDocument
      crumbLabel="Terms of Service"
      title="Terms of Service"
      intro="What VisaDrive does for you, what we need from you, and what is outside anyone's control. The clauses below are the client's own published wording; the rest is marked as outstanding."
      sections={SECTIONS}
    />
  );
}
