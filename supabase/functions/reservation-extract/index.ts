// reservation-extract — manual endpoint that takes a raw email body and asks
// Lovable AI Gateway to extract reservation fields.
//
// Sprint 2.3: now accepts `event_type` ('new'|'cancel'|'update') so the prompt
// adapts and the LLM echoes back its own classification. Caller can compare.

import { z } from "https://esm.sh/zod@3.23.8";
import { CORS, jsonResponse } from "../_shared/cors.ts";
import { verifyRequest } from "../_shared/auth.ts";

const HMAC_SECRET = Deno.env.get("CHAMON_HMAC_SECRET") ?? "";
const BEARER_TOKEN = Deno.env.get("CHAMON_ELEVENLABS_BEARER") ?? undefined;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";
const MODEL = "openai/gpt-5-mini";
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const TIMEOUT_MS = 45_000;

const inputSchema = z.object({
  email_content: z.string().min(20, "email_content too short"),
  source: z.enum(["airbnb", "vrbo", "booking"]),
  source_email_id: z.string().optional(),
  event_type: z.enum(["new", "cancel", "update"]).optional().default("new"),
});

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

// For 'new' the schema requires full dates. For 'cancel'/'update' dates are
// optional (cancel may have none, update may have only the changed ones).
const extractedSchema = z.object({
  confidence: z.number().min(0).max(1),
  event_type: z.enum(["new", "cancel", "update"]).optional(),
  cancelled_by: z.enum(["host", "guest", "platform", "unknown"]).optional().nullable(),
  changed_fields: z.array(z.string()).optional().nullable(),
  payload: z.object({
    source: z.enum(["airbnb", "vrbo", "booking"]),
    confirmation_code: z.string().min(1, "confirmation_code required"),
    guest_name: z.string().optional().nullable(),
    guest_email: z.string().email().optional().nullable(),
    guest_phone: z.string().optional().nullable(),
    check_in_date: dateString.optional().nullable(),
    check_out_date: dateString.optional().nullable(),
    number_of_guests: z.number().int().positive().optional().nullable(),
    payout_amount: z.number().optional().nullable(),
    cleaning_fee: z.number().optional().nullable(),
    taxes_or_fees: z.number().optional().nullable(),
  }),
  extraction_notes: z.string().optional().nullable(),
});

function systemPrompt(eventType: string): string {
  const eventGuidance = eventType === "cancel"
    ? `
Este email es de tipo CANCELACIÓN. Extrae:
- confirmation_code (OBLIGATORIO)
- guest_name si aparece
- check_in_date / check_out_date si aparecen (opcional)
- cancelled_by: 'host' | 'guest' | 'platform' | 'unknown' según quién canceló
- Resto de campos: null si no aparecen
- 'changed_fields' irrelevante para cancel`
    : eventType === "update"
    ? `
Este email es de tipo ACTUALIZACIÓN/CAMBIO. Extrae:
- confirmation_code (OBLIGATORIO)
- TODOS los campos que el email muestra como nuevos (especialmente check_in_date y check_out_date si cambiaron)
- 'changed_fields': array con los nombres de los campos que el email indica que cambiaron`
    : `
Este email es una NUEVA RESERVA. Extrae todos los campos disponibles.
'check_in_date' y 'check_out_date' son OBLIGATORIOS.`;

  return `Sos un extractor estricto de datos de reservas de plataformas de alquiler vacacional (Airbnb, VRBO, Booking). Los emails pueden venir en inglés o español.

${eventGuidance}

Devolvés ÚNICAMENTE un objeto JSON válido, sin markdown:

{
  "confidence": <number 0..1>,
  "event_type": "new" | "cancel" | "update",
  "cancelled_by": "host" | "guest" | "platform" | "unknown" | null,
  "changed_fields": [<string>] | null,
  "payload": {
    "source": "airbnb" | "vrbo" | "booking",
    "confirmation_code": <string>,
    "guest_name": <string|null>,
    "guest_email": <string|null>,
    "guest_phone": <string|null>,
    "check_in_date": "YYYY-MM-DD" | null,
    "check_out_date": "YYYY-MM-DD" | null,
    "number_of_guests": <int|null>,
    "payout_amount": <number|null>,
    "cleaning_fee": <number|null>,
    "taxes_or_fees": <number|null>
  },
  "extraction_notes": <string|null>
}

Reglas:
- Datos LITERALES del email.
- 'confidence' bajo (<0.5) si falta el confirmation_code o el tipo de email es ambiguo.
- Montos como números puros.
- Si un campo opcional no está, devolvelo como null.
- 'event_type' en la respuesta debe coincidir con tu lectura real del email; si discrepa con el hint del usuario, igual devolvé el que vos creés correcto.`;
}

