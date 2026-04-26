// HMAC-SHA256 request authentication.
// Headers expected on every request:
//   x-chamon-timestamp: unix seconds (string)
//   x-chamon-signature: hex(hmac_sha256(secret, `${timestamp}.${rawBody}`))
//
// Replay window: 5 minutes.

const REPLAY_WINDOW_SECONDS = 300;

async function hmacHex(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface VerifyResult {
  ok: boolean;
  error?: string;
}

export async function verifyHmac(
  secret: string,
  timestamp: string | null,
  signature: string | null,
  rawBody: string,
): Promise<VerifyResult> {
  if (!timestamp || !signature) return { ok: false, error: "missing_headers" };
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return { ok: false, error: "bad_timestamp" };
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > REPLAY_WINDOW_SECONDS) {
    return { ok: false, error: "stale_timestamp" };
  }
  const expected = await hmacHex(secret, `${timestamp}.${rawBody}`);
  if (!timingSafeEqualHex(expected, signature.toLowerCase())) {
    return { ok: false, error: "bad_signature" };
  }
  return { ok: true };
}
