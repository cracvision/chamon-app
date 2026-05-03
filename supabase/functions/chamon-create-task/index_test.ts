// Tests for chamon-create-task.
// Run with: deno test --allow-net --allow-env supabase/functions/chamon-create-task/index_test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { call, BEARER } from "../_shared/test_helpers.ts";

const FN = "chamon-create-task";

// Discover a real mission_id for this user (Sprint 1 seed exists).
async function getAnyMissionId(): Promise<string> {
  const { json } = await call({ fn: "chamon-query", body: { query_type: "missions_overview" } });
  const items = (json?.data?.items ?? json?.data?.missions ?? json?.data ?? []) as Array<{ id: string }>;
  if (!Array.isArray(items) || items.length === 0) throw new Error("no missions in DB to test against");
  return items[0].id;
}

Deno.test("create_task — happy path (200, audit_event_id, Spanish message)", async () => {
  const mission_id = await getAnyMissionId();
  const { status, json } = await call({
    fn: FN,
    body: {
      mission_id,
      title: `__test_create_task_${Date.now()}`,
      due_date: "2026-05-15",
      friction_level: 2,
      is_today: false,
    },
  });
  assertEquals(status, 200);
  assertEquals(json.ok, true);
  assert(typeof json.task_id === "string" && json.task_id.length > 0);
  assert(typeof json.audit_event_id === "string");
  assert(json.message.includes("apunté la tarea"));
});

Deno.test("create_task — invalid mission_id → mission_not_found (404)", async () => {
  const { status, json } = await call({
    fn: FN,
    body: {
      mission_id: "00000000-0000-0000-0000-000000000000",
      title: "should not be created",
    },
  });
  assertEquals(status, 404);
  assertEquals(json.ok, false);
  assertEquals(json.error, "mission_not_found");
  assert(json.message.includes("No encontré"));
});

Deno.test("create_task — Zod rejects bad input (400)", async () => {
  const { status, json } = await call({
    fn: FN,
    body: { mission_id: "not-a-uuid", title: "x" },
  });
  assertEquals(status, 400);
  assertEquals(json.ok, false);
});

Deno.test({
  name: "create_task — Bearer auth works",
  ignore: !BEARER,
  fn: async () => {
    const mission_id = await getAnyMissionId();
    const { status, json } = await call({
      fn: FN,
      mode: "bearer",
      body: { mission_id, title: `__test_bearer_${Date.now()}` },
    });
    assertEquals(status, 200);
    assertEquals(json.ok, true);
  },
});

Deno.test("create_task — no auth → 401", async () => {
  const { status } = await call({ fn: FN, mode: "none", body: { mission_id: "x", title: "x" } });
  assertEquals(status, 401);
});

Deno.test("create_task — ElevenLabs-style strings: due_date='null', is_today='true'", async () => {
  const mission_id = await getAnyMissionId();
  const { status, json } = await call({
    fn: FN,
    body: {
      mission_id,
      title: `__test_el_coerce_${Date.now()}`,
      due_date: "null",
      is_today: "true",
    },
  });
  assertEquals(status, 200);
  assertEquals(json.ok, true);
  assertEquals(json.due_date, null);
  assertEquals(json.is_today, true);
});

Deno.test("create_task — ElevenLabs-style: due_date='' coerces to null", async () => {
  const mission_id = await getAnyMissionId();
  const { status, json } = await call({
    fn: FN,
    body: {
      mission_id,
      title: `__test_el_empty_${Date.now()}`,
      due_date: "",
      is_today: "false",
    },
  });
  assertEquals(status, 200);
  assertEquals(json.due_date, null);
  assertEquals(json.is_today, false);
});

Deno.test("create_task — due_date='2026-13-45' → 400 with voice-friendly message", async () => {
  const mission_id = await getAnyMissionId();
  const { status, json } = await call({
    fn: FN,
    body: { mission_id, title: "x", due_date: "2026-13-45" },
  });
  assertEquals(status, 400);
  assert(json.message.includes("año-mes-día"));
});
