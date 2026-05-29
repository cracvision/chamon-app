// Sends a digest email of today's focus + overdue tasks via Resend.
// Manual trigger from Settings ("Send digest now"). Cron uses send-digest-cron.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendDigestForUser } from "../_shared/digest.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "unauthorized" }, 401);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
    const RESEND_FROM = Deno.env.get("RESEND_FROM_EMAIL") || "Mission Control <noreply@resend.dev>";

    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const result = await sendDigestForUser({
      admin,
      userId: user.id,
      fallbackEmail: user.email,
      resendApiKey: RESEND_API_KEY,
      resendFrom: RESEND_FROM,
    });

    if (!result.ok) return json({ error: result.error || "send_failed" }, result.to ? 500 : 400);
    return json({ ok: true, tasks: result.tasks });
  } catch (e) {
    console.error("[send-digest-now]", e);
    return json({ error: "internal_error" }, 500);
  }
});

function json(b: any, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
