#!/usr/bin/env -S deno run --allow-net --allow-env
// sign-request.ts — local helper to sign and send requests to chamon-query.
//
// Usage:
//   export CHAMON_HMAC_SECRET="your-secret-value"
//   export FUNCTION_URL="https://yvfkkdvhizjdpouoewch.supabase.co/functions/v1/chamon-query"
//   deno run --allow-net --allow-env supabase/functions/chamon-query/sign-request.ts \
//     today_focus
//   deno run --allow-net --allow-env supabase/functions/chamon-query/sign-request.ts \
//     search '{"query":"renta"}'
//
// Or just print the curl command without sending:
//   deno run --allow-net --allow-env supabase/functions/chamon-query/sign-request.ts \
//     --print today_focus

const SECRET = Deno.env.get("CHAMON_HMAC_SECRET");
const URL = Deno.env.get("FUNCTION_URL") ??
  "https://yvfkkdvhizjdpouoewch.supabase.co/functions/v1/chamon-query";

if (!SECRET) {
  console.error("ERROR: set CHAMON_HMAC_SECRET environment variable");
  Deno.exit(1);
}

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

const args = [...Deno.args];
const printOnly = args[0] === "--print";
if (printOnly) args.shift();

const queryType = args[0];
const paramsStr = args[1] ?? "{}";
if (!queryType) {
  console.error("Usage: sign-request.ts [--print] <query_type> [params_json]");
  Deno.exit(1);
}

const body = JSON.stringify({ query_type: queryType, params: JSON.parse(paramsStr) });
const ts = String(Math.floor(Date.now() / 1000));
const sig = await sign(SECRET, ts, body);

if (printOnly) {
  console.log(`curl -X POST '${URL}' \\
  -H 'Content-Type: application/json' \\
  -H 'x-chamon-timestamp: ${ts}' \\
  -H 'x-chamon-signature: ${sig}' \\
  -d '${body}'`);
} else {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-chamon-timestamp": ts,
      "x-chamon-signature": sig,
    },
    body,
  });
  console.log(`HTTP ${res.status}`);
  console.log(JSON.stringify(await res.json(), null, 2));
}
