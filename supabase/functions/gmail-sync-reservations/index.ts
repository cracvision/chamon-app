// gmail-sync-reservations — escanea la cuenta Gmail `cracevedoc@gmail.com`
// (resuelta por emailAddress, no por nombre de secret), busca emails de
// confirmación de reserva de Airbnb, y los pasa por extract → propose.
//
// Idempotencia: `email_ingestion_log(user_id, gmail_message_id)` UNIQUE.
// Cap: máx 50 emails por invocación. Newest first.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { CORS, jsonResponse } from "../_shared/cors.ts";
import { verifyRequest } from "../_shared/auth.ts";

const HMAC_SECRET = Deno.env.get("CHAMON_HMAC_SECRET") ?? "";
const BEARER_TOKEN = Deno.env.get("CHAMON_ELEVENLABS_BEARER") ?? undefined;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const CHAMON_USER_ID = Deno.env.get("CHAMON_USER_ID") ?? "";

const TARGET_EMAIL = "cracevedoc@gmail.com";
const TARGET_PROPERTY_ID = "ba09bfbe-4c4f-4d96-962b-1a14ef23f732";
const MAX_EMAILS = 50;

const GMAIL_GATEWAY = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

// Functions URL base — used to call sibling edge functions.
// SUPABASE_URL is the project's https://<ref>.supabase.co — functions live at /functions/v1/<name>.
const EXTRACT_URL = `${SUPABASE_URL}/functions/v1/reservation-extract`;
const PROPOSE_URL = `${SUPABASE_URL}/functions/v1/reservation-propose`;

// ---------- Gmail helpers ----------

function listGmailEnvKeys(): string[] {
  const keys: string[] = [];
  if (Deno.env.get("GOOGLE_MAIL_API_KEY")) keys.push("GOOGLE_MAIL_API_KEY");
  for (let i = 1; i <= 10; i++) {
    const name = `GOOGLE_MAIL_API_KEY_${i}`;
    if (Deno.env.get(name)) keys.push(name);
  }
  return keys;
}

function gmailHeaders(envName: string): Record<string, string> {
  return {
    "Authorization": `Bearer ${LOVABLE_API_KEY}`,
    "X-Connection-Api-Key": Deno.env.get(envName)!,
  };
}

async function gmailGet(envName: string, path: string): Promise<unknown> {
  const res = await fetch(`${GMAIL_GATEWAY}${path}`, { headers: gmailHeaders(envName) });
  const text = await res.text();
  if (!res.ok) throw new Error(`gmail ${path} ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function findEnvForEmail(target: string): Promise<string | null> {
  const keys = listGmailEnvKeys();
  for (const k of keys) {
    try {
      const profile = await gmailGet(k, "/users/me/profile") as { emailAddress?: string };
      if (profile.emailAddress?.toLowerCase() === target.toLowerCase()) return k;
    } catch (_e) {
      // ignore and continue
    }
  }
  return null;
}

interface ListResponse {
  messages?: Array<{ id: string; threadId: string }>;
}

interface MessagePart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: MessagePart[];
}

interface MessageFull {
  id: string;
  threadId: string;
  internalDate?: string;
  payload?: MessagePart & { headers?: Array<{ name: string; value: string }> };
}

function header(msg: MessageFull, name: string): string {
  const h = msg.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? "";
}

function b64UrlDecode(data: string): string {
  const norm = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = norm + "=".repeat((4 - (norm.length % 4)) % 4);
  try {
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return "";
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBody(part: MessagePart | undefined): string {
  if (!part) return "";
  // Prefer text/plain
  const plain = findPart(part, "text/plain");
  if (plain?.body?.data) return b64UrlDecode(plain.body.data);
  const html = findPart(part, "text/html");
  if (html?.body?.data) return stripHtml(b64UrlDecode(html.body.data));
  return "";
}

function findPart(part: MessagePart, mime: string): MessagePart | null {
  if (part.mimeType === mime && part.body?.data) return part;
  if (part.parts) {
    for (const p of part.parts) {
      const found = findPart(p, mime);
      if (found) return found;
    }
  }
  return null;
}

// ---------- Sibling function calls ----------

async function callExtract(emailContent: string, sourceEmailId: string): Promise<{
  ok: boolean;
  status: number;
  body: any;
}> {
  const res = await fetch(EXTRACT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${BEARER_TOKEN ?? ""}`,
    },
    body: JSON.stringify({
      email_content: emailContent,
      source: "airbnb",
      source_email_id: sourceEmailId,
    }),
  });
  const text = await res.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return { ok: res.ok, status: res.status, body: parsed };
}

