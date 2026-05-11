// Standalone unit tests for the Zod schemas in _shared/agent-actions.ts.
// Validates that bad payloads are caught BEFORE the DB call.

import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { PAYLOAD_SCHEMAS } from "./agent-actions.ts";

Deno.test("create_reservation_with_mission: valid payload parses", () => {
  const ok = PAYLOAD_SCHEMAS.create_reservation_with_mission.safeParse({
    property_id: "ba09bfbe-4c4f-4d96-962b-1a14ef23f732",
    reservation: {
      source: "airbnb",
      confirmation_code: "HMTEST",
      check_in_date: "2027-01-15",
      check_out_date: "2027-01-18",
    },
    mission: {
      template_id: "80eeafac-c10a-44ce-a81c-2092ec8d9057",
      title: "test mission",
    },
  });
  assert(ok.success, JSON.stringify(ok));
});

Deno.test("create_reservation_with_mission: property_id NESTED inside reservation → invalid (the historical bug)", () => {
  const bad = PAYLOAD_SCHEMAS.create_reservation_with_mission.safeParse({
    reservation: {
      property_id: "ba09bfbe-4c4f-4d96-962b-1a14ef23f732", // wrong place
      source: "airbnb",
      confirmation_code: "HMTEST",
      check_in_date: "2027-01-15",
      check_out_date: "2027-01-18",
    },
    mission: {
      template_id: "80eeafac-c10a-44ce-a81c-2092ec8d9057",
      title: "test",
    },
  });
  assertEquals(bad.success, false);
});

Deno.test("create_calendar_event: requires reservation_id OR pending refs", () => {
  const bad = PAYLOAD_SCHEMAS.create_calendar_event.safeParse({
    confirmation_code: "X",
  });
  assertEquals(bad.success, false);

  const okPending = PAYLOAD_SCHEMAS.create_calendar_event.safeParse({
    pending_reservation_confirmation_code: "X",
    pending_check_in_date: "2027-01-15",
  });
  assert(okPending.success);

  const okRes = PAYLOAD_SCHEMAS.create_calendar_event.safeParse({
    reservation_id: "ba09bfbe-4c4f-4d96-962b-1a14ef23f732",
  });
  assert(okRes.success);
});

Deno.test("update_reservation: rejects unknown fields in updates", () => {
  const bad = PAYLOAD_SCHEMAS.update_reservation.safeParse({
    reservation_id: "ba09bfbe-4c4f-4d96-962b-1a14ef23f732",
    updates: { unknown_field: "x" },
    recalc_task_dates: false,
  });
  assertEquals(bad.success, false);
});

Deno.test("cancel_reservation: requires reservation_id", () => {
  const bad = PAYLOAD_SCHEMAS.cancel_reservation.safeParse({});
  assertEquals(bad.success, false);
});
