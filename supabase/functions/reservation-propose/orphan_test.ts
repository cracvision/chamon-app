// Sprint 2.3 Test 3 — Cancel orphan via HTTP
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

async function hmacHex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.test("cancel orphan returns skipped + 200", async () => {
  const secret = Deno.env.get("CHAMON_HMAC_SECRET")!;
  const url = "https://yvfkkdvhizjdpouoewch.supabase.co/functions/v1/reservation-propose";

  const body = JSON.stringify({
    extracted_payload: {
      source: "airbnb",
      confirmation_code: "HMNOEXISTE_999",
    },
    confidence: 0.92,
    source_email_id: "test_orphan_msg_001",
    property_id: "ba09bfbe-4c4f-4d96-962b-1a14ef23f732",
    event_type: "cancel",
    cancelled_by: "guest",
  });

  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = await hmacHex(secret, `${ts}.${body}`);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-chamon-timestamp": ts,
      "x-chamon-signature": sig,
    },
    body,
  });
  const txt = await res.text();
  console.log("STATUS:", res.status);
  console.log("BODY:", txt);
  assertEquals(res.status, 200);
});
