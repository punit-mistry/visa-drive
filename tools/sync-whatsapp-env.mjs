#!/usr/bin/env node
/**
 * Push the WhatsApp variables from `.env.local` to the Convex deployment.
 *
 * Convex functions run in Convex's own runtime, so they cannot read
 * `.env.local` directly. This script keeps `.env.local` as the one place you
 * edit: it extracts only the WhatsApp keys (never Clerk, Resend or other
 * secrets), maps the legacy `WHATSAPP_ALLOWED_PHONE` name to
 * `WHATSAPP_TEST_RECIPIENTS`, and runs `convex env set --from-file` against a
 * temporary file. Values are never printed.
 *
 *   npm run whatsapp:env            # dev deployment
 *   npm run whatsapp:env -- --prod  # production deployment
 */

import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ENV_FILE = ".env.local";

/** `.env.local` name -> Convex environment variable. */
const KEY_MAP = new Map([
  ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_ACCESS_TOKEN"],
  ["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_PHONE_NUMBER_ID"],
  ["WHATSAPP_BUSINESS_ACCOUNT_ID", "WHATSAPP_BUSINESS_ACCOUNT_ID"],
  ["WHATSAPP_VERIFY_TOKEN", "WHATSAPP_VERIFY_TOKEN"],
  ["WHATSAPP_APP_SECRET", "WHATSAPP_APP_SECRET"],
  ["WHATSAPP_BOT_ENABLED", "WHATSAPP_BOT_ENABLED"],
  ["WHATSAPP_DEMO_MODE", "WHATSAPP_DEMO_MODE"],
  ["WHATSAPP_TEST_RECIPIENTS", "WHATSAPP_TEST_RECIPIENTS"],
  ["WHATSAPP_ALLOWED_PHONE", "WHATSAPP_TEST_RECIPIENTS"],
  ["WHATSAPP_TEMPLATE_HANDOFF_NAME", "WHATSAPP_TEMPLATE_HANDOFF_NAME"],
  ["WHATSAPP_TEMPLATE_LANGUAGE", "WHATSAPP_TEMPLATE_LANGUAGE"],
]);

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
    // Keep the first occurrence; duplicate keys are a mistake, not a feature.
    if (!values.has(key)) values.set(key, value);
  }
  return values;
}

function main() {
  let source;
  try {
    source = parseEnv(readFileSync(ENV_FILE, "utf8"));
  } catch {
    console.error(`Could not read ${ENV_FILE}. Create it from .env.example first.`);
    process.exit(1);
  }

  const picked = new Map();
  for (const [sourceKey, targetKey] of KEY_MAP) {
    const value = source.get(sourceKey);
    if (value === undefined || value === "") continue;
    if (picked.has(targetKey) && targetKey === "WHATSAPP_TEST_RECIPIENTS") continue;
    picked.set(targetKey, value);
  }

  // A version like "vXX.X" is a placeholder, and setting it would produce an
  // invalid Graph URL. Leave the Convex default (v21.0) in place instead.
  const version = source.get("WHATSAPP_GRAPH_API_VERSION")?.trim();
  if (version) {
    if (/^v\d+\.\d+$/.test(version)) {
      picked.set("WHATSAPP_GRAPH_API_VERSION", version);
    } else {
      console.warn(
        `WHATSAPP_GRAPH_API_VERSION="${version}" is not a real version; leaving the default (v21.0).`,
      );
    }
  }

  // App IDs are 15-16 digit numbers. Pasting one into WHATSAPP_APP_SECRET is a
  // common mistake: every Meta webhook signature would fail with 401. Refuse
  // to push it rather than break the handshake silently.
  const secret = picked.get("WHATSAPP_APP_SECRET");
  if (secret && /^\d{15,16}$/.test(secret)) {
    picked.delete("WHATSAPP_APP_SECRET");
    console.warn(
      "WHATSAPP_APP_SECRET looks like the App ID, not the App Secret. Skipped it.\n" +
        "Copy the real secret from Meta App Dashboard -> Settings -> Basic -> App Secret.",
    );
  }

  if (picked.size === 0) {
    console.error(
      `No WhatsApp variables found in ${ENV_FILE}. Expected WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, ...`,
    );
    process.exit(1);
  }

  const tempPath = join(tmpdir(), `visadrive-whatsapp-${process.pid}.env`);
  const envText = Array.from(picked, ([key, value]) => `${key}=${value}`).join("\n");

  try {
    writeFileSync(tempPath, `${envText}\n`, { encoding: "utf8", mode: 0o600 });
    console.log(`Syncing ${picked.size} WhatsApp variable(s) to Convex: ${Array.from(picked.keys()).join(", ")}`);

    const args = [
      "convex",
      "env",
      "set",
      "--from-file",
      tempPath,
      "--force",
      ...process.argv.slice(2),
    ];
    const result = spawnSync(
      process.platform === "win32" ? "npx.cmd" : "npx",
      args,
      { stdio: "inherit", shell: process.platform === "win32" },
    );

    if (result.error) {
      console.error(result.error.message);
      process.exit(1);
    }
    process.exit(result.status ?? 1);
  } finally {
    rmSync(tempPath, { force: true });
  }
}

main();
