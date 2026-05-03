// chamon-create-task: voice-agent write tool to create a new task in an existing mission.
//
// SECURITY BOUNDARY: see ../_shared/client.ts. This function uses
// SUPABASE_SERVICE_ROLE_KEY (RLS bypassed). Per-user isolation is enforced
// solely by `scopedTable`. Handlers must NEVER call `supabase.from(...)` directly.

import { z } from "https://esm.sh/zod@3.23.8";
import { createServiceClient, scopedTable } from "../_shared/client.ts";
import { verifyRequest } from "../_shared/auth.ts";
import { MSG, formatDateEs, isValidIsoDate } from "../_shared/format.ts";
import { CORS, jsonResponse as json } from "../_shared/cors.ts";
import { writeAuditEvent } from "../_shared/audit.ts";

const CreateTaskSchema = z.object({
  mission_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  due_date: z.string().refine(isValidIsoDate, { message: "fecha_invalida" }).nullable().optional(),
  friction_level: z.number().int().min(1).max(3).optional().default(2),
  is_today: z.boolean().optional().default(false),
  notes: z.string().max(2000).nullable().optional(),
  conversation_id: z.string().optional(),
});

function buildMessage(p: {
  mission_title: string;
  due_date: string | null;
  is_today: boolean;
  friction_level: number;
}): string {
  const parts = [`Listo, apunté la tarea en la mission ${p.mission_title}.`];
  if (p.due_date) parts.push(`Vence ${formatDateEs(p.due_date)}.`);
  if (p.is_today) parts.push("Marcada para hoy.");
  if (p.friction_level === 1) parts.push("Es fricción uno, así que dale fácil.");
  return parts.join(" ");
}

Deno.serve(async (req) => {
  const t0 = Date.now();
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("CHAMON_HMAC_SECRET");
  const bearer = Deno.env.get("CHAMON_ELEVENLABS_BEARER");
  const userId = Deno.env.get("CHAMON_USER_ID");
  if (!secret) return json({ ok: false, error: "server_misconfigured" }, 500);
  if (!userId) return json({ ok: false, error: MSG.noUser }, 500);

  const rawBody = await req.text();
  const verify = await verifyRequest(secret, bearer, req.headers, rawBody);
  if (!verify.ok) {
    return json({ ok: false, error: MSG.unauthorized, reason: verify.error }, 401);
  }

  let parsed: z.infer<typeof CreateTaskSchema>;
  try {
    const body = rawBody ? JSON.parse(rawBody) : {};
    // ElevenLabs sends all params as strings. Coerce optional fields that
    // can't be omitted from a tool call (the agent will pass "null"/"" / "true"/"false").
    if (body && typeof body === "object") {
      if (typeof body.due_date === "string" && (body.due_date === "null" || body.due_date === "")) {
        body.due_date = null;
      }
      if (typeof body.is_today === "string") {
        if (body.is_today === "true") body.is_today = true;
        else if (body.is_today === "false") body.is_today = false;
      }
      if (typeof body.notes === "string" && body.notes === "null") body.notes = null;
    }
    parsed = CreateTaskSchema.parse(body);
  } catch (e) {
    if (e instanceof z.ZodError) {
      const first = e.errors[0];
      return json(
        {
          ok: false,
          error: MSG.badRequest,
          reason: "validation",
          field: first?.path?.join(".") ?? null,
          issue: first?.message ?? null,
          message: voiceErrorMessage(e.errors),
        },
        400,
      );
    }
    return json(
      {
        ok: false,
        error: MSG.badRequest,
        reason: "invalid_json",
        message: "El body no es JSON válido.",
      },
      400,
    );
  }

  const supabase = createServiceClient();

  try {
    // 1. Validate mission ownership BEFORE insert.
    const { data: missionRow, error: mErr } = await scopedTable(supabase, "missions", userId)
      .select("id,title")
      .eq("id", parsed.mission_id)
      .maybeSingle();
    if (mErr) throw mErr;
    if (!missionRow) {
      return json({
        ok: false,
        error: "mission_not_found",
        message: "No encontré esa mission. ¿La buscamos por nombre con search?",
      }, 404);
    }
    const mission = missionRow as { id: string; title: string };

    // 2. Insert task via scopedTable (auto-injects user_id).
    const { data: task, error: insErr } = await scopedTable(supabase, "tasks", userId).insert({
      mission_id: parsed.mission_id,
      title: parsed.title,
      due_date: parsed.due_date ?? null,
      friction_level: parsed.friction_level,
      is_today: parsed.is_today,
      notes: parsed.notes ?? null,
    });
    if (insErr) throw insErr;
    const t = task as { id: string };

    // 3. Audit log (non-fatal).
    const auditId = await writeAuditEvent(supabase, {
      user_id: userId,
      entity_type: "task",
      entity_id: t.id,
      action: "created",
      metadata: {
        source: "chamon_agent",
        tool_name: "create_task",
        conversation_id: parsed.conversation_id,
        mission_id: parsed.mission_id,
        task_title: parsed.title,
      },
    });

    console.log("chamon_create_task_ok", {
      tool: "create_task", user_id: userId, mission_id: parsed.mission_id,
      task_id: t.id, conversation_id: parsed.conversation_id ?? null,
      latency_ms: Date.now() - t0,
    });

    return json({
      ok: true,
      task_id: t.id,
      mission_id: parsed.mission_id,
      mission_title: mission.title,
      title: parsed.title,
      due_date: parsed.due_date ?? null,
      friction_level: parsed.friction_level,
      is_today: parsed.is_today,
      audit_event_id: auditId,
      message: buildMessage({
        mission_title: mission.title,
        due_date: parsed.due_date ?? null,
        is_today: parsed.is_today!,
        friction_level: parsed.friction_level!,
      }),
    });
  } catch (e) {
    console.error("chamon_create_task_err", {
      tool: "create_task", user_id: userId, mission_id: parsed.mission_id,
      err_code: (e as { code?: string }).code, latency_ms: Date.now() - t0,
    });
    return json({
      ok: false,
      error: "internal",
      message: "Algo falló creando la tarea, intenta de nuevo.",
    }, 500);
  }
});
