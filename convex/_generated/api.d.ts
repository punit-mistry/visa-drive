/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as analytics from "../analytics.js";
import type * as appSettings from "../appSettings.js";
import type * as applicants from "../applicants.js";
import type * as applications from "../applications.js";
import type * as auditLogs from "../auditLogs.js";
import type * as conversations from "../conversations.js";
import type * as crons from "../crons.js";
import type * as destinations from "../destinations.js";
import type * as documentRequests from "../documentRequests.js";
import type * as documents from "../documents.js";
import type * as enquiries from "../enquiries.js";
import type * as http from "../http.js";
import type * as internalNotes from "../internalNotes.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_crypto from "../lib/crypto.js";
import type * as lib_destinationOrder from "../lib/destinationOrder.js";
import type * as lib_enquiryCore from "../lib/enquiryCore.js";
import type * as lib_messaging from "../lib/messaging.js";
import type * as lib_partners from "../lib/partners.js";
import type * as lib_references from "../lib/references.js";
import type * as lib_settings from "../lib/settings.js";
import type * as lib_whatsappOutbound from "../lib/whatsappOutbound.js";
import type * as messages from "../messages.js";
import type * as notifications from "../notifications.js";
import type * as partnerBookings from "../partnerBookings.js";
import type * as partnerDocuments from "../partnerDocuments.js";
import type * as partnerPricing from "../partnerPricing.js";
import type * as partners from "../partners.js";
import type * as payments from "../payments.js";
import type * as payments_node from "../payments_node.js";
import type * as seed from "../seed.js";
import type * as seedData from "../seedData.js";
import type * as travelers from "../travelers.js";
import type * as users from "../users.js";
import type * as visaFAQs from "../visaFAQs.js";
import type * as visaProducts from "../visaProducts.js";
import type * as visaRequirements from "../visaRequirements.js";
import type * as whatsapp from "../whatsapp.js";
import type * as whatsappAdmin from "../whatsappAdmin.js";
import type * as whatsappSend from "../whatsappSend.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  analytics: typeof analytics;
  appSettings: typeof appSettings;
  applicants: typeof applicants;
  applications: typeof applications;
  auditLogs: typeof auditLogs;
  conversations: typeof conversations;
  crons: typeof crons;
  destinations: typeof destinations;
  documentRequests: typeof documentRequests;
  documents: typeof documents;
  enquiries: typeof enquiries;
  http: typeof http;
  internalNotes: typeof internalNotes;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/crypto": typeof lib_crypto;
  "lib/destinationOrder": typeof lib_destinationOrder;
  "lib/enquiryCore": typeof lib_enquiryCore;
  "lib/messaging": typeof lib_messaging;
  "lib/partners": typeof lib_partners;
  "lib/references": typeof lib_references;
  "lib/settings": typeof lib_settings;
  "lib/whatsappOutbound": typeof lib_whatsappOutbound;
  messages: typeof messages;
  notifications: typeof notifications;
  partnerBookings: typeof partnerBookings;
  partnerDocuments: typeof partnerDocuments;
  partnerPricing: typeof partnerPricing;
  partners: typeof partners;
  payments: typeof payments;
  payments_node: typeof payments_node;
  seed: typeof seed;
  seedData: typeof seedData;
  travelers: typeof travelers;
  users: typeof users;
  visaFAQs: typeof visaFAQs;
  visaProducts: typeof visaProducts;
  visaRequirements: typeof visaRequirements;
  whatsapp: typeof whatsapp;
  whatsappAdmin: typeof whatsappAdmin;
  whatsappSend: typeof whatsappSend;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
