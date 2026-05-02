# chamon-update-task Edge Function

Voice-agent **write** tool: updates **one** allowlisted field on an existing task.

## Endpoint

```
POST https://yvfkkdvhizjdpouoewch.supabase.co/functions/v1/chamon-update-task
```

## Authentication

Identical to `chamon-query`. Reused secrets: `CHAMON_HMAC_SECRET`, `CHAMON_ELEVENLABS_BEARER`, `CHAMON_USER_ID`.

## Security boundary

Service role key + `scopedTable` wrapper. **RLS is bypassed.** Per-user isolation is enforced by `scopedTable.update(id, patch)`, which applies `.eq("id", id).eq("user_id", CHAMON_USER_ID)` so cross-user task IDs no-op. Ownership is also pre-checked via the SELECT that fetches the task's current state.

**Hard rule:** no handler may call `supabase.from(...)` directly.

## Field allowlist (structural)

Enforced by **Zod discriminated union** — invalid fields fail at parse → HTTP 400. There is no runtime if/else allowlist. Allowed fields:

- `status` ∈ `"todo" | "doing" | "waiting" | "done"`
- `due_date` = `YYYY-MM-DD` or `null`
- `is_today` ∈ `true | false`

## `completed_at` lifecycle

When `field=status`:
- `value="done"` → handler also sets `completed_at = now()`
- transitioning AWAY from `done` → handler clears `completed_at = null`

## Request

```json
{
  "task_id": "uuid",
  "field": "status" | "due_date" | "is_today",
  "value": <typed per field>,
  "conversation_id": "string"           // optional
}
```

## Success response (200)

```json
{
  "ok": true,
  "task_id": "uuid",
  "task_title": "Llamar al técnico",
  "mission_id": "uuid",
  "mission_title": "Nevera Vista Pelícano",
  "field_changed": "status",
  "old_value": "todo",
  "new_value": "done",
  "audit_event_id": "uuid",
  "message": "Hecho. Marqué Llamar al técnico como completada."
}
```

## Error responses

| HTTP | error |
|---|---|
| 400 | `MSG.badRequest` (Zod rejects bad field/value) |
| 401 | `MSG.unauthorized` |
| 404 | `task_not_found` |
| 500 | `internal` |

Audit failures do **not** roll back the update.
