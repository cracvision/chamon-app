// Tests for chamon-create-mission.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { call } from "../_shared/test_helpers.ts";

const FN = "chamon-create-mission";

async function getAnyAreaId(): Promise<string | null> {
  const { json } = await call({ fn: "chamon-query", body: { query_type: "missions_overview" } });
  const items = (json?.data?.items ?? json?.data?.missions ?? json?.data ?? []) as Array<{ id?: string; area_id?: string }>;
  for (const m of items) if (m?.area_id) return m.area_id;
  const first = items[0]?.id;
  if (!first) return null;
  const r2 = await call({ fn: "chamon-query", body: { query_type: "mission_details", params: { mission_id: first } } });
  return (r2.json?.data?.mission?.area_id ?? r2.json?.data?.area_id ?? null) as string | null;
}

Deno.test("create_mission — happy path (auto code, Spanish message)", async () => {
  const area_id = await getAnyAreaId();
  if (!area_id) {
    console.warn("no area found in seed; skipping create_mission happy path");
    return;
  }
  const { status, json } = await call({
    fn: FN,
    body: {
      area_id,
      title: `__test_mission_${Date.now()}`,
      priority: "high",
      cost_of_inaction_weekly: 30,
    },
  });
  assertEquals(status, 200);
  assertEquals(json.ok, true);
  assert(/^\d{2}$/.test(json.code), `expected zero-padded code, got: ${json.code}`);
  assert(json.message.includes("alta"));
  assert(json.message.includes("¿Le añadimos tareas"));
});

Deno.test("create_mission — invalid area_id → area_not_found (404)", async () => {
  const { status, json } = await call({
    fn: FN,
    body: {
      area_id: "00000000-0000-0000-0000-000000000000",
      title: "x",
    },
  });
  assertEquals(status, 404);
  assertEquals(json.error, "area_not_found");
});

Deno.test("create_mission — Zod rejects bad input (400)", async () => {
  const { status } = await call({ fn: FN, body: { area_id: "nope" } });
  assertEquals(status, 400);
});
