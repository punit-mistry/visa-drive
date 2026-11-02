import type { Metadata } from "next";

import {
  LegalDocument,
  type LegalSection,
} from "@/components/marketing/legal-document";
import { LEGAL } from "@/lib/constants/site";

export const metadata: Metadata = {
  title: "Refund Policy",
  description:
    "When VisaDrive service fees become payable, how government fees are treated, and what happens if you cancel.",
  alternates: { canonical: "/refund-policy" },
};

/**
 * Two of VisaDrive's strongest published commitments live here — no advance
 * payment for appointment services, and government fees being separate and
 * generally non-refundable. The mechanics of a refund are theirs to define
 * and are marked outstanding.
 */
const SECTIONS: LegalSection[] = [
  {
    id: "when-you-pay",
    heading: "When you pay us",
    body: [LEGAL.noAdvancePayment],
  },
  {
    id: "government-fees",
    heading: "Government and authority fees",
    body: [LEGAL.governmentFeesSeparate, LEGAL.governmentFeesNonRefundable],
  },
  {
    id: "outcomes",
    heading: "If your visa is refused",
    body: [LEGAL.noGuarantee],
    placeholder:
      "Whether the VisaDrive service fee is refundable, partly refundable or non-refundable following a refusal, and any distinction between a refusal and an error on our side.",
  },
  {
    id: "cancelling",
    heading: "If you cancel",
    placeholder:
      "How to cancel a booked service, any notice period, and what portion of the service fee is retained at each stage of an application.",
  },
  {
    id: "how-refunds-are-made",
    heading: "How a refund is made",
    placeholder:
      "The method a refund is returned by, the processing time, and who to contact to request one.",
  },
  {
    id: "disputes",
    heading: "Disputes and chargebacks",
    placeholder:
      "How a disputed charge is handled and the escalation route before a chargeback is raised.",
  },
  {
    id: "governing-law",
    heading: "Governing law",
    body: [LEGAL.governingLaw],
  },
];

export default function RefundPolicyPage() {
  return (
    <LegalDocument
      crumbLabel="Refund Policy"
      title="Refund Policy"
      intro="What you pay for, when you pay it, and what happens to that money if plans change. The commitments below are VisaDrive's own published wording; the mechanics are still to be confirmed."
      sections={SECTIONS}
    />
  );
}
