# chamon-create-mission Edge Function

Voice-agent **write** tool: creates a new mission inside an existing area.

## Endpoint

```
POST https://yvfkkdvhizjdpouoewch.supabase.co/functions/v1/chamon-create-mission
```

## Authentication

Identical to `chamon-query`. See `chamon-query/README.md` for full details. Reused secrets: `CHAMON_HMAC_SECRET`, `CHAMON_ELEVENLABS_BEARER`, `CHAMON_USER_ID`.

## Security boundary

This function authenticates with `SUPABASE_SERVICE_ROLE_KEY` — **RLS is bypassed**. Per-user isolation is enforced solely by `scopedTable()` in `_shared/client.ts`. Area ownership is validated via `scopedTable("areas").select(...).eq("id", area_id)` before the mission INSERT.

**Hard rule:** no handler may call `supabase.from(...)` directly.

## Mission code generation

Codes are zero-padded 2-digit strings per user (`"01"`, `"02"`, …). Computed in app code via `MAX(code::int) + 1` over the user's non-deleted missions.

A partial unique index enforces structural uniqueness:

```sql
CREATE UNIQUE INDEX missions_user_code_active_unique
  ON missions (user_id, code) WHERE deleted_at IS NULL;
```

If a concurrent insert wins the race, the second insert fails with Postgres `23505` and the handler retries **once** with a freshly-computed code. Two consecutive collisions return HTTP 500. (Practically impossible in single-user use.)

## Request

```json
{
  "area_id": "uuid",
  "title": "string (1-200)",
  "description": "string (≤2000)" | null,    // optional
  "due_date": "YYYY-MM-DD" | null,           // optional
  "priority": "low" | "mid" | "high",        // optional, default "mid"
  "cost_of_inaction_weekly": number,         // optional, 0-10000, default 0
  "reward_text": "string (≤500)" | null,     // optional
  "conversation_id": "string"                // optional
}
```

## Success response (200)

```json
{
  "ok": true,
  "mission_id": "uuid",
  "area_id": "uuid",
  "area_name": "Vista Pelícano",
  "title": "Pintura cocina",
  "code": "10",
  "priority": "mid",
  "cost_of_inaction_weekly": 0,
  "audit_event_id": "uuid",
  "message": "Mission Pintura cocina creada en el área Vista Pelícano con prioridad media. ¿Le añadimos tareas ahora o lo dejamos para después?"
}
```

## Error responses

| HTTP | error | message |
|---|---|---|
| 400 | `MSG.badRequest` | "Solicitud mal formada." |
| 401 | `MSG.unauthorized` | "Firma inválida o ausente." |
| 404 | `area_not_found` | "No encontré esa área. Verifica el ID." |
| 500 | `internal` | "Algo falló creando la mission, intenta de nuevo." |

## Idempotency

Not implemented. Acceptable for single-user.
