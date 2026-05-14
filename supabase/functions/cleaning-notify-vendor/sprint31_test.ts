// Sprint 3.1 — Tests 5, 7, 9a, 9b, 10 driven from Deno.
// Uses CHAMON_HMAC_SECRET to sign requests + service role to inspect DB.
//
// Pre-requisite: Test 4 already ran via SQL (mission b895b9ed-...).
// Constants below pin those resources.

import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { call } from "../_shared/test_helpers.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const USER_ID = "1d71c262-7c8a-4a1f-84ef-1120f02d3321";
const MISSION_ID = "b895b9ed-b572-4fb1-b9c0-a49ef0a53bf6";
const PRE_TASK = "296ce758-565e-4987-8302-1da929b669d6";
const POST_TASK = "52781494-8170-47e0-8580-3a10345c2a11";
const PRE_ACTION = "cc1125f5-a714-4528-816e-110c51ede4a3";
const POST_ACTION = "8c91cf57-966c-45a8-9a71-461d9d3f6a36";

Deno.test("Test 5 — pick_scheduled_notify_actions only returns the backdated action", async () => {
  // Backdate pre-checkin action by 1 minute
  const { error: upErr } = await sb
    .from("agent_actions")
    .update({ scheduled_for: new Date(Date.now() - 60_000).toISOString() })
    .eq("id", PRE_ACTION);
  assertEquals(upErr, null);

  const { data, error } = await sb.rpc("pick_scheduled_notify_actions", { _limit: 50 });
  assertEquals(error, null);
  const rows = (data ?? []) as Array<{ action_id: string }>;
  const ids = rows.map((r) => r.action_id);
  assert(ids.includes(PRE_ACTION), `pre action missing from picks: ${JSON.stringify(ids)}`);
  assert(!ids.includes(POST_ACTION), `post action should NOT be picked yet: ${JSON.stringify(ids)}`);
});

Deno.test("Test 7 — cleaning-notify-vendor sends email + finalizes", async () => {
  const res = await call({ fn: "cleaning-notify-vendor", body: { action_id: PRE_ACTION }, mode: "hmac" });
  console.log("[Test 7] response", res.status, JSON.stringify(res.json));
  assertEquals(res.status, 200);
  assertEquals(res.json.ok, true);
  assertEquals(res.json.mode, "sent");
  assertEquals(res.json.channel, "email");
  assert(res.json.message_id, "expected provider message_id");

  // DB assertions
  const { data: action } = await sb.from("agent_actions").select("status").eq("id", PRE_ACTION).single();
  assertEquals(action?.status, "executed");

  const { data: task } = await sb.from("tasks").select("vendor_status, notified_at").eq("id", PRE_TASK).single();
  assertEquals(task?.vendor_status, "notified");
  assert(task?.notified_at, "notified_at should be set");

  const { data: notif } = await sb.from("notifications")
    .select("channel, status, email_to, provider_message_id")
    .eq("task_id", PRE_TASK).order("sent_at", { ascending: false }).limit(1).maybeSingle();
  assertEquals(notif?.channel, "email");
  assertEquals(notif?.status, "sent");
  assertEquals(notif?.email_to, "cracvision@gmail.com");
  assert(notif?.provider_message_id, "provider_message_id should be populated");

  const { data: ev } = await sb.from("events")
    .select("action").eq("entity_id", PRE_TASK).eq("action", "vendor_notified").limit(1).maybeSingle();
  assertEquals(ev?.action, "vendor_notified");
});

Deno.test("Test 9a — escalate_no_response for notified pre-checkin task", async () => {
  // Pull check_in within 24h
  const tomorrow = new Date(); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const isoDate = tomorrow.toISOString().slice(0, 10);
  await sb.from("reservations").update({ check_in_date: isoDate }).eq("confirmation_code", "HMTEST_CLEAN_001");
  // Also update task due_date so the escalator's window matches
  await sb.from("tasks").update({ due_date: isoDate }).eq("id", PRE_TASK);

  const res = await call({ fn: "escalate-cleaning-check", body: {}, mode: "hmac" });
  console.log("[Test 9a] response", res.status, JSON.stringify(res.json));
  assertEquals(res.status, 200);
  const enq = (res.json.results ?? []) as Array<{ task_id: string; reason: string }>;
  const preRow = enq.find((r) => r.task_id === PRE_TASK);
  assert(preRow, `expected escalation for PRE_TASK; got ${JSON.stringify(enq)}`);
  assertEquals(preRow!.reason, "no_response");

  const { data: task } = await sb.from("tasks").select("vendor_status, escalated_at").eq("id", PRE_TASK).single();
  assertEquals(task?.vendor_status, "escalated");
  assert(task?.escalated_at, "escalated_at should be set");

  const { data: ev } = await sb.from("events")
    .select("action, metadata").eq("entity_id", PRE_TASK).eq("action", "vendor_escalated").limit(1).maybeSingle();
  assertEquals(ev?.action, "vendor_escalated");
  assertEquals((ev?.metadata as { reason?: string } | null)?.reason, "no_response");

  const { data: notif } = await sb.from("notifications")
    .select("type, user_id").eq("task_id", PRE_TASK).eq("type", "vendor_escalation").maybeSingle();
  assertEquals(notif?.user_id, USER_ID);
});

Deno.test("Test 9b — escalate never_notified for assigned post-checkout task", async () => {
  // post-checkout task is still 'assigned' + no notified_at. Force its due_date inside window.
  const tomorrow = new Date(); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const isoDate = tomorrow.toISOString().slice(0, 10);
  await sb.from("tasks").update({ due_date: isoDate }).eq("id", POST_TASK);

  const res = await call({ fn: "escalate-cleaning-check", body: {}, mode: "hmac" });
  console.log("[Test 9b] response", res.status, JSON.stringify(res.json));
  assertEquals(res.status, 200);
  const enq = (res.json.results ?? []) as Array<{ task_id: string; reason: string }>;
  const postRow = enq.find((r) => r.task_id === POST_TASK);
  assert(postRow, `expected escalation for POST_TASK; got ${JSON.stringify(enq)}`);
  assertEquals(postRow!.reason, "never_notified");

  const { data: task } = await sb.from("tasks").select("vendor_status").eq("id", POST_TASK).single();
  assertEquals(task?.vendor_status, "escalated");
});

Deno.test("Test 10 — re-dispatch on executed action is a no-op", async () => {
  const before = await sb.from("notifications").select("id", { count: "exact", head: true }).eq("task_id", PRE_TASK);
  const beforeCount = before.count ?? 0;

  const res = await call({ fn: "cleaning-notify-vendor", body: { action_id: PRE_ACTION }, mode: "hmac" });
  console.log("[Test 10] response", res.status, JSON.stringify(res.json));
  assertEquals(res.status, 200);
  assertEquals(res.json.ok, true);
  assertEquals(res.json.already, true);

  const after = await sb.from("notifications").select("id", { count: "exact", head: true }).eq("task_id", PRE_TASK);
  assertEquals(after.count ?? 0, beforeCount);
});
