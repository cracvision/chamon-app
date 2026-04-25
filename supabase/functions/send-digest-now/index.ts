// Sends a digest email of today's focus + overdue tasks via Resend.
// Invoked manually from Settings ("Send digest now"). Phase 2 will add pg_cron.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // Identify user via JWT
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) return json({ error: "unauthorized" }, 401);

    // Use service role to read profile + tasks (RLS already filters by user_id below)
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: profile } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
    const to = profile?.notification_email || user.email;
    if (!to) return json({ error: "no recipient email" }, 400);

    const todayIso = new Date().toISOString().slice(0, 10);
    const { data: focus = [] } = await admin.from("tasks")
      .select("id,title,due_date,mission_id")
      .eq("user_id", user.id).eq("is_today", true).neq("status", "done").is("deleted_at", null);
    const { data: overdue = [] } = await admin.from("tasks")
      .select("id,title,due_date,mission_id")
      .eq("user_id", user.id).neq("status", "done").lt("due_date", todayIso).is("deleted_at", null);

    const missionIds = [...new Set([...(focus || []), ...(overdue || [])].map((t: any) => t.mission_id))];
    const { data: missions = [] } = missionIds.length
      ? await admin.from("missions").select("id,title").in("id", missionIds)
      : { data: [] as any[] };
    const mTitle = (id: string) => missions?.find((m: any) => m.id === id)?.title || "—";

    const lang = profile?.preferred_language || "es";
    const L = lang === "en"
      ? { subject: "Mission Control · Daily digest", focus: "Today · Focus", overdue: "Overdue", none: "Nothing here. Nice." }
      : { subject: "Mission Control · Digest diario", focus: "Hoy · Focus", overdue: "Vencidas", none: "Nada por aquí. Buen trabajo." };

    const list = (arr: any[]) => arr.length === 0
      ? `<p style="color:#8b95a8;font-family:'IBM Plex Sans',sans-serif;font-size:13px;margin:8px 0 0">${L.none}</p>`
      : `<ul style="margin:8px 0 0;padding:0;list-style:none">${arr.map(t => `
          <li style="padding:8px 10px;margin:4px 0;background:#1c2230;border:1px solid #232a3a;border-radius:6px;font-family:'IBM Plex Sans',sans-serif;font-size:13px;color:#f0ede4">
            ${escapeHtml(t.title)}
            <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:#8b95a8;text-transform:uppercase;letter-spacing:.12em;margin-top:2px">
              ${escapeHtml(mTitle(t.mission_id))}${t.due_date ? ` · ${t.due_date}` : ""}
            </div>
          </li>`).join("")}</ul>`;

    const html = `<div style="background:#0a0d14;padding:24px;font-family:'IBM Plex Sans',sans-serif;color:#f0ede4">
      <div style="max-width:560px;margin:0 auto">
        <p style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:#f59e0b;text-transform:uppercase;letter-spacing:.16em;margin:0">Mission Control · digest</p>
        <h1 style="font-size:22px;font-weight:600;margin:6px 0 18px">${escapeHtml(profile?.full_name || user.email || "")}</h1>
        <h2 style="font-size:13px;color:#f59e0b;margin:18px 0 0;font-weight:500">${L.focus}</h2>
        ${list(focus || [])}
        <h2 style="font-size:13px;color:#ef4444;margin:18px 0 0;font-weight:500">${L.overdue}</h2>
        ${list(overdue || [])}
      </div>
    </div>`;

    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: RESEND_FROM, to: [to], subject: L.subject, html }),
    });
    const sendBody = await resp.json();
    const ok = resp.ok;

    await admin.from("notifications").insert({
      user_id: user.id, type: "digest", email_to: to, subject: L.subject,
      status: ok ? "sent" : "failed", error: ok ? null : JSON.stringify(sendBody),
    });

    if (!ok) return json({ error: sendBody }, 500);
    return json({ ok: true, tasks: (focus?.length || 0) + (overdue?.length || 0) });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(b: any, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