async function callPropose(extractedPayload: any, confidence: number, lowConf: boolean, sourceEmailId: string): Promise<{
  ok: boolean;
  status: number;
  body: any;
}> {
  const res = await fetch(PROPOSE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${BEARER_TOKEN ?? ""}`,
    },
    body: JSON.stringify({
      extracted_payload: extractedPayload,
      confidence,
      low_confidence: lowConf,
      source_email_id: sourceEmailId,
      property_id: TARGET_PROPERTY_ID,
    }),
  });
  const text = await res.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return { ok: res.ok, status: res.status, body: parsed };
}

// ---------- Main handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  const rawBody = await req.text();
  const auth = await verifyRequest(HMAC_SECRET, BEARER_TOKEN, req.headers, rawBody);
  if (!auth.ok) {
    return jsonResponse({ ok: false, error: "unauthorized", reason: auth.error }, 401);
  }

  if (!CHAMON_USER_ID) {
    return jsonResponse({ ok: false, error: "missing_chamon_user_id" }, 500);
  }
  if (!LOVABLE_API_KEY) {
    return jsonResponse({ ok: false, error: "missing_lovable_api_key" }, 500);
  }

  const envName = await findEnvForEmail(TARGET_EMAIL);
  if (!envName) {
    return jsonResponse(
      { ok: false, error: "gmail_account_not_connected", target: TARGET_EMAIL },
      500,
    );
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Gmail search query
  const q = [
    "from:automated@airbnb.com",
    '(subject:"Reservation confirmed" OR subject:"Reserva confirmada")',
    "newer_than:30d",
  ].join(" ");
  const params = new URLSearchParams({ maxResults: String(MAX_EMAILS), q });

  let list: ListResponse;
  try {
    list = await gmailGet(envName, `/users/me/messages?${params.toString()}`) as ListResponse;
  } catch (e) {
    console.error("gmail list failed", e);
    return jsonResponse({ ok: false, error: "gmail_list_failed", detail: String(e) }, 502);
  }

  const ids = (list.messages ?? []).map((m) => m.id);
  const summary = {
    scanned: ids.length,
    new: 0,
    proposed: 0,
    duplicates: 0,
    low_conf_skipped: 0,
    errors: 0,
  };

  for (const messageId of ids) {
    try {
      // Already processed?
      const { data: logRow } = await supabase
        .from("email_ingestion_log")
        .select("id, processed_at")
        .eq("user_id", CHAMON_USER_ID)
        .eq("gmail_message_id", messageId)
        .maybeSingle();

      if (logRow?.processed_at) {
        continue; // skip
      }

      let logId: string | undefined = logRow?.id;

      // Fetch full message first (need headers + body)
      const full = await gmailGet(envName, `/users/me/messages/${messageId}?format=full`) as MessageFull;
      const fromAddr = header(full, "From");
      const subject = header(full, "Subject");
      const internal = full.internalDate ? new Date(Number(full.internalDate)).toISOString() : null;
      const bodyText = extractBody(full.payload);

      if (!logId) {
        const { data: ins, error: insErr } = await supabase
          .from("email_ingestion_log")
          .insert({
            user_id: CHAMON_USER_ID,
            gmail_message_id: messageId,
            gmail_thread_id: full.threadId,
            from_address: fromAddr,
            subject,
            received_at: internal,
            classification: "reservation_candidate",
          })
          .select("id")
          .maybeSingle();
        if (insErr) {
          console.error("log insert failed", insErr);
          summary.errors++;
          continue;
        }
        logId = ins?.id;
        summary.new++;
      }

      if (!bodyText || bodyText.length < 50) {
        await supabase.from("email_ingestion_log").update({
          processed_at: new Date().toISOString(),
          error_message: "empty_or_too_short_body",
        }).eq("id", logId);
        summary.errors++;
        continue;
      }

      // Extract
      const ext = await callExtract(bodyText, messageId);
      if (!ext.ok || !ext.body?.ok) {
        await supabase.from("email_ingestion_log").update({
          processed_at: new Date().toISOString(),
          error_message: `extract_failed_${ext.status}: ${JSON.stringify(ext.body).slice(0, 400)}`,
        }).eq("id", logId);
        summary.errors++;
        continue;
      }

      const confidence: number = ext.body.confidence;
      const lowConf: boolean = ext.body.low_confidence ?? (confidence < 0.5);
      const extractedPayload = ext.body.payload;

      if (lowConf) {
        await supabase.from("email_ingestion_log").update({
          processed_at: new Date().toISOString(),
          extracted_payload: extractedPayload,
          confidence_score: confidence,
          error_message: "low_confidence_skipped",
        }).eq("id", logId);
        summary.low_conf_skipped++;
        continue;
      }

      // Propose
      const prop = await callPropose(extractedPayload, confidence, lowConf, messageId);
      if (!prop.ok || !prop.body?.ok) {
        await supabase.from("email_ingestion_log").update({
          processed_at: new Date().toISOString(),
          extracted_payload: extractedPayload,
          confidence_score: confidence,
          error_message: `propose_failed_${prop.status}: ${JSON.stringify(prop.body).slice(0, 400)}`,
        }).eq("id", logId);
        summary.errors++;
        continue;
      }

      if (prop.body.duplicate) summary.duplicates++;
      else summary.proposed++;

      await supabase.from("email_ingestion_log").update({
        processed_at: new Date().toISOString(),
        extracted_payload: extractedPayload,
        confidence_score: confidence,
      }).eq("id", logId);

      console.log(JSON.stringify({
        agent: "gmail-sync-reservations",
        gmail_message_id: messageId,
        confidence,
        outcome: prop.body.duplicate ? "duplicate" : "proposed",
        action_id: prop.body.action_id,
      }));
    } catch (e) {
      console.error("per-message error", messageId, e);
      summary.errors++;
    }
  }

  console.log(JSON.stringify({ agent: "gmail-sync-reservations", outcome: "summary", ...summary }));
  return jsonResponse({ ok: true, ...summary });
});
