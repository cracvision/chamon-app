// reservation-extract — manual endpoint that takes a raw email body and asks
// Lovable AI Gateway (Gemini 2.5 Flash) to extract reservation fields.
//
// Auth: HMAC (preferred for prod) OR Bearer (CHAMON_ELEVENLABS_BEARER) for
// quick manual testing. Same pattern as chamon-* functions.
//
// NOTE: property_id is NOT extracted from the email — it's assigned later
// during the propose flow (sprint 2.2).

import { z } from "https://esm.sh/zod@3.23.8";
import { CORS, jsonResponse } from "../_shared/cors.ts";
import { verifyRequest } from "../_shared/auth.ts";

const HMAC_SECRET = Deno.env.get("CHAMON_HMAC_SECRET") ?? "";
const BEARER_TOKEN = Deno.env.get("CHAMON_ELEVENLABS_BEARER") ?? undefined;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const MODEL = "openai/gpt-5";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const TIMEOUT_MS = 15_000;

const inputSchema = z.object({
  email_content: z.string().min(20, "email_content too short"),
  source: z.enum(["airbnb", "vrbo", "booking"]),
  source_email_id: z.string().optional(),
});

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

const extractedSchema = z.object({
  confidence: z.number().min(0).max(1),
  payload: z.object({
    source: z.enum(["airbnb", "vrbo", "booking"]),
    confirmation_code: z.string().optional().nullable(),
    guest_name: z.string().optional().nullable(),
    guest_email: z.string().email().optional().nullable(),
    guest_phone: z.string().optional().nullable(),
    check_in_date: dateString,
    check_out_date: dateString,
    number_of_guests: z.number().int().positive().optional().nullable(),
    payout_amount: z.number().optional().nullable(),
    cleaning_fee: z.number().optional().nullable(),
    taxes_or_fees: z.number().optional().nullable(),
  }),
  extraction_notes: z.string().optional().nullable(),
});

const SYSTEM_PROMPT = `Sos un extractor estricto de datos de reservas de plataformas de alquiler vacacional (Airbnb, VRBO, Booking). Los emails pueden venir en inglés o español; extraés los datos sin importar el idioma.

Devolvés ÚNICAMENTE un objeto JSON válido con este shape exacto, sin texto adicional, sin markdown, sin comentarios:

{
  "confidence": <number 0..1>,
  "payload": {
    "source": "airbnb" | "vrbo" | "booking",
    "confirmation_code": <string|null>,
    "guest_name": <string|null>,
    "guest_email": <string|null>,
    "guest_phone": <string|null>,
    "check_in_date": "YYYY-MM-DD",
    "check_out_date": "YYYY-MM-DD",
    "number_of_guests": <int|null>,
    "payout_amount": <number|null>,
    "cleaning_fee": <number|null>,
    "taxes_or_fees": <number|null>
  },
  "extraction_notes": <string|null>
}

Reglas:
- Los datos extraídos son LITERALES del email (no traduzcas nombres ni códigos).
- 'extraction_notes' puede ser en español si hubo ambigüedades.
- 'confidence' bajo (<0.5) si faltan campos clave (check_in_date, check_out_date, guest_name).
- Montos como números puros (sin símbolo de moneda).
- Si un campo opcional no está en el email, devolvelo como null.`;

async function callGemini(emailContent: string, source: string): Promise<{
  parsed: unknown;
  raw: string;
  tokens?: unknown;
}> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": LOVABLE_API_KEY,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Source hint: ${source}\n\n--- EMAIL CONTENT ---\n${emailContent}`,
          },
        ],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      const err: any = new Error(`gateway_${res.status}`);
      err.status = res.status;
      err.body = errBody;
      throw err;
    }
    const json = await res.json();
    const raw = json?.choices?.[0]?.message?.content ?? "";
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const e: any = new Error("llm_returned_non_json");
      e.raw = raw;
      throw e;
    }
    return { parsed, raw, tokens: json?.usage };
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const rawBody = await req.text();

  // Auth
  const auth = await verifyRequest(HMAC_SECRET, BEARER_TOKEN, req.headers, rawBody);
  if (!auth.ok) {
    return jsonResponse({ ok: false, error: "unauthorized", reason: auth.error }, 401);
  }

  // Parse + validate input
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json_body" }, 400);
  }
  const inputResult = inputSchema.safeParse(body);
  if (!inputResult.success) {
    return jsonResponse(
      { ok: false, error: "invalid_input", issues: inputResult.error.issues },
      400,
    );
  }
  const input = inputResult.data;

  if (!LOVABLE_API_KEY) {
    return jsonResponse({ ok: false, error: "missing_lovable_api_key" }, 500);
  }

  // Call Gemini
  let llm: { parsed: unknown; raw: string; tokens?: unknown };
  try {
    llm = await callGemini(input.email_content, input.source);
  } catch (e: any) {
    if (e.name === "AbortError") {
      console.log(JSON.stringify({
        agent: "reservation-extract",
        source_email_id: input.source_email_id,
        outcome: "timeout",
      }));
      return jsonResponse({ ok: false, error: "llm_timeout" }, 504);
    }
    if (e.status === 429) return jsonResponse({ ok: false, error: "rate_limited" }, 429);
    if (e.status === 402) return jsonResponse({ ok: false, error: "credits_exhausted" }, 402);
    if (e.message === "llm_returned_non_json") {
      console.log(JSON.stringify({
        agent: "reservation-extract",
        source_email_id: input.source_email_id,
        outcome: "non_json",
      }));
      return jsonResponse({ ok: false, error: "llm_returned_non_json", raw: e.raw }, 422);
    }
    console.error("reservation-extract gateway error", e?.message, e?.body);
    return jsonResponse({ ok: false, error: "gateway_error", detail: e?.message }, 502);
  }

  // Validate LLM output
  const parsed = extractedSchema.safeParse(llm.parsed);
  if (!parsed.success) {
    console.log(JSON.stringify({
      agent: "reservation-extract",
      source_email_id: input.source_email_id,
      outcome: "schema_violation",
    }));
    return jsonResponse(
      {
        ok: false,
        error: "invalid_llm_output",
        issues: parsed.error.issues,
        raw: llm.parsed,
      },
      422,
    );
  }

  const data = parsed.data;
  // Inject source_email_ids if we received one
  const finalPayload: Record<string, unknown> = { ...data.payload };
  if (input.source_email_id) {
    finalPayload.source_email_ids = [input.source_email_id];
  }

  const lowConfidence = data.confidence < 0.5;

  console.log(JSON.stringify({
    agent: "reservation-extract",
    source_email_id: input.source_email_id,
    confidence: data.confidence,
    low_confidence: lowConfidence,
    outcome: "ok",
  }));

  return jsonResponse({
    ok: true,
    confidence: data.confidence,
    low_confidence: lowConfidence,
    payload: finalPayload,
    extraction_notes: data.extraction_notes ?? null,
    model_used: MODEL,
    tokens_used: llm.tokens ?? null,
  });
});
