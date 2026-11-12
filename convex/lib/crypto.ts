/* ============================================================================
 * Webhook signature helpers, shared by every HTTP route that verifies an HMAC
 * (Razorpay, WhatsApp). The Convex default runtime has no Node `crypto`, so
 * these use Web Crypto.
 * ========================================================================== */

const hexLookup = "0123456789abcdef";

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (const byte of bytes) {
    out += hexLookup[byte >> 4] + hexLookup[byte & 15];
  }
  return out;
}

/**
 * Constant-time string comparison.
 *
 * The Convex default runtime has no Node `crypto`, so there is no
 * `timingSafeEqual`. Comparing every character and OR-ing the differences
 * keeps the runtime independent of where the first mismatch is, which is what
 * stops an attacker recovering a signature byte by byte.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** `body` may be raw bytes: verify those exactly as received, decode afterwards. */
export async function hmacSha256Hex(secret: string, body: string | ArrayBuffer): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, typeof body === "string" ? encoder.encode(body) : body);
  return toHex(signature);
}
