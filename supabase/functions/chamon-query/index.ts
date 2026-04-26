// chamon-query: voice-agent query backend for Mission Control.
// Auth: HMAC-SHA256 over `${timestamp}.${rawBody}` with shared secret.
// All DB access in handlers goes through scopedTable() (see client.ts).
//
// Request body shape:
//   { "query_type": "today_focus" | "missions_overview" | "mission_details"
//                   | "what_needs_attention" | "overdue" | "search",
//     "params": { ... } }
import { createServiceClient } from "./client.ts";
import { verifyHmac } from "./auth.ts";
import { MSG } from "./format.ts";
import { handleTodayFocus } from "./handlers/today_focus.ts";
import { handleMissionsOverview } from "./handlers/missions_overview.ts";
import { handleMissionDetails } from "./handlers/mission_details.ts";
import { handleWhatNeedsAttention } from "./handlers/what_needs_attention.ts";
import { handleOverdue } from "./handlers/overdue.ts";
import { handleSearch } from "./handlers/search.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-chamon-timestamp, x-chamon-signature",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const secret = Deno.env.get("CHAMON_HMAC_SECRET");
  const userId = Deno.env.get("CHAMON_USER_ID");
  if (!secret) return json({ error: "server_misconfigured: CHAMON_HMAC_SECRET" }, 500);
  if (!userId) return json({ error: MSG.noUser }, 500);

  const rawBody = await req.text();
  const verify = await verifyHmac(
    secret,
    req.headers.get("x-chamon-timestamp"),
    req.headers.get("x-chamon-signature"),
    rawBody,
  );
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
  if (!queryType) return json({ error: MSG.badRequest, reason: "missing_query_type" }, 400);

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
      case "mission_details":
        result = await handleMissionDetails(supabase, userId, {
          mission_id: typeof params.mission_id === "string" ? params.mission_id : undefined,
          mission_title: typeof params.mission_title === "string" ? params.mission_title : undefined,
        });
        break;
      case "what_needs_attention":
        result = await handleWhatNeedsAttention(supabase, userId);
        break;
      case "overdue":
        result = await handleOverdue(supabase, userId);
        break;
      case "search":
        result = await handleSearch(supabase, userId, {
          query: typeof params.query === "string" ? params.query : undefined,
          limit: typeof params.limit === "number" ? params.limit : undefined,
        });
        break;
      default:
        return json({ error: MSG.unknownIntent, query_type: queryType }, 400);
    }
    return json({ ok: true, query_type: queryType, data: result });
  } catch (e) {
    console.error("[chamon-query]", queryType, e);
    return json({ error: MSG.internal, detail: String(e) }, 500);
  }
});
