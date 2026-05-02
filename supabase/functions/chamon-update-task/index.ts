// chamon-update-task: voice-agent write tool to update one allowlisted field on a task.
//
// SECURITY BOUNDARY: see ../_shared/client.ts. Service role + scopedTable.
//
// Field allowlist is enforced STRUCTURALLY by the Zod discriminated union below.
// Any field outside {status, due_date, is_today} fails at parse → HTTP 400.

import { z } from "https://esm.sh/zod@3.23.8";
import { createServiceClient, scopedTable } from "../_shared/client.ts";
import { verifyRequest } from "../_shared/auth.ts";
import { MSG, formatDateEs, isValidIsoDate, statusEsWrite } from "../_shared/format.ts";
import { CORS, jsonResponse as json } from "../_shared/cors.ts";
import { writeAuditEvent } from "../_shared/audit.ts";

const UpdateTaskSchema = z.discriminatedUnion("field", [
  z.object({
    task_id: z.string().uuid(),
    field: z.literal("status"),
    value: z.enum(["todo", "doing", "waiting", "done"]),
    conversation_id: z.string().optional(),
  }),
  z.object({
    task_id: z.string().uuid(),
    field: z.literal("due_date"),
    value: z.string()
      .refine(isValidIsoDate, { message: "fecha_invalida" })
      .nullable(),
    conversation_id: z.string().optional(),
  }),
  z.object({
    task_id: z.string().uuid(),
    field: z.literal("is_today"),
    value: z.boolean(),
    conversation_id: z.string().optional(),
  }),
]);

type Parsed = z.infer<typeof UpdateTaskSchema>;

// ElevenLabs server tools serialize all params as strings. Coerce `value`
// to its native type based on `field` BEFORE Zod parse. Defensive: if the
// string doesn't match an expected literal, leave it so Zod fails loudly.
function coerceValue(field: unknown, value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (field === "is_today") {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  }
  if (field === "due_date") {
    if (value === "null" || value === "") return null;
    return value;
  }
  return value;
}

// Voice-friendly error message when Zod rejects the payload. The agent
// should be able to read this aloud to Carlos and offer a corrective path.
function badValueMessage(field: unknown, value: unknown): string {
  if (field === "is_today") {
    return `No entendí "${value}" como sí o no. Decime "marcar para hoy" o "quitar de hoy".`;
  }
  if (field === "due_date") {
    return `La fecha "${value}" no es válida. Pásamela como año-mes-día, por ejemplo 2026-05-15, o decime "sin fecha".`;
  }
  if (field === "status") {
    return `"${value}" no es un estado válido. Las opciones son: pendiente, en progreso, esperando, o hecha.`;
  }
  if (typeof field === "string") {
    return `No puedo cambiar el campo "${field}". Solo puedo cambiar estado, fecha o el flag de hoy.`;
  }
  return "No entendí qué querés cambiar.";
}

