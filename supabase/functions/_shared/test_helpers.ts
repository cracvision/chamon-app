// Shared test helpers for Chamón Edge Function test suites.
//
// Provides HMAC signing + a fetch wrapper that can switch between
// HMAC and Bearer auth modes. Reads:
//   SUPABASE_URL              (required)
//   CHAMON_HMAC_SECRET        (required for HMAC tests)
//   CHAMON_ELEVENLABS_BEARER  (required for Bearer tests)

const URL_BASE = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;

export const SECRET = Deno.env.get("CHAMON_HMAC_SECRET") ?? "";
export const BEARER = Deno.env.get("CHAMON_ELEVENLABS_BEARER") ?? "";

export function fnUrl(name: string): string {
  return `${URL_BASE}/${name}`;
}

export async function sign(secret: string, ts: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${body}`));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface CallOpts {
  fn: string;
  body: unknown;
  mode?: "hmac" | "bearer" | "none";
  badSig?: boolean;
  staleTs?: boolean;
  authorization?: string | null;
}

export async function call(opts: CallOpts): Promise<{ status: number; json: any }> {
  const bodyStr = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const mode = opts.mode ?? "hmac";

  if (mode === "hmac") {
    const ts = String(
      opts.staleTs ? Math.floor(Date.now() / 1000) - 600 : Math.floor(Date.now() / 1000),
    );
    const sig = opts.badSig ? "0".repeat(64) : await sign(SECRET, ts, bodyStr);
    headers["x-chamon-timestamp"] = ts;
    headers["x-chamon-signature"] = sig;
  } else if (mode === "bearer") {
    if (opts.authorization !== undefined) {
      if (opts.authorization !== null) headers["Authorization"] = opts.authorization;
    } else {
      headers["Authorization"] = `Bearer ${BEARER}`;
    }
  }

  const res = await fetch(fnUrl(opts.fn), { method: "POST", headers, body: bodyStr });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}
