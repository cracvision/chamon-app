# chamon-query Edge Function

Voice-agent query backend for Mission Control. Read-only intent router that exposes 6 query types over HMAC-authenticated POST.

## Endpoint

```
POST https://yvfkkdvhizjdpouoewch.supabase.co/functions/v1/chamon-query
```

## Authentication

The function accepts **two auth modes**, checked in order:

### Mode 1: HMAC-SHA256 (primary — CLI, scripts, internal tests)

| Header | Value |
|---|---|
| `x-chamon-timestamp` | Unix seconds (e.g. `1714150000`) |
| `x-chamon-signature` | `hex(HMAC_SHA256(CHAMON_HMAC_SECRET, "${timestamp}.${rawBody}"))` |

- Replay window: **5 minutes** (`abs(now - ts) > 300` → 401 `stale_timestamp`).
- Signature mismatch → 401 `bad_signature`.
- If either HMAC header is present, HMAC is enforced (Bearer is ignored).

### Mode 2: Bearer token (for ElevenLabs Server Tools)

ElevenLabs Server Tools cannot sign request bodies dynamically, so we accept a static Bearer token as a fallback.

| Header | Value |
|---|---|
| `Authorization` | `Bearer <CHAMON_ELEVENLABS_BEARER>` |

- Used **only** when no `x-chamon-*` headers are present.
- No replay protection, no IP allowlist (ElevenLabs does not publish static outbound IPs for Server Tools).
- Token must be **rotated every 90 days** — see procedure below.
- Threat model: read-only, single-user backend. A leaked token grants read access to Carlos's missions/tasks; no write paths exist.

### Errors

| `reason` | Mode | Meaning |
|---|---|---|
| `missing_headers` | both | No HMAC headers and no Authorization header |
| `bad_timestamp` / `stale_timestamp` / `bad_signature` | hmac | HMAC verification failed |
| `bad_auth_scheme` / `empty_bearer` / `bad_bearer` | bearer | Bearer verification failed |

### Bearer rotation procedure (every 90 days)

1. Generate a new high-entropy token: `openssl rand -hex 32`
2. Update the `CHAMON_ELEVENLABS_BEARER` secret in Lovable Cloud → Connectors → Secrets.
3. Update the static header in the ElevenLabs agent's Server Tool configuration:
   - Header name: `Authorization`
   - Header value: `Bearer <new-token>`
4. Trigger a test conversation in the ElevenLabs agent to confirm 200 responses.
5. Record rotation date in your ops log.

### Sample ElevenLabs Server Tool request

```http
POST /functions/v1/chamon-query HTTP/1.1
Host: yvfkkdvhizjdpouoewch.supabase.co
Content-Type: application/json
Authorization: Bearer <CHAMON_ELEVENLABS_BEARER>

{ "query_type": "today_focus" }
```

### Troubleshooting

- **401 `bad_bearer`** — the token in ElevenLabs does not match the secret in Lovable Cloud.
- **401 `bad_auth_scheme`** — the Authorization header value does not start with `Bearer `.
- **401 `missing_headers` from ElevenLabs** — the Server Tool is not sending any auth header.
- **401 `bad_signature` from ElevenLabs** — ElevenLabs sent a stale `x-chamon-*` header alongside Bearer; strip HMAC headers from the tool config.

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
| `today_summary` | `{ limit?, account? }` (≤20, default 10) | Gmail Primary inbox messages received today (PR) across **all linked accounts**, with unread count |
| `list_unread` | `{ limit?, account? }` (≤20, default 10) | Most recent unread messages in Gmail Primary inbox across **all linked accounts** |
| `email_detail` | `{ message_id, account? }` — also accepts `message_id`/`account` at body top-level as a fallback for clients that flatten the wrapper | **Opt-in.** Full body of a single Gmail message (text/plain preferred, HTML stripped). Truncated at 8000 chars. Chamón must only call this when Carlos explicitly asks for the detail. |

All times are `America/Puerto_Rico` (UTC-4, no DST).

### Gmail integration (multi-account)

`today_summary` and `list_unread` read via the Lovable Gmail connector (scope
`gmail.readonly`). Both filter to the **Primary** category, excluding
Promotions / Social / Updates / Forums. Read-only — no send/modify in this
sprint.

**Multi-account fan-out:** the function scans env for `GOOGLE_MAIL_API_KEY`,
`GOOGLE_MAIL_API_KEY_1`, `GOOGLE_MAIL_API_KEY_2`, ... Each variable corresponds
to one linked Gmail connection. All accounts are queried in parallel and
results are merged + sorted by `received_at` desc, then truncated to `limit`.

Each item carries an `account` field (the resolved email address). The
response also includes:
- `accounts_checked: string[]` — which accounts contributed
- `errors: [{ account, message }]` — per-account failures (one bad token does
  not kill the response)

**Filtering:** pass `params.account` with a substring (case-insensitive) to
restrict to one account, e.g. `{"account":"craczone"}` matches
`craczone@gmail.com`.



## Response shape

```json
{ "ok": true, "query_type": "...", "data": { ... } }
```

Errors: `{ "error": "<spanish message>", "reason"?: "<machine code>" }` with appropriate HTTP status (400/401/500).

## Security boundary

This function authenticates to the database with `SUPABASE_SERVICE_ROLE_KEY`,
which **bypasses all RLS policies**. The actual enforcement of per-user data
isolation is the `scopedTable()` wrapper in `_shared/client.ts`, which
auto-applies `.eq("user_id", CHAMON_USER_ID)` and `.is("deleted_at", null)`
to every query.

Hard rule: no handler in this function may call `supabase.from(...)` directly.
Verify with: `rg "supabase\.from\(" supabase/functions/chamon-query/handlers/`
→ must return zero matches.

RLS policies on the underlying tables exist as defense-in-depth for the
*frontend* path (which uses the publishable key + user JWT), not for this
Edge Function path.

The `handlers/search.ts` exception calls the `chamon_search` SQL function,
which hardcodes the same `user_id` + `deleted_at IS NULL` filters in its
body (see migration). Documented and intentional.

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
