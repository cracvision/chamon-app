// Request authentication for chamon-query.
//
// Two supported modes (checked in order):
//
// 1. HMAC-SHA256 (primary, used by CLI/scripts/internal tests)
//    Headers:
//      x-chamon-timestamp: unix seconds (string)
//      x-chamon-signature: hex(hmac_sha256(secret, `${timestamp}.${rawBody}`))
//    Replay window: 5 minutes.
//
// 2. Bearer token (for ElevenLabs Server Tools, which cannot sign bodies)
//    Header:
//      Authorization: Bearer <CHAMON_ELEVENLABS_BEARER>
//    No replay protection. Token must be rotated every 90 days. See README.

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

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export interface VerifyResult {
  ok: boolean;
  error?: string;
  mode?: "hmac" | "bearer";
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
  if (!timingSafeEqual(expected, signature.toLowerCase())) {
    return { ok: false, error: "bad_signature" };
  }
  return { ok: true, mode: "hmac" };
}

export function verifyBearer(
  expectedToken: string,
  authorizationHeader: string | null,
): VerifyResult {
  if (!authorizationHeader) return { ok: false, error: "missing_headers" };
  // Accept either "Bearer <token>" (case-insensitive scheme) or a raw token
  // (some clients, e.g. ElevenLabs Server Tools, send the secret value as-is
  // in the Authorization header without a scheme prefix).
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  const provided = (match ? match[1] : authorizationHeader).trim();
  if (!provided) return { ok: false, error: "empty_bearer" };
  if (!timingSafeEqual(provided, expectedToken)) {
    return { ok: false, error: "bad_bearer" };
  }
  return { ok: true, mode: "bearer" };
}

export async function verifyRequest(
  hmacSecret: string,
  bearerToken: string | undefined,
  headers: Headers,
  rawBody: string,
): Promise<VerifyResult> {
  const ts = headers.get("x-chamon-timestamp");
  const sig = headers.get("x-chamon-signature");
  const auth = headers.get("authorization");

  // HMAC takes precedence when its headers are present.
  if (ts || sig) {
    return await verifyHmac(hmacSecret, ts, sig, rawBody);
  }
  if (bearerToken && auth) {
    return verifyBearer(bearerToken, auth);
  }
  return { ok: false, error: "missing_headers" };
}
