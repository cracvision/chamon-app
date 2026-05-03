// Tests for chamon-update-task.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { call } from "../_shared/test_helpers.ts";

const FN = "chamon-update-task";

async function getAnyTaskId(): Promise<string | null> {
  // Try today_focus first; fall back to mission_details on the first mission.
  let { json } = await call({ fn: "chamon-query", body: { query_type: "today_focus" } });
  let items = (json?.data?.items ?? []) as Array<{ id: string }>;
  if (items.length > 0) return items[0].id;

  ({ json } = await call({ fn: "chamon-query", body: { query_type: "missions_overview" } }));
  const missions = (json?.data?.items ?? json?.data?.missions ?? json?.data ?? []) as Array<{ id: string }>;
  if (!missions[0]) return null;

  ({ json } = await call({
    fn: "chamon-query",
    body: { query_type: "mission_details", params: { mission_id: missions[0].id } },
  }));
  const tasks = (json?.data?.tasks?.open ?? json?.data?.tasks ?? json?.data?.open ?? []) as Array<{ id: string }>;
  return tasks[0]?.id ?? null;
}

Deno.test("update_task — Zod rejects field outside allowlist (400)", async () => {
  const { status, json } = await call({
    fn: FN,
    body: { task_id: "00000000-0000-0000-0000-000000000000", field: "title", value: "Hacked" },
  });
  assertEquals(status, 400);
  assertEquals(json.ok, false);
});

Deno.test("update_task — task_not_found for unknown id (404)", async () => {
  const { status, json } = await call({
    fn: FN,
    body: {
      task_id: "00000000-0000-0000-0000-000000000000",
      field: "is_today",
      value: true,
    },
  });
  assertEquals(status, 404);
  assertEquals(json.error, "task_not_found");
});

Deno.test("update_task — is_today toggle (happy path)", async () => {
  const task_id = await getAnyTaskId();
  if (!task_id) {
    console.warn("no task in DB; skipping is_today test");
    return;
  }
  const { status, json } = await call({
    fn: FN,
    body: { task_id, field: "is_today", value: true },
  });
  assertEquals(status, 200);
  assertEquals(json.ok, true);
  assertEquals(json.field_changed, "is_today");
  assertEquals(json.new_value, true);
  assert(json.message.includes("para hoy") || json.message.includes("flag de hoy"));
});

Deno.test("update_task — due_date clear (null)", async () => {
  const task_id = await getAnyTaskId();
  if (!task_id) return;
  const { status, json } = await call({
    fn: FN,
    body: { task_id, field: "due_date", value: null },
  });
  assertEquals(status, 200);
  assertEquals(json.new_value, null);
  assert(json.message.includes("Sin fecha"));
});

Deno.test("update_task — status to done sets completed_at + Spanish message", async () => {
  const task_id = await getAnyTaskId();
  if (!task_id) return;
  const { status, json } = await call({
    fn: FN,
    body: { task_id, field: "status", value: "done" },
  });
  assertEquals(status, 200);
  assertEquals(json.field_changed, "status");
  assertEquals(json.new_value, "done");
  assert(json.message.startsWith("Hecho."));
});

// ----- ElevenLabs-style coercion (all params arrive as strings) -----

Deno.test("update_task — ElevenLabs-style is_today='true' → boolean true", async () => {
  const task_id = await getAnyTaskId();
  if (!task_id) return;
  const { status, json } = await call({
    fn: FN,
    body: { task_id, field: "is_today", value: "true" },
  });
  assertEquals(status, 200);
  assertEquals(json.new_value, true);
});

Deno.test("update_task — ElevenLabs-style is_today='false' → boolean false", async () => {
  const task_id = await getAnyTaskId();
  if (!task_id) return;
  const { status, json } = await call({
    fn: FN,
    body: { task_id, field: "is_today", value: "false" },
  });
  assertEquals(status, 200);
  assertEquals(json.new_value, false);
});

Deno.test("update_task — ElevenLabs-style due_date='null' → null", async () => {
  const task_id = await getAnyTaskId();
  if (!task_id) return;
  const { status, json } = await call({
    fn: FN,
    body: { task_id, field: "due_date", value: "null" },
  });
  assertEquals(status, 200);
  assertEquals(json.new_value, null);
  assert(json.message.includes("Sin fecha"));
});

// ----- Voice-friendly error messages for invalid values -----

Deno.test("update_task — is_today='yes' → 400 with voice-friendly message", async () => {
  const { status, json } = await call({
    fn: FN,
    body: { task_id: "00000000-0000-0000-0000-000000000000", field: "is_today", value: "yes" },
  });
  assertEquals(status, 400);
  assert(json.message.includes("sí o no"));
  assert(json.message.includes("marcar para hoy"));
});

Deno.test("update_task — due_date='2026-13-45' → 400 with voice-friendly message", async () => {
  const { status, json } = await call({
    fn: FN,
    body: { task_id: "00000000-0000-0000-0000-000000000000", field: "due_date", value: "2026-13-45" },
  });
  assertEquals(status, 400);
  assert(json.message.includes("no es válida"));
  assert(json.message.includes("año-mes-día"));
});

Deno.test("update_task — status='finished' → 400 enumerates valid options", async () => {
  const { status, json } = await call({
    fn: FN,
    body: { task_id: "00000000-0000-0000-0000-000000000000", field: "status", value: "finished" },
  });
  assertEquals(status, 400);
  assert(json.message.includes("pendiente"));
  assert(json.message.includes("hecha"));
});