async function callLLM(emailContent: string, source: string, eventType: string): Promise<{
  parsed: unknown;
  raw: string;
  tokens?: unknown;
  durationMs: number;
}> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const llmStart = Date.now();
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
          { role: "system", content: systemPrompt(eventType) },
          {
            role: "user",
            content: `Source hint: ${source}\nEvent type hint: ${eventType}\n\n--- EMAIL CONTENT ---\n${emailContent}`,
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
    return { parsed, raw, tokens: json?.usage, durationMs: Date.now() - llmStart };
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);

  const rawBody = await req.text();

  const auth = await verifyRequest(HMAC_SECRET, BEARER_TOKEN, req.headers, rawBody);
  if (!auth.ok) {
    return jsonResponse({ ok: false, error: "unauthorized", reason: auth.error }, 401);
  }

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

  let llm: { parsed: unknown; raw: string; tokens?: unknown; durationMs: number };
  try {
    llm = await callLLM(input.email_content, input.source, input.event_type);
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
      return jsonResponse({ ok: false, error: "llm_returned_non_json", raw: e.raw }, 422);
    }
    console.error("reservation-extract gateway error", e?.message, e?.body);
    return jsonResponse({ ok: false, error: "gateway_error", detail: e?.message }, 502);
  }

  const parsed = extractedSchema.safeParse(llm.parsed);
  if (!parsed.success) {
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
  const llmEventType = data.event_type ?? input.event_type;
  const eventTypeMismatch = llmEventType !== input.event_type;

  // Per-event-type sanity: 'new' must have both dates.
  if (llmEventType === "new" && (!data.payload.check_in_date || !data.payload.check_out_date)) {
    return jsonResponse({
      ok: false,
      error: "invalid_llm_output",
      detail: "new event requires check_in_date + check_out_date",
      raw: data,
    }, 422);
  }

  const finalPayload: Record<string, unknown> = { ...data.payload };
  if (input.source_email_id) {
    finalPayload.source_email_ids = [input.source_email_id];
  }

  const lowConfidence = data.confidence < 0.5;

  console.log(JSON.stringify({
    agent: "reservation-extract",
    source_email_id: input.source_email_id,
    model_used: MODEL,
    llm_duration_ms: llm.durationMs,
    confidence: data.confidence,
    low_confidence: lowConfidence,
    event_type_hint: input.event_type,
    event_type_llm: llmEventType,
    event_type_mismatch: eventTypeMismatch,
    outcome: "ok",
  }));

  return jsonResponse({
    ok: true,
    confidence: data.confidence,
    low_confidence: lowConfidence,
    event_type: llmEventType,
    event_type_hint: input.event_type,
    event_type_mismatch: eventTypeMismatch,
    cancelled_by: data.cancelled_by ?? null,
    changed_fields: data.changed_fields ?? null,
    payload: finalPayload,
    extraction_notes: data.extraction_notes ?? null,
    model_used: MODEL,
    tokens_used: llm.tokens ?? null,
    llm_duration_ms: llm.durationMs,
  });
});
