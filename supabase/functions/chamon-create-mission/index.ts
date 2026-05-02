// chamon-create-mission: voice-agent write tool to create a new mission in an existing area.
//
// SECURITY BOUNDARY: see ../_shared/client.ts. Service role + scopedTable.
//
// Mission code uniqueness:
//   Enforced by partial unique index `missions_user_code_active_unique`
//   on (user_id, code) WHERE deleted_at IS NULL. We compute the next code
//   in app code; on rare race / 23505 unique_violation we retry once.

import { z } from "https://esm.sh/zod@3.23.8";
import { ChamonClient, createServiceClient, scopedTable } from "../_shared/client.ts";
import { verifyRequest } from "../_shared/auth.ts";
import { MSG, formatDateEs, formatDollars, isValidIsoDate, priorityEs } from "../_shared/format.ts";
import { CORS, jsonResponse as json } from "../_shared/cors.ts";
import { writeAuditEvent } from "../_shared/audit.ts";

const CreateMissionSchema = z.object({
  area_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  due_date: z.string().refine(isValidIsoDate, { message: "fecha_invalida" }).nullable().optional(),
  priority: z.enum(["low", "mid", "high"]).optional().default("mid"),
  cost_of_inaction_weekly: z.number().min(0).max(10000).optional().default(0),
  reward_text: z.string().max(500).nullable().optional(),
  conversation_id: z.string().optional(),
});

type Parsed = z.infer<typeof CreateMissionSchema>;

async function nextMissionCode(supabase: ChamonClient, userId: string): Promise<string> {
  const { data, error } = await scopedTable(supabase, "missions", userId)
    .select("code")
    .not("code", "is", null);
  if (error) throw error;
  const max = ((data ?? []) as Array<{ code: string | null }>)
    .map((r) => parseInt(r.code ?? "0", 10))
    .filter((n) => Number.isFinite(n))
    .reduce((a, b) => Math.max(a, b), 0);
  return String(max + 1).padStart(2, "0");
}

async function insertMissionWithRetry(
  supabase: ChamonClient,
  userId: string,
  parsed: Parsed,
): Promise<{ id: string; code: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = await nextMissionCode(supabase, userId);
    const { data, error } = await scopedTable(supabase, "missions", userId).insert({
      area_id: parsed.area_id,
      title: parsed.title,
      description: parsed.description ?? null,
      due_date: parsed.due_date ?? null,
      priority: parsed.priority,
      cost_of_inaction_weekly: parsed.cost_of_inaction_weekly,
      reward_text: parsed.reward_text ?? null,
      code,
    });
    if (!error) return { id: (data as { id: string }).id, code };
    // Postgres unique_violation
    if ((error as { code?: string }).code === "23505" && attempt === 0) continue;
    throw error;
  }
  throw new Error("mission_code_collision_after_retry");
}

function buildMessage(p: {
  title: string;
  area_name: string;
  priority: "low" | "mid" | "high";
  cost_of_inaction_weekly: number;
  due_date: string | null;
}): string {
  const parts = [
    `Mission ${p.title} creada en el área ${p.area_name} con prioridad ${priorityEs(p.priority)}.`,
  ];
  if (p.cost_of_inaction_weekly > 0) {
    parts.push(`COI registrado en ${formatDollars(p.cost_of_inaction_weekly)} dólares semanales.`);
  }
  if (p.due_date) parts.push(`Fecha objetivo: ${formatDateEs(p.due_date)}.`);
  parts.push("¿Le añadimos tareas ahora o lo dejamos para después?");
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

  let parsed: Parsed;
  try {
    const body = rawBody ? JSON.parse(rawBody) : {};
    // ElevenLabs sends all params as strings. Coerce nullable/numeric fields.
    if (body && typeof body === "object") {
      if (typeof body.due_date === "string" && (body.due_date === "null" || body.due_date === "")) {
        body.due_date = null;
      }
      if (typeof body.description === "string" && body.description === "null") body.description = null;
      if (typeof body.reward_text === "string" && body.reward_text === "null") body.reward_text = null;
      if (typeof body.cost_of_inaction_weekly === "string") {
        const n = Number(body.cost_of_inaction_weekly);
        if (Number.isFinite(n)) body.cost_of_inaction_weekly = n;
      }
    }
    parsed = CreateMissionSchema.parse(body);
  } catch (e) {
    return json(
      { ok: false, error: MSG.badRequest, reason: e instanceof z.ZodError ? "validation" : "invalid_json" },
      400,
    );
  }

  const supabase = createServiceClient();

  try {
    // 1. Validate area ownership.
    const { data: areaRow, error: aErr } = await scopedTable(supabase, "areas", userId)
      .select("id,name")
      .eq("id", parsed.area_id)
      .maybeSingle();
    if (aErr) throw aErr;
    if (!areaRow) {
      return json({
        ok: false,
        error: "area_not_found",
        message: "No encontré esa área. Verifica el ID.",
      }, 404);
    }
    const area = areaRow as { id: string; name: string };

    // 2. Insert mission with auto-code + retry on unique violation.
    const created = await insertMissionWithRetry(supabase, userId, parsed);

    // 3. Audit.
    const auditId = await writeAuditEvent(supabase, {
      user_id: userId,
      entity_type: "mission",
      entity_id: created.id,
      action: "created",
      metadata: {
        source: "chamon_agent",
        tool_name: "create_mission",
        conversation_id: parsed.conversation_id,
        area_id: parsed.area_id,
        priority: parsed.priority,
        cost_of_inaction_weekly: parsed.cost_of_inaction_weekly,
        mission_title: parsed.title,
      },
    });

    console.log("chamon_create_mission_ok", {
      tool: "create_mission", user_id: userId, area_id: parsed.area_id,
      mission_id: created.id, code: created.code,
      conversation_id: parsed.conversation_id ?? null,
      latency_ms: Date.now() - t0,
    });

    return json({
      ok: true,
      mission_id: created.id,
      area_id: parsed.area_id,
      area_name: area.name,
      title: parsed.title,
      code: created.code,
      priority: parsed.priority,
      cost_of_inaction_weekly: parsed.cost_of_inaction_weekly,
      audit_event_id: auditId,
      message: buildMessage({
        title: parsed.title,
        area_name: area.name,
        priority: parsed.priority!,
        cost_of_inaction_weekly: parsed.cost_of_inaction_weekly!,
        due_date: parsed.due_date ?? null,
      }),
    });
  } catch (e) {
    console.error("chamon_create_mission_err", {
      tool: "create_mission", user_id: userId, area_id: parsed.area_id,
      err_code: (e as { code?: string }).code, latency_ms: Date.now() - t0,
    });
    return json({
      ok: false,
      error: "internal",
      message: "Algo falló creando la mission, intenta de nuevo.",
    }, 500);
  }
});
