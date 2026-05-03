// Scheduled digest sender. Called by pg_cron every hour.
// Iterates over profiles with digest_enabled=true and digest_hour=<hour>
// and sends them today's focus+overdue digest. Protected by CHAMON_CRON_SECRET.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendDigestForUser } from "../_shared/digest.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const CRON_SECRET = Deno.env.get("CHAMON_CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  if (!CRON_SECRET || provided !== CRON_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const RESEND_FROM = Deno.env.get("RESEND_FROM_EMAIL") || "Mission Control <noreply@resend.dev>";

    let body: any = {};
    try { body = await req.json(); } catch { /* allow empty */ }
    const hour = Number(body?.hour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      return json({ error: "bad_hour", message: "Body requires { hour: 0-23 }" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: profiles, error } = await admin
      .from("profiles")
      .select("id, full_name, notification_email, preferred_language, digest_enabled, digest_hour")
      .eq("digest_enabled", true)
      .eq("digest_hour", hour);

    if (error) return json({ error: error.message }, 500);

    const today = new Date().toISOString().slice(0, 10);
    const results: any[] = [];

    for (const p of profiles || []) {
      // Idempotency: skip if already sent a successful digest today
      const { data: prior } = await admin
        .from("notifications")
        .select("id")
        .eq("user_id", p.id)
        .eq("type", "digest")
        .eq("status", "sent")
        .gte("sent_at", `${today}T00:00:00Z`)
        .limit(1);
      if (prior && prior.length > 0) {
        results.push({ user_id: p.id, skipped: "already_sent_today" });
        continue;
      }

      try {
        const r = await sendDigestForUser({
          admin,
          userId: p.id,
          fallbackEmail: p.notification_email,
          profile: p,
          resendApiKey: RESEND_API_KEY,
          resendFrom: RESEND_FROM,
        });
        results.push({ user_id: p.id, ok: r.ok, to: r.to, tasks: r.tasks, error: r.error });
      } catch (e) {
        results.push({ user_id: p.id, ok: false, error: String(e) });
      }
    }

    return json({ ok: true, hour, processed: results.length, results });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(b: any, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
