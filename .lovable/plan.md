## Objetivo

Que Chamón pueda leer correos de **múltiples cuentas a la vez**, mezclando providers:
- 3 cuentas Gmail (las que ya tienes + las 2 nuevas)
- 1 cuenta Microsoft 365 (`cracevedoc@berylliumpr.net`)

Todo unificado bajo los mismos query_types (`today_summary`, `list_unread`), con resultados ordenados por fecha y etiquetados por cuenta de origen.

## Arquitectura

```text
chamon-query/
  handlers/
    today_summary.ts   ── llama a mailbox.ts (no a gmail.ts directo)
    list_unread.ts     ──┘
_shared/
  mailbox.ts           [nuevo] Orquestador multi-provider, multi-cuenta
  gmail.ts             [refactor] Acepta accountKey, expone listAccounts()
  outlook.ts           [nuevo] Cliente Outlook por gateway, mismo shape
```

El orquestador `mailbox.ts` hace fan-out en paralelo a todas las cuentas conectadas (Gmail + Outlook), normaliza la respuesta a un shape único `MessageSummary`, y mergea por `received_at` desc.

## Pasos

### 1. Conectar las cuentas faltantes

- 2 llamadas a `standard_connectors--connect` con `connector_id=google_mail` (las 2 cuentas Gmail adicionales). Scope: `gmail.readonly`.
- 1 llamada a `standard_connectors--connect` con `connector_id=microsoft_outlook` (Beryllium). Scope: `Mail.Read`.

Resultado: env vars disponibles en runtime:
- `GOOGLE_MAIL_API_KEY`, `GOOGLE_MAIL_API_KEY_2`, `GOOGLE_MAIL_API_KEY_3`
- `MICROSOFT_OUTLOOK_API_KEY`

### 2. Refactor de `_shared/gmail.ts`

- Agregar función `listGmailAccounts()` que escanea `process.env` (vía `Deno.env.toObject()`) buscando `GOOGLE_MAIL_API_KEY`, `_2`, `_3`, ... y devuelve la lista de keys disponibles.
- Modificar `listPrimaryMessages()` para aceptar `accountKey: string` (cuál env var usar).
- Agregar llamada inicial a `/users/me/profile` por cada cuenta (cacheada en memoria del módulo) para resolver el email real → así Chamón puede decir "carlos@gmail.com" en vez de "cuenta 2".
- Cada `GmailMessageSummary` incluye `account: string` (el email) y `provider: "gmail"`.

### 3. Nuevo `_shared/outlook.ts`

Cliente paralelo a `gmail.ts`, mismo shape de respuesta:
- `listOutlookAccounts()` — escanea `MICROSOFT_OUTLOOK_API_KEY`, `_2`, etc.
- `listInboxMessages({ unreadOnly?, todayOnly?, maxResults?, accountKey })` — usa Microsoft Graph con OData:
  - Endpoint base: `https://connector-gateway.lovable.dev/microsoft_outlook/me/messages`
  - `$filter=isRead eq false` para unread
  - `$filter=receivedDateTime ge YYYY-MM-DDTHH:MM:SSZ` para today (medianoche PR convertida a UTC)
  - `$top`, `$orderby=receivedDateTime desc`
  - `$select=subject,from,receivedDateTime,bodyPreview,isRead`
- Llamada a `/me` (cacheada) para resolver el email del owner.
- Output normalizado a `MessageSummary` con `provider: "outlook"`.

Outlook **no tiene concepto de "Primary"** como Gmail. La inbox de Outlook ya viene relativamente limpia (las promociones suelen ir a Junk o Other automáticamente con Focused Inbox). Filtramos solo Inbox folder, sin filtro adicional de categoría.

### 4. Nuevo orquestador `_shared/mailbox.ts`

Tipo unificado:
```ts
interface MessageSummary {
  id: string;
  provider: "gmail" | "outlook";
  account: string;       // email real
  from: string;
  subject: string;
  snippet: string;
  received_at: string;   // ISO UTC
  unread: boolean;
}
```

Funciones:
- `fetchTodayAcrossMailboxes({ limit })` — `Promise.all` de todas las cuentas Gmail + Outlook, mergea, ordena por `received_at` desc, trunca a `limit` global.
- `fetchUnreadAcrossMailboxes({ limit })` — igual pero `unreadOnly`.
- Cada función acepta `accountFilter?: string` opcional → si Chamón dice "revisa solo mi cuenta de Beryllium", filtra antes del fetch.

