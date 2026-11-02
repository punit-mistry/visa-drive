import type { Metadata } from "next";

import {
  LegalDocument,
  type LegalSection,
} from "@/components/marketing/legal-document";
import { LEGAL, SITE } from "@/lib/constants/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How VisaDrive handles the personal information and documents you share when applying for a visa.",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};

/**
 * Only two things on this page are settled: VisaDrive's published statement
 * that it does not sell personal information, and the way the platform itself
 * stores documents. Everything else is flagged for the client rather than
 * drafted here — writing a privacy policy on their behalf would be inventing
 * a legal commitment they have not made.
 */
const SECTIONS: LegalSection[] = [
  {
    id: "who-we-are",
    heading: "Who we are",
    body: [
      `${SITE.name} is a private visa consultancy operating from ${SITE.address.full}.`,
      LEGAL.notAffiliated,
    ],
  },
  {
    id: "what-we-collect",
    heading: "Information we collect",
    body: [
      "To prepare a visa application we need identity and travel details — your name, contact details, passport information, travel dates and the documents a particular visa requires.",
    ],
    placeholder:
      "A complete, itemised list of the personal data collected, including anything gathered automatically (analytics, cookies, device information), and the lawful basis for each category.",
  },
  {
    id: "how-we-use-it",
    heading: "How we use your information",
    body: [
      "Your information is used to prepare, check and submit your application, to keep you updated on its progress, and to answer your questions.",
      LEGAL.dataNotSold,
    ],
    placeholder:
      "Confirmation of every purpose the data is used for, including marketing, and how consent is obtained and withdrawn for each.",
  },
  {
    id: "documents",
    heading: "Your documents",
    body: [
      "Documents you upload are stored privately. They are opened only by the team handling your application, and a file is never reachable by URL alone — every access is permission checked at the moment it is requested.",
    ],
  },
  {
    id: "sharing",
    heading: "Who we share it with",
    placeholder:
      "The authorities, visa application centres, payment providers and other processors your information may be shared with, what each one receives, and whether any transfer leaves India.",
  },
  {
    id: "retention",
    heading: "How long we keep it",
    placeholder:
      "Retention periods for applications, documents and enquiries, and what is deleted once a case closes.",
  },
  {
    id: "your-rights",
    heading: "Your rights",
    placeholder:
      "How to request access, correction or deletion of your information, how to withdraw consent, and the timeframe within which VisaDrive will respond.",
  },
  {
    id: "grievance",
    heading: "Grievance redressal",
    placeholder:
      "The name and contact details of the person responsible for handling privacy complaints, as required under Indian data protection rules.",
  },
  {
    id: "changes",
    heading: "Changes to this policy",
    placeholder:
      "How changes to this policy are announced and when they take effect.",
  },
];

export default function PrivacyPage() {
  return (
    <LegalDocument
      crumbLabel="Privacy Policy"
      title="Privacy Policy"
      intro="A visa application involves some of the most sensitive documents you own. This page sets out what VisaDrive has published about how that information is handled — and marks clearly what is still to be confirmed."
      lastUpdated={LEGAL.privacyLastUpdated}
      sections={SECTIONS}
    />
  );
}
