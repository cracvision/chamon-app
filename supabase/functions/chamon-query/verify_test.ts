// Verification tests for fixes applied 2026-04-26.
// Run with: supabase test_edge_functions chamon-query, pattern: "VERIFY"
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const FUNCTION_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/chamon-query`;
const SECRET = Deno.env.get("CHAMON_HMAC_SECRET") ?? "";

async function sign(secret: string, ts: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${body}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function call(payload: unknown) {
  const body = JSON.stringify(payload);
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = await sign(SECRET, ts, body);
  const res = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-chamon-timestamp": ts,
      "x-chamon-signature": sig,
    },
    body,
  });
  return { status: res.status, json: await res.json() };
}

Deno.test("VERIFY 1: what_needs_attention with limit=3 returns urgency_score per item", async () => {
  const { status, json } = await call({ query_type: "what_needs_attention", params: { limit: 3 } });
  console.log("\n========== VERIFY TEST 1: what_needs_attention limit=3 ==========");
  console.log(`HTTP ${status}`);
  console.log(JSON.stringify(json, null, 2));
  assertEquals(status, 200);
  assertEquals(json.ok, true);
  assert(Array.isArray(json.data.items));
  assert(json.data.items.length <= 3, `expected ≤3 items, got ${json.data.items.length}`);
  for (const item of json.data.items) {
    assert(typeof item.urgency_score === "number",
      `urgency_score missing or wrong type on item ${item.title}`);
    assert(item.urgency_score >= 0 && item.urgency_score <= 100,
      `urgency_score out of range: ${item.urgency_score}`);
  }
});

Deno.test("VERIFY 2: search 'tecnico' (no accent, lowercase) finds 'técnico'", async () => {
  const { status, json } = await call({ query_type: "search", params: { query: "tecnico" } });
  console.log("\n========== VERIFY TEST 2: search 'tecnico' ==========");
  console.log(`HTTP ${status}`);
  console.log(JSON.stringify(json, null, 2));
  assertEquals(status, 200);
  assertEquals(json.ok, true);
  assert(json.data.count > 0, `expected matches for 'tecnico', got count=${json.data.count}`);
  const found = json.data.items.some((i: { title: string; score: number }) =>
    i.title.toLowerCase().includes("técnico") && i.score > 0.20
  );
  assert(found, `expected at least one item containing 'técnico' with score > 0.20`);
});

Deno.test("VERIFY 3: search 'Tecnico' (no accent, capitalized) ALSO finds 'técnico'", async () => {
  const { status, json } = await call({ query_type: "search", params: { query: "Tecnico" } });
  console.log("\n========== VERIFY TEST 3: search 'Tecnico' (capitalized) ==========");
  console.log(`HTTP ${status}`);
  console.log(JSON.stringify(json, null, 2));
  assertEquals(status, 200);
  assertEquals(json.ok, true);
  assert(json.data.count > 0, `expected matches for 'Tecnico', got count=${json.data.count}`);
  const found = json.data.items.some((i: { title: string; score: number }) =>
    i.title.toLowerCase().includes("técnico") && i.score > 0.20
  );
  assert(found, `expected at least one item containing 'técnico' with score > 0.20`);
});
