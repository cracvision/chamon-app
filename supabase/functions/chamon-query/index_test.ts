// Automated tests for chamon-query Edge Function.
// Run with: supabase test_edge_functions (uses Deno.test runner)
//
// Tests covered (per Sprint 1 spec):
//   1. HMAC verify: rejects requests with no signature (401)
//   6. HMAC verify: rejects stale timestamps (>5 min) (401)
//   7. HMAC verify: rejects bad signatures (401)
//   8. Unknown query_type returns 400 with Spanish message
//
// These tests exercise the handlers via direct HTTP since the function
// is deployed. They do NOT depend on real DB rows.

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

const FUNCTION_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/chamon-query`;
const SECRET = Deno.env.get("CHAMON_HMAC_SECRET") ?? "";

async function sign(secret: string, ts: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${body}`));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function call(opts: {
  body: string;
  ts?: string;
  signature?: string;
  skipHeaders?: boolean;
}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (!opts.skipHeaders) {
    if (opts.ts) headers["x-chamon-timestamp"] = opts.ts;
    if (opts.signature) headers["x-chamon-signature"] = opts.signature;
  }
  const res = await fetch(FUNCTION_URL, {
    method: "POST", headers, body: opts.body,
  });
  return { status: res.status, json: await res.json() };
}

Deno.test("Test 1: rejects request with no signature headers (401)", async () => {
  const body = JSON.stringify({ query_type: "today_focus" });
  const { status, json } = await call({ body, skipHeaders: true });
  assertEquals(status, 401);
  assertEquals(json.reason, "missing_headers");
});

Deno.test("Test 6: rejects stale timestamp >5min old (401)", async () => {
  const body = JSON.stringify({ query_type: "today_focus" });
  const stale = String(Math.floor(Date.now() / 1000) - 600); // 10 min ago
  const sig = await sign(SECRET, stale, body);
  const { status, json } = await call({ body, ts: stale, signature: sig });
  assertEquals(status, 401);
  assertEquals(json.reason, "stale_timestamp");
});

Deno.test("Test 7: rejects bad signature (401)", async () => {
  const body = JSON.stringify({ query_type: "today_focus" });
  const ts = String(Math.floor(Date.now() / 1000));
  const badSig = "0".repeat(64);
  const { status, json } = await call({ body, ts, signature: badSig });
  assertEquals(status, 401);
  assertEquals(json.reason, "bad_signature");
});

Deno.test("Test 8: unknown query_type returns 400 with Spanish message", async () => {
  const body = JSON.stringify({ query_type: "weather_forecast" });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = await sign(SECRET, ts, body);
  const { status, json } = await call({ body, ts, signature: sig });
  assertEquals(status, 400);
  assert(json.error.includes("No reconozco"), `expected Spanish error, got: ${json.error}`);
  assertEquals(json.query_type, "weather_forecast");
});

Deno.test("Smoke: valid signed request to today_focus returns 200", async () => {
  const body = JSON.stringify({ query_type: "today_focus" });
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = await sign(SECRET, ts, body);
  const { status, json } = await call({ body, ts, signature: sig });
  assertEquals(status, 200);
  assertEquals(json.ok, true);
  assertEquals(json.query_type, "today_focus");
  assert("data" in json);
});

// ============================================================
// Bearer-mode tests (ElevenLabs Server Tools integration)
// ============================================================

const BEARER = Deno.env.get("CHAMON_ELEVENLABS_BEARER") ?? "";

async function callBearer(opts: { body: string; authorization?: string | null }) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.authorization !== null && opts.authorization !== undefined) {
    headers["Authorization"] = opts.authorization;
  }
  const res = await fetch(FUNCTION_URL, {
    method: "POST", headers, body: opts.body,
  });
  return { status: res.status, json: await res.json() };
}

Deno.test({ name: "Bearer 1: valid Bearer token returns 200", ignore: !BEARER, fn: async () => {
  const body = JSON.stringify({ query_type: "today_focus" });
  const { status, json } = await callBearer({ body, authorization: `Bearer ${BEARER}` });
  assertEquals(status, 200);
  assertEquals(json.ok, true);
  assertEquals(json.query_type, "today_focus");
  },
});

Deno.test("Bearer 2: invalid Bearer token returns 401 bad_bearer", async () => {
  const body = JSON.stringify({ query_type: "today_focus" });
  const { status, json } = await callBearer({ body, authorization: "Bearer not-a-real-token-zzz" });
  assertEquals(status, 401);
  assertEquals(json.reason, "bad_bearer");
});

Deno.test({ name: "Bearer 3: malformed scheme (no Bearer prefix) returns 401", ignore: !BEARER, fn: async () => {
  const body = JSON.stringify({ query_type: "today_focus" });
  const { status, json } = await callBearer({ body, authorization: BEARER });
  assertEquals(status, 401);
  assertEquals(json.reason, "bad_auth_scheme");
  },
});

Deno.test("Bearer 4: no auth headers at all returns 401 missing_headers", async () => {
  const body = JSON.stringify({ query_type: "today_focus" });
  const { status, json } = await callBearer({ body, authorization: null });
  assertEquals(status, 401);
  assertEquals(json.reason, "missing_headers");
});

Deno.test({ name: "Bearer 5: HMAC headers take precedence over Bearer", ignore: !BEARER, fn: async () => {
  // Send valid Bearer but ALSO invalid HMAC headers — HMAC should win and fail.
  const body = JSON.stringify({ query_type: "today_focus" });
  const ts = String(Math.floor(Date.now() / 1000));
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${BEARER}`,
      "x-chamon-timestamp": ts,
      "x-chamon-signature": "0".repeat(64),
    },
    body,
  });
  const json = await res.json();
  assertEquals(res.status, 401);
  assertEquals(json.reason, "bad_signature");
  },
});
