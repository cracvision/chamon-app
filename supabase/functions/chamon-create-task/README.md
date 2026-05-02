# chamon-create-task Edge Function

Voice-agent **write** tool: creates a new task inside an existing mission.

## Endpoint

```
POST https://yvfkkdvhizjdpouoewch.supabase.co/functions/v1/chamon-create-task
```

## Authentication

Identical to `chamon-query` (dual-mode): HMAC for internal scripts, Bearer for ElevenLabs Server Tools. See `chamon-query/README.md` for full details and rotation procedure. Reused secrets: `CHAMON_HMAC_SECRET`, `CHAMON_ELEVENLABS_BEARER`, `CHAMON_USER_ID`.

## Security boundary

This function authenticates to the database with `SUPABASE_SERVICE_ROLE_KEY`, which **bypasses all RLS policies**. Per-user isolation is enforced ONLY by the `scopedTable()` wrapper in `_shared/client.ts`:

- `select()` → forces `.eq("user_id", CHAMON_USER_ID).is("deleted_at", null)`
- `insert()` → overwrites/forces `user_id = CHAMON_USER_ID`
- `update()` → forces `.eq("id", id).eq("user_id", CHAMON_USER_ID)` so cross-user IDs no-op silently

**Hard rule:** no handler may call `supabase.from(...)` directly. Verify with:

```
rg "supabase\.from\(" supabase/functions/chamon-create-task/   # must be zero matches in index.ts
```

The mission ownership check is performed via `scopedTable("missions").select(...).eq("id", mission_id)` **before** the task INSERT. Cross-user mission_ids return `mission_not_found`, never an inserted task.

## Request

```json
{
  "mission_id": "uuid",
  "title": "string (1-200)",
  "due_date": "YYYY-MM-DD" | null,        // optional
  "friction_level": 1 | 2 | 3,            // optional, default 2
  "is_today": true | false,               // optional, default false
  "notes": "string (≤2000)" | null,       // optional
  "conversation_id": "string"             // optional, from ElevenLabs
}
```

## Success response (200)

```json
{
  "ok": true,
  "task_id": "uuid",
  "mission_id": "uuid",
  "mission_title": "Nevera Vista Pelícano",
  "title": "Llamar al técnico de la nevera",
  "due_date": "2026-04-30",
  "friction_level": 1,
  "is_today": false,
  "audit_event_id": "uuid",
  "message": "Listo, apunté la tarea en la mission Nevera Vista Pelícano. Vence el viernes 30 de abril. Es fricción uno, así que dale fácil."
}
```

## Error responses

| HTTP | error | message |
|---|---|---|
| 400 | `MSG.badRequest` (`reason: "validation"`) | "Solicitud mal formada." |
| 401 | `MSG.unauthorized` | "Firma inválida o ausente." |
| 404 | `mission_not_found` | "No encontré esa mission. ¿La buscamos por nombre con search?" |
| 500 | `internal` | "Algo falló creando la tarea, intenta de nuevo." |

Audit failures do **not** roll back the task creation. If the `events` insert fails, `audit_event_id` is `""` and the operation still returns `ok: true`.

## Local testing

```bash
deno run --allow-net --allow-env supabase/functions/chamon-query/sign-request.ts \
  --fn chamon-create-task '{}' '{"mission_id":"<uuid>","title":"Test"}'
```

(Or use `_shared/test_helpers.ts` from `index_test.ts`.)

## Idempotency

Not implemented. If ElevenLabs retries on network timeout, you may get duplicate tasks. Acceptable for single-user voice agent. Future sprint can add `Idempotency-Key`.
