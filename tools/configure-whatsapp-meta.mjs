#!/usr/bin/env node
/**
 * Configure Meta's WhatsApp webhook without clicking through the dashboard.
 *
 * Two things have to be true before Meta will deliver a message:
 *   1. the app has an app-level webhook subscription whose callback URL is our
 *      Convex HTTP endpoint, and
 *   2. that app is subscribed to the WhatsApp Business Account (WABA).
 *
 * Both are Graph API calls. The app-level call needs an app access token,
 * `app-id|app-secret`, so this reads the real App Secret from `.env.local`.
 * It never prints the secret, the access token or the verify token.
 *
 * Run `npm run whatsapp:setup` so the Convex env is synced first.
 */

import { readFileSync } from "node:fs";

const ENV_FILE = ".env.local";
const GRAPH = "https://graph.facebook.com/v21.0";
const DEFAULT_APP_ID = "1404401775109136";
const DEFAULT_CALLBACK_URL =
  "https://notable-turtle-603.convex.site/whatsapp-webhook";

function parseEnv(text) {
  const values = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!values.has(key)) values.set(key, value);
  }
  return values;
}

function required(env, key) {
  const value = env.get(key)?.trim();
  if (!value) {
    console.error(`Missing ${key} in ${ENV_FILE}.`);
    process.exit(1);
  }
  return value;
}

async function graph(path, init) {
  const response = await fetch(`${GRAPH}/${path}`, init);
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  if (!response.ok) {
    const error = json?.error;
    console.error(
      `Meta API ${response.status}: ${error?.message ?? text.slice(0, 300)}`,
    );
    if (error?.code) console.error(`  code ${error.code}${error.error_subcode ? ` / subcode ${error.error_subcode}` : ""}`);
    process.exit(1);
  }
  return json;
}

async function main() {
  let env;
  try {
    env = parseEnv(readFileSync(ENV_FILE, "utf8"));
  } catch {
    console.error(`Could not read ${ENV_FILE}.`);
    process.exit(1);
  }

  const appId = env.get("WHATSAPP_APP_ID")?.trim() || DEFAULT_APP_ID;
  const callbackUrl =
    env.get("WHATSAPP_CALLBACK_URL")?.trim() || DEFAULT_CALLBACK_URL;
  const appSecret = required(env, "WHATSAPP_APP_SECRET");
  const verifyToken = required(env, "WHATSAPP_VERIFY_TOKEN");
  const accessToken = required(env, "WHATSAPP_ACCESS_TOKEN");
  const wabaId = required(env, "WHATSAPP_BUSINESS_ACCOUNT_ID");

  // The App ID is public and 15-16 digits. Pasting it here is the mistake that
  // silently breaks every webhook signature, so stop before touching Meta.
  if (appSecret === appId || /^\d{15,16}$/.test(appSecret)) {
    console.error(
      "WHATSAPP_APP_SECRET is the App ID, not the App Secret.\n" +
        "Meta App Dashboard -> Settings -> Basic -> App Secret -> Show, then paste it into .env.local.",
    );
    process.exit(1);
  }

  // 1. App-level webhook. Meta immediately calls our GET endpoint with the
  //    verify token below; a mismatch fails this call.
  const appToken = `${appId}|${appSecret}`;
  await graph(`${appId}/subscriptions`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      object: "whatsapp_business_account",
      callback_url: callbackUrl,
      verify_token: verifyToken,
      fields: "messages",
      access_token: appToken,
    }),
  });
  console.log(
    `Meta webhook configured: object=whatsapp_business_account, fields=messages\n  callback ${callbackUrl}`,
  );

  // 2. Subscribe this app to the WABA. Without this the webhook exists but
  //    Meta has no account to send events about.
  await graph(`${wabaId}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  console.log(`App ${appId} subscribed to WhatsApp Business Account ${wabaId}.`);

  // 3. Read it back, printing only the non-secret shape.
  const check = await graph(
    `${appId}/subscriptions?access_token=${encodeURIComponent(appToken)}`,
  );
  const subscriptions = (check?.data ?? []).map((entry) => ({
    object: entry.object,
    active: entry.active,
    callback_url: entry.callback_url,
    fields: entry.fields,
  }));
  console.log("Verified subscriptions:");
  console.log(JSON.stringify(subscriptions, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
