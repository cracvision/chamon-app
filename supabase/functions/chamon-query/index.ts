// chamon-query: voice-agent query backend for Mission Control.
// Auth: HMAC-SHA256 over `${timestamp}.${rawBody}` with shared secret.
// All DB access in handlers goes through scopedTable() (see client.ts).
//
// Request body shape:
//   { "query_type": "today_focus" | "missions_overview" | "mission_details"
//                   | "what_needs_attention" | "overdue" | "search",
//     "params": { ... } }
import { createServiceClient } from "../_shared/client.ts";
import { verifyRequest } from "../_shared/auth.ts";
import { MSG, coerceNumber } from "../_shared/format.ts";
import { CORS, jsonResponse as json } from "../_shared/cors.ts";
import { handleTodayFocus } from "./handlers/today_focus.ts";
import { handleMissionsOverview } from "./handlers/missions_overview.ts";
import { handleMissionDetails } from "./handlers/mission_details.ts";
import { handleWhatNeedsAttention } from "./handlers/what_needs_attention.ts";
import { handleOverdue } from "./handlers/overdue.ts";
import { handleSearch } from "./handlers/search.ts";

function bad(message: string, reason: string) {
  return json({ ok: false, error: MSG.badRequest, reason, message }, 400);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("CHAMON_HMAC_SECRET");
  const bearerToken = Deno.env.get("CHAMON_ELEVENLABS_BEARER");
  const userId = Deno.env.get("CHAMON_USER_ID");
  if (!secret) return json({ error: "server_misconfigured: CHAMON_HMAC_SECRET" }, 500);
  if (!userId) return json({ error: MSG.noUser }, 500);

  const rawBody = await req.text();
  const verify = await verifyRequest(secret, bearerToken, req.headers, rawBody);
  if (!verify.ok) {
    return json({ error: MSG.unauthorized, reason: verify.error }, 401);
  }

  let parsed: { query_type?: string; params?: Record<string, unknown> };
  try {
    parsed = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return json({ error: MSG.badRequest, reason: "invalid_json" }, 400);
  }

  const queryType = parsed.query_type;
  const params = (parsed.params ?? {}) as Record<string, unknown>;
  if (!queryType) {
    return bad(
      "Falta el campo top-level query_type. Valores válidos: today_focus, missions_overview, mission_details, what_needs_attention, overdue, search.",
      "missing_query_type",
    );
  }

  const supabase = createServiceClient();
  try {
    let result: unknown;
    switch (queryType) {
      case "today_focus":
        result = await handleTodayFocus(supabase, userId);
        break;
      case "missions_overview":
        result = await handleMissionsOverview(supabase, userId);
        break;
      case "mission_details": {
        const mid = typeof params.mission_id === "string" && params.mission_id.length > 0
          ? params.mission_id : undefined;
        const mtitle = typeof params.mission_title === "string" && params.mission_title.length > 0
          ? params.mission_title : undefined;
        if (!mid && !mtitle) {
          return bad(
            "Falta params.mission_id o params.mission_title para query_type=mission_details.",
            "missing_mission_identifier",
          );
        }
        result = await handleMissionDetails(supabase, userId, {
          mission_id: mid,
          mission_title: mtitle,
        });
        break;
      }
      case "what_needs_attention": {
        let limit: number | undefined;
        if (params.limit !== undefined && params.limit !== null) {
          const n = coerceNumber(params.limit);
          if (n === null) {
            return bad("El parámetro params.limit debe ser un número.", "bad_limit");
          }
          limit = n;
        }
        result = await handleWhatNeedsAttention(supabase, userId, { limit });
        break;
      }
      case "overdue":
        result = await handleOverdue(supabase, userId);
        break;
      case "search": {
        const query = typeof params.query === "string" ? params.query.trim() : "";
        if (!query) {
          return bad(
            "Falta el parámetro params.query para query_type=search.",
            "missing_params_query",
          );
        }
        if (query.length < 2) {
          return bad(
            "El parámetro params.query debe tener al menos 2 caracteres.",
            "params_query_too_short",
          );
        }
        let limit: number | undefined;
        if (params.limit !== undefined && params.limit !== null) {
          const n = coerceNumber(params.limit);
          if (n === null) {
            return bad("El parámetro params.limit debe ser un número.", "bad_limit");
          }
          limit = n;
        }
        result = await handleSearch(supabase, userId, { query, limit });
        break;
      }
      default:
        return json({ error: MSG.unknownIntent, query_type: queryType }, 400);
    }
    return json({ ok: true, query_type: queryType, data: result });
  } catch (e) {
    console.error("[chamon-query]", queryType, e);
    return json({ error: MSG.internal, detail: String(e) }, 500);
  }
});
