# chamon-query Edge Function

Voice-agent query backend for Mission Control. Read-only intent router that exposes 6 query types over HMAC-authenticated POST.

## Endpoint

```
POST https://yvfkkdvhizjdpouoewch.supabase.co/functions/v1/chamon-query
```

## Authentication

Every request must carry two headers:

| Header | Value |
|---|---|
| `x-chamon-timestamp` | Unix seconds (e.g. `1714150000`) |
| `x-chamon-signature` | `hex(HMAC_SHA256(CHAMON_HMAC_SECRET, "${timestamp}.${rawBody}"))` |

- Replay window: **5 minutes** (`abs(now - ts) > 300` → 401 `stale_timestamp`).
- Signature mismatch → 401 `bad_signature`.
- Missing headers → 401 `missing_headers`.

User identity is **not** carried in the request. The function pulls `CHAMON_USER_ID` from its environment (Carlos's UUID). Sprint 1 is single-user.

## Request shape

```json
{ "query_type": "<intent>", "params": { ... } }
```

## Query types

| `query_type` | `params` | Returns |
|---|---|---|
| `today_focus` | — | Tasks marked `is_today=true` and not done, sorted by friction asc, due asc |
| `missions_overview` | — | All `status='active'` missions with priority, due, health, COI, open task count |
| `mission_details` | `{ mission_id }` OR `{ mission_title }` (ILIKE) | Full mission + all its tasks (open/done split) |
| `what_needs_attention` | — | Active missions flagged as crit / overdue / due≤3d / COI>50, with reasons |
| `overdue` | — | Tasks with `due_date < today (PR)` and `status != 'done'` |
| `search` | `{ query, limit? }` (limit ≤20, default 10) | Trigram search across missions + tasks via `chamon_search` RPC |

All times are `America/Puerto_Rico` (UTC-4, no DST).

## Response shape

```json
{ "ok": true, "query_type": "...", "data": { ... } }
```

Errors: `{ "error": "<spanish message>", "reason"?: "<machine code>" }` with appropriate HTTP status (400/401/500).

## Security architecture

1. **HMAC verification** — all routes (except OPTIONS) require valid signature.
2. **Service role + scopedTable wrapper** — `client.ts` exports `scopedTable()`, the **only** allowed DB-access path in handlers. It hard-filters every read by `user_id = userId AND deleted_at IS NULL`.
3. **Search exception** — `handlers/search.ts` calls the `chamon_search` SQL function, which hardcodes the same filters in its body (see migration). This is the documented exception.
4. **Verification** — `rg "supabase\.from\(" supabase/functions/chamon-query/handlers/` must return zero matches.

## File tree

```
supabase/functions/
├── _shared/
│   └── database.types.ts          # Minimal Database type for supabase-js generic
└── chamon-query/
    ├── index.ts                   # Deno.serve entrypoint, intent router
    ├── auth.ts                    # HMAC-SHA256 verify (5-min replay window)
    ├── client.ts                  # createServiceClient + scopedTable wrapper
    ├── format.ts                  # Spanish strings + PR timezone helpers
    ├── handlers/
    │   ├── today_focus.ts
    │   ├── missions_overview.ts
    │   ├── mission_details.ts
    │   ├── what_needs_attention.ts
    │   ├── overdue.ts
    │   └── search.ts              # Uses chamon_search RPC (documented exception)
    ├── index_test.ts              # Deno.test suite (4 required + 1 smoke)
    └── sign-request.ts            # Local CLI helper for signing + sending curls
    README.md                      # This file
```

## Local testing

```bash
export CHAMON_HMAC_SECRET="<value>"
deno test --allow-net --allow-env supabase/functions/chamon-query/index_test.ts
```

Or invoke individual queries:

```bash
deno run --allow-net --allow-env supabase/functions/chamon-query/sign-request.ts today_focus
deno run --allow-net --allow-env supabase/functions/chamon-query/sign-request.ts search '{"query":"renta"}'
```

Print a curl command without sending:

```bash
deno run --allow-net --allow-env supabase/functions/chamon-query/sign-request.ts --print mission_details '{"mission_title":"Pasaporte"}'
```