Manejo de errores por cuenta: si una cuenta falla (token expirado, etc.), se loguea pero NO tumba el response — se devuelven las que sí funcionaron + un campo `errors: [{ account, message }]` para que Chamón pueda mencionar "no pude revisar Beryllium ahora mismo".

### 5. Actualizar handlers en `chamon-query`

- `today_summary.ts` y `list_unread.ts` dejan de importar `gmail.ts` directo, ahora usan `mailbox.ts`.
- Aceptan nuevo `params.account` opcional (string, match parcial case-insensitive contra el email de la cuenta).
- Response incluye `accounts_checked: string[]` y `errors: [...]` además de los items.

### 6. Actualizar router en `chamon-query/index.ts`

Validar `params.account` (string opcional) en los dos query_types.

### 7. Actualizar tool de ElevenLabs

En la descripción del sub-property `params`, agregar:
- `account` (opcional): "Filtra a una cuenta específica. Match parcial: 'beryllium', 'trabajo', 'personal'. Omite para ver todas."

Actualizar también la descripción del query_type `today_summary` y `list_unread` para mencionar que pueden traer correos de Gmail Y Outlook combinados.

### 8. Actualizar README

Documentar las nuevas env vars, el sistema multi-cuenta, el filtro `account`, y el manejo de errores parciales.

## Detalles técnicos relevantes

**Resolución de email por cuenta** (cacheo): primera vez que se llama una cuenta en el lifetime del worker, se hace 1 GET extra a `/users/me/profile` (Gmail) o `/me` (Outlook). Resultado se guarda en un `Map<accountKey, email>` a nivel módulo. Las llamadas siguientes son free.

**Zona horaria para "today"**: La función `todayInPR()` ya existe en `_shared/format.ts`. Para Outlook necesitamos convertir la medianoche PR de hoy a UTC para el `$filter`. Gmail usa `newer_than:1d` que es aproximado pero suficiente.

**Performance**: 4 cuentas en paralelo + 1 llamada de profile cacheada por cuenta. Worst case en cold start: ~8 requests paralelas (4 list + 4 profile). En warm: 4 list. Latencia esperada similar a la actual (~1-2s).

**Costo de scope adicional**: `Mail.Read` de Microsoft es read-only puro. No incluye send, no incluye modify. Equivalente a `gmail.readonly`.

## Archivos afectados

```text
supabase/functions/_shared/gmail.ts            [refactor: multi-account, profile cache]
supabase/functions/_shared/outlook.ts          [nuevo]
supabase/functions/_shared/mailbox.ts          [nuevo: orquestador]
supabase/functions/chamon-query/handlers/today_summary.ts   [editar: usar mailbox]
supabase/functions/chamon-query/handlers/list_unread.ts     [editar: usar mailbox]
supabase/functions/chamon-query/index.ts                    [editar: validar params.account]
supabase/functions/chamon-query/README.md                   [editar: docs multi-cuenta]
```

## Validación

1. Después de conectar las 3 cuentas adicionales, llamar a `chamon-query` con `today_summary` (sin filtro) → debe traer mezcla de las 4 cuentas, ordenado por fecha.
2. Llamar con `today_summary` + `params={"account":"beryllium"}` → solo Beryllium.
3. Probar con voz: "Chamón, ¿qué emails tengo hoy en Beryllium?"
4. Probar fallback: simular token expirado en una cuenta (lo veremos en logs si pasa real) → response debe seguir trayendo las otras.

## Lo que NO incluye

- Send/reply en ningún provider (mantenemos read-only).
- Marcar como leído / archivar.
- Búsqueda por contenido (eso sigue pendiente como `search_email` futuro).
- UI en el frontend para ver las cuentas conectadas — todo se gestiona vía Lovable Cloud → Connectors.

## Una decisión pendiente

Ya definimos antes:
- **Etiquetado**: por dirección de email real (auto-resolved vía profile API).
- **Default behavior**: fan-out a todas las cuentas siempre.

Si confirmas el plan, en build mode arranco con la conexión de las 3 cuentas (te aparecerá el picker de OAuth 3 veces) y luego implemento el refactor.