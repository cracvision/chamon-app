
# Sprint 2.4 — Google Calendar integration

## 0. Pre-flight (you do)
- Enlazar el connector `google_calendar` al proyecto (yo lanzo el picker; un click tuyo).
- El Calendar ID ya lo tengo: `c7e1950f...@group.calendar.google.com`.

## 1. Migración DB (single migration)
- `properties.calendar_id text`, `properties.calendar_timezone text DEFAULT 'America/Puerto_Rico'`.
- Verificar / agregar `agent_actions.group_key text` + index.
- Verificar `reservations.calendar_event_id text` (ya existe en schema).
- Extender `events.action` CHECK si está restrictivo, para admitir `calendar_event_created/updated/deleted/skipped`.
- Extender `execute_agent_action` con 3 branches nuevos:
  - `create_calendar_event`: resolver reservation + property; si `property.calendar_id IS NULL` → result `{skipped:true, reason:'no_calendar_id'}` + evento `calendar_skipped`. Si `reservation.calendar_event_id IS NOT NULL` → result `{already:true}`. Si payload trae `pending_reservation_confirmation_code` y NO `reservation_id`, resolverlo via `(user_id, confirmation_code, check_in_date)`. Llamar al edge function helper `google-calendar` vía `pg_net` (o más simple: el branch hace `SELECT net.http_post(...)`). UPDATE `reservations.calendar_event_id`. Insertar evento `calendar_event_created`.
  - `update_calendar_event`: análogo, PATCH.
  - `delete_calendar_event`: DELETE; tratar 404 como success; UPDATE `reservations.calendar_event_id = NULL`.
- Filtros `user_id = _uid` en cada UPDATE/SELECT (RPC es SECURITY DEFINER).
- UPDATE `properties` para poblar `calendar_id` de Vista Pelícano.

> Decisión clave: el branch del executor llama al edge `google-calendar` vía `pg_net.http_post` síncrono y captura la respuesta. Mantiene atomicidad lógica (si Google falla, el branch hace `RAISE EXCEPTION` y la action queda `failed`).

## 2. Edge function nueva: `google-calendar`
Helper interno (verifica `CHAMON_HMAC_SECRET` o un `INTERNAL_CALL_SECRET` para que solo el RPC pueda invocarlo). Operaciones:
- `POST /create` → calendarId, summary, description, start, end, extendedProperties → `{id, htmlLink}`
- `POST /update` → calendarId, eventId, fields → `{id, htmlLink}`
- `POST /delete` → calendarId, eventId → `{ok:true}` (404 = ok)

Llama al gateway `https://connector-gateway.lovable.dev/google_calendar/calendar/v3/calendars/{calId}/events` con `Authorization: Bearer ${LOVABLE_API_KEY}` + `X-Connection-Api-Key: ${GOOGLE_CALENDAR_API_KEY}`.

Idempotency: `event.id = mc{conf_code_alphanum_lower}{check_in_yyyymmdd}`. 409 → return el id (success).

Description template y title como spec sección 6.3. All-day si no hay times.

## 3. Cambios en `reservation-propose`
Para los 3 event_types, encolar 2 actions con `group_key` compartido:
- new: `create_reservation_with_mission` + `create_calendar_event`
- cancel: `cancel_reservation` + `delete_calendar_event`
- update: `update_reservation` + `update_calendar_event`

Calendar action lleva `pending_reservation_confirmation_code` + `pending_check_in_date` (para new). Para cancel/update, lleva `reservation_id` (ya lo tenemos del lookup).

## 4. Schemas zod en `src/lib/agent-actions.ts`
Agregar `create_calendar_event`, `update_calendar_event`, `delete_calendar_event` payload schemas a `PAYLOAD_SCHEMAS`.

## 5. Tests (parte del sprint)
Mismo patrón Sprint 2.3 (`DO` block con `request.jwt.claim.sub`, status='approved', `execute_agent_action`).
1. Create event E2E + verificar via Calendar API list.
2. Idempotency del create (re-ejecutar action, verificar no dup).
3. Update event E2E (shift de fechas).
4. Delete event.
5. Calendar skipped: clonar prop temporal sin `calendar_id`, verificar branch retorna ok sin tocar Google.
6. Cleanup hard-delete.
7. Re-auth (Test 7) — coordino contigo cuando llegue el momento (revocar/reautorizar manualmente).

## 6. Orden de ejecución
1. Connect google_calendar connector (te pido un click).
2. Migración (incluye populate de `calendar_id` Vista Pelícano).
3. Edge function `google-calendar` (deploy).
4. Migración con los 3 branches del RPC.
5. Update `reservation-propose`.
6. Update `agent-actions.ts` schemas.
7. Ejecuto Tests 1–6, te reporto outcomes para que verifiques via MCP. Test 7 lo coordinamos.

## Riesgos / things-i'll-watch
- `pg_net` es async por default — uso patrón síncrono con `net.http_post` + esperar la response_id, o más simple: invoco la edge function y espero respuesta sincrónica vía `extensions.http` si está disponible. Si no, refactor: el branch del executor solo guarda intent, y un trigger después invoca la edge. **Prefiero**: que el RPC haga la llamada HTTP sincrónica vía `extensions.http`. Si no está habilitada, la habilito en la migración.
- 401/403 de Google → action falla con error específico para que sepas reautorizar.
- Group_key visible en /agent es deferred (no es bloqueante para cierre).