function buildMessage(field: string, newValue: unknown, taskTitle: string): string {
  if (field === "status") {
    if (newValue === "done") return `Hecho. Marqué ${taskTitle} como completada.`;
    return `Listo, ${taskTitle} ahora está en ${statusEsWrite(String(newValue))}.`;
  }
  if (field === "due_date") {
    if (newValue === null) return `Le quité la fecha a ${taskTitle}. Sin fecha de vencimiento.`;
    return `Cambiada la fecha de ${taskTitle}. Ahora vence ${formatDateEs(String(newValue))}.`;
  }
  if (field === "is_today") {
    if (newValue === true) return `Marqué ${taskTitle} para hoy.`;
    return `Le quité el flag de hoy a ${taskTitle}.`;
  }
  return "Listo.";
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

  let parsed: Parsed;
  let rawObj: Record<string, unknown> = {};
  try {
    rawObj = (rawBody ? JSON.parse(rawBody) : {}) as Record<string, unknown>;
    if (rawObj && typeof rawObj === "object") {
      rawObj.value = coerceValue(rawObj.field, rawObj.value);
    }
    parsed = UpdateTaskSchema.parse(rawObj);
  } catch (e) {
    return json(
      {
        ok: false,
        error: MSG.badRequest,
        reason: e instanceof z.ZodError ? "validation" : "invalid_json",
        message: e instanceof z.ZodError
          ? badValueMessage(rawObj?.field, rawObj?.value)
          : "No pude leer la solicitud.",
        details: e instanceof z.ZodError ? e.errors : undefined,
      },
      400,
    );
  }

  const supabase = createServiceClient();

  try {
    // 1. Fetch current task + parent mission title (ownership check + old_value capture).
    const { data: taskRow, error: tErr } = await scopedTable(supabase, "tasks", userId)
      .select("id,title,status,due_date,is_today,mission_id,completed_at")
      .eq("id", parsed.task_id)
      .maybeSingle();
    if (tErr) throw tErr;
    if (!taskRow) {
      return json({
        ok: false,
        error: "task_not_found",
        message: "No encontré esa tarea.",
      }, 404);
    }
    const task = taskRow as {
      id: string; title: string; status: string;
      due_date: string | null; is_today: boolean;
      mission_id: string; completed_at: string | null;
    };

    const { data: missionRow } = await scopedTable(supabase, "missions", userId)
      .select("id,title")
      .eq("id", task.mission_id)
      .maybeSingle();
    const missionTitle = (missionRow as { title?: string } | null)?.title ?? "—";

    // 2. Capture old_value + build patch.
    let oldValue: unknown;
    const patch: Record<string, unknown> = {};
    if (parsed.field === "status") {
      oldValue = task.status;
      patch.status = parsed.value;
      if (parsed.value === "done") {
        patch.completed_at = new Date().toISOString();
      } else if (task.status === "done") {
        // Transitioning AWAY from done → clear completed_at.
        patch.completed_at = null;
      }
    } else if (parsed.field === "due_date") {
      oldValue = task.due_date;
      patch.due_date = parsed.value;
    } else {
      oldValue = task.is_today;
      patch.is_today = parsed.value;
    }

    // 3. Update.
    const { error: uErr } = await scopedTable(supabase, "tasks", userId)
      .update(parsed.task_id, patch);
    if (uErr) throw uErr;

    // 4. Audit.
    const auditAction =
      parsed.field === "status" ? "status_changed"
      : parsed.field === "due_date" ? "due_changed"
      : "updated";
    const auditId = await writeAuditEvent(supabase, {
      user_id: userId,
      entity_type: "task",
      entity_id: task.id,
      action: auditAction,
      metadata: {
        source: "chamon_agent",
        tool_name: "update_task",
        conversation_id: parsed.conversation_id,
        field: parsed.field,
        old_value: oldValue,
        new_value: parsed.value,
        mission_id: task.mission_id,
      },
    });

    console.log("chamon_update_task_ok", {
      tool: "update_task", user_id: userId, task_id: task.id,
      field: parsed.field, conversation_id: parsed.conversation_id ?? null,
      latency_ms: Date.now() - t0,
    });

    return json({
      ok: true,
      task_id: task.id,
      task_title: task.title,
      mission_id: task.mission_id,
      mission_title: missionTitle,
      field_changed: parsed.field,
      old_value: oldValue,
      new_value: parsed.value,
      audit_event_id: auditId,
      message: buildMessage(parsed.field, parsed.value, task.title),
    });
  } catch (e) {
    console.error("chamon_update_task_err", {
      tool: "update_task", user_id: userId, task_id: parsed.task_id,
      err_code: (e as { code?: string }).code, latency_ms: Date.now() - t0,
    });
    return json({
      ok: false,
      error: "internal",
      message: "Algo falló actualizando la tarea, intenta de nuevo.",
    }, 500);
  }
});
