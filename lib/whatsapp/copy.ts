import type { EnquiryData, Language } from "./types";

/* ============================================================================
 * Bot copy, keyed by language. Add a language by adding a key to COPY.
 *
 * Rules: no fees, processing times, document lists or eligibility claims
 * (catalogue values are admin-configured / sample data), and never promise
 * an approval.
 * ========================================================================== */

export interface Copy {
  welcome: string;
  menuButton: string;
  menuRows: { apply: string; requirements: string; status: string; support: string };
  menuDescriptions: { apply: string; requirements: string; status: string; support: string };
  pickFromMenu: string;

  destinationPrompt: string;
  requirementsDestinationPrompt: string;
  destinationButton: string;
  moreDestinations: string;
  invalidDestination: string;
  noOptions: string;

  categoryPrompt: string;
  categoryButton: string;
  invalidCategory: string;
  durationPrompt: string;
  durationButton: string;
  invalidDuration: string;

  datePrompt: string;
  dateInvalidFormat: string;
  dateInPast: string;
  dateTooFar: string;

  travellersPrompt: string;
  travellersInvalid: string;

  namePrompt: string;
  nameInvalid: string;
  emailPrompt: string;
  emailInvalid: string;

  confirmButtons: { confirm: string; edit: string; cancel: string };
  invalidConfirm: string;
  summary: (d: EnquiryData, dateLabel: string) => string;
  enquiryCreated: string;
  cancelled: string;

  editPrompt: string;
  editButton: string;
  editRows: {
    destination: string;
    category: string;
    duration: string;
    date: string;
    travellers: string;
    name: string;
    email: string;
  };
  invalidEdit: string;

  requirementsPointer: (destinationName: string, url: string) => string;
  requirementsButtons: { enquiry: string; menu: string };
  invalidRequirementsFollowup: string;

  statusPrompt: string;
  statusInvalid: string;
  statusChecking: string;

  handoff: string;
  optedOut: string;
  optedIn: string;
  alreadySubscribed: string;
  mediaNotSupported: string;
}

const en: Copy = {
  welcome: "Hi, welcome to VisaDrive! How can I help you today?",
  menuButton: "Choose an option",
  menuRows: {
    apply: "Apply for New Visa",
    requirements: "Visa Requirements",
    status: "Check Booking Status",
    support: "Talk to Support",
  },
  menuDescriptions: {
    apply: "Start a visa enquiry",
    requirements: "See official details online",
    status: "Look up with your reference",
    support: "Chat with our team",
  },
  pickFromMenu: "Sorry, I didn't catch that. Please choose one of the options below, or reply with its number.",

  destinationPrompt: "Which country are you travelling to? Choose from the list, or type the country name.",
  requirementsDestinationPrompt: "Which country would you like requirements for? Choose from the list, or type the name.",
  destinationButton: "Choose country",
  moreDestinations: "More countries",
  invalidDestination:
    "Sorry, I couldn't find that country. Please pick one from the list, reply with its number, or type the name again.",
  noOptions:
    "I can't show that list right now. Reply \"agent\" to talk to our team, or \"menu\" to go back to the main menu.",

  categoryPrompt: "What type of visa do you need?",
  categoryButton: "Choose visa type",
  invalidCategory: "Sorry, I didn't catch that. Please choose a visa type from the list, or reply with its number.",
  durationPrompt: "How long do you plan to stay?",
  durationButton: "Choose duration",
  invalidDuration: "Sorry, I didn't catch that. Please choose a duration from the list, or reply with its number.",

  datePrompt: "When do you plan to travel? Please reply with a date, for example 15/01/2027 or 15 Jan 2027.",
  dateInvalidFormat:
    "I couldn't read that date. Please use DD/MM/YYYY, DD-MM-YYYY or a format like 15 Jan 2027.",
  dateInPast: "That date has already passed. Please send a future travel date.",
  dateTooFar: "That date is more than two years away. Please send a date within the next two years.",

  travellersPrompt: "How many people are travelling? Please reply with a number from 1 to 20.",
  travellersInvalid: "Please reply with a whole number from 1 to 20.",

  namePrompt: "What is the full name of the main traveller? Please write it as it appears on the passport.",
  nameInvalid: "Please send a name of 2 to 80 characters using letters, spaces, full stops, apostrophes or hyphens.",
  emailPrompt: "What email address can we reach you on?",
  emailInvalid: "That doesn't look like a valid email address. Please check it and send it again.",

  confirmButtons: { confirm: "Confirm", edit: "Edit", cancel: "Cancel" },
  invalidConfirm: "Please tap Confirm, Edit or Cancel (or reply 1, 2 or 3).",
  summary: (d, dateLabel) =>
    [
      "Please check your enquiry details:",
      "",
      `Country: ${d.destinationName}`,
      `Visa type: ${d.category}`,
      `Stay: ${d.duration}`,
      `Travel date: ${dateLabel}`,
      `Travellers: ${d.travellers}`,
      `Name: ${d.fullName}`,
      `Email: ${d.email}`,
    ].join("\n"),
  enquiryCreated:
    "Thank you! Your enquiry has been sent to our team and someone will get back to you soon. This is an enquiry only, not a visa application, and does not guarantee any outcome. Please don't send passport photos or documents here. We'll share a secure way to upload them when you're ready.",
  cancelled: "No problem, I've cancelled that enquiry. Nothing was sent.",

  editPrompt: "What would you like to change?",
  editButton: "Choose a field",
  editRows: {
    destination: "Country",
    category: "Visa type",
    duration: "Duration of stay",
    date: "Travel date",
    travellers: "Travellers",
    name: "Name",
    email: "Email",
  },
  invalidEdit: "Please choose what to change from the list, or reply with its number.",

  requirementsPointer: (name, url) =>
    `For ${name}, the current visa requirements, fees and processing times are kept up to date on our website: ${url}\n\nThey can change, so I don't quote them here. Would you like to start an enquiry for this country?`,
  requirementsButtons: { enquiry: "Start enquiry", menu: "Main menu" },
  invalidRequirementsFollowup: "Please tap Start enquiry or Main menu (or reply 1 or 2).",

  statusPrompt: "Please send your booking reference, for example VD-2026-00042.",
  statusInvalid:
    "That doesn't look like a booking reference. It looks like VD-2026-00042. Please check and send it again, or reply \"menu\".",
  statusChecking:
    "Thanks, let me look that up. For your privacy I can only share status for a booking made with this phone number.",

  handoff:
    "I've passed you to our team. Someone will reply here during office hours. Reply \"menu\" any time to return to the main menu.",
  optedOut:
    "You've been unsubscribed and won't receive further messages from us. Reply START any time to resume.",
  optedIn: "Welcome back! You're subscribed again.",
  alreadySubscribed: "You're already subscribed.",
  mediaNotSupported:
    "For your security, please don't send passport photos or other documents here. Share documents through the secure portal on our website instead.",
};

export const COPY: Record<Language, Copy> = { en };
