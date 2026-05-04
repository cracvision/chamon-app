// Quick smoke test for new Gmail endpoints. Run with:
// supabase test_edge_functions chamon-query, pattern "GMAIL"
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const FUNCTION_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1/chamon-query`;
const SECRET = Deno.env.get("CHAMON_HMAC_SECRET") ?? "";

async function sign(secret: string, ts: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
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

Deno.test("GMAIL today_summary returns valid shape", async () => {
  const { status, json } = await call({ query_type: "today_summary", params: { limit: 5 } });
  console.log("\n=== today_summary ===\n" + JSON.stringify(json, null, 2));
  assertEquals(status, 200);
  assertEquals(json.ok, true);
  assert(typeof json.data.count === "number");
  assert(Array.isArray(json.data.items));
  assert(typeof json.data.unread_count === "number");
});

Deno.test("GMAIL list_unread returns valid shape", async () => {
  const { status, json } = await call({ query_type: "list_unread", params: { limit: 5 } });
  console.log("\n=== list_unread ===\n" + JSON.stringify(json, null, 2));
  assertEquals(status, 200);
  assertEquals(json.ok, true);
  assert(typeof json.data.count === "number");
  assert(Array.isArray(json.data.items));
});
