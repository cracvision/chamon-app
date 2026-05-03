// Tests for chamon-create-mission.
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { call } from "../_shared/test_helpers.ts";

const FN = "chamon-create-mission";

// Real seed area_id (Vista Pelícano). chamon-query doesn't expose area_ids in
// any response shape, so we hardcode here. If the seed changes, update this.
const SEED_AREA_ID = "3021542d-4034-4086-b0d4-63e6cd743e19";

async function getAnyAreaId(): Promise<string | null> {
  return SEED_AREA_ID;
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

import { assert as _assert } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("create_mission — due_date='2026-02-31' → 400 with voice-friendly message", async () => {
  const { json: areasJson } = await call({ fn: "chamon-query", body: { query_type: "missions_overview" } });
  // Need an area_id; reuse from any existing mission's area or skip if unavailable
  const items = (areasJson?.data?.items ?? []) as Array<{ area_id?: string }>;
  const area_id = items.find((m) => m.area_id)?.area_id;
  if (!area_id) {
    console.warn("no area available; skipping invalid-date test");
    return;
  }
  const { status, json } = await call({
    fn: "chamon-create-mission",
    body: { area_id, title: "x", due_date: "2026-02-31" },
  });
  assertEquals(status, 400);
  _assert(typeof json.message === "string" && json.message.includes("año-mes-día"));
});
