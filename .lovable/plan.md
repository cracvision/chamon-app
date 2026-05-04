# Plan: Lectura de Gmail para Chamón

Confirmado el alcance:
- **Solo lectura** (scope `gmail.readonly`).
- Filtrar siempre por **Primary inbox** (excluyendo Promotions / Social / Updates / Forums).
- No se implementa send / modify / drafts en esta iteración.

## Arquitectura

Toda la lectura de Gmail va por el **conector Gmail de Lovable** (gateway), no con OAuth manual. El gateway hace refresh automático del token. El conector queda autorizado con **tu cuenta de Gmail** (eres el único usuario de Chamón hoy), por lo que esto encaja con el modelo single-user de Sprint 1.

## Pasos

### 1. Conectar Gmail al proyecto

Llamaré al tool `standard_connectors--connect` con `connector_id=google_mail`. Te aparecerá un picker para autorizar tu cuenta y seleccionar el scope. **Importante**: en el diálogo solo necesitas marcar `gmail.readonly` (no marques send / modify).

Tras autorizar, el gateway expone `GOOGLE_MAIL_API_KEY` y `LOVABLE_API_KEY` como env vars en el runtime de las edge functions.

### 2. Crear cliente Gmail compartido

Nuevo archivo: `supabase/functions/_shared/gmail.ts`

Helper que abstrae el gateway:
- `listPrimaryMessages({ unreadOnly?, maxResults? })` — usa `q=category:primary` (y opcionalmente `is:unread`) para filtrar Primary y excluir Promotions/Social/Updates/Forums.
- `getMessageMetadata(id)` — pide `format=metadata` con headers `From`, `Subject`, `Date`, y devuelve `snippet` + `unread` (basado en label `UNREAD`).

Manejo de errores:
- 401 → mensaje claro de "necesita reconexión".
- 403 `insufficient authentication scopes` → no debería pasar con readonly, pero se loguea.
- Variables faltantes → error 500 con mensaje específico (mismo patrón que el resto del código).

### 3. Dos nuevos handlers en chamon-query

**`handlers/today_summary.ts`** → query_type `today_summary`
- Lista los últimos N (default 10, max 20) mensajes de Primary del día de hoy en zona PR.
- Devuelve: `{ count, items: [{ id, from, subject, snippet, received_at, unread }] }`.
- Útil para que Chamón diga: "Hoy te llegaron 4 emails en Primary, 2 sin leer..."

**`handlers/list_unread.ts`** → query_type `list_unread`
- Lista los últimos N (default 10, max 20) mensajes **no leídos** de Primary (sin restricción de fecha).
- Misma forma de respuesta que `today_summary`.

Ambos handlers hacen 1 llamada `messages.list` + N llamadas `messages.get` en paralelo (con `Promise.all`).

### 4. Registrar los nuevos query_types

En `supabase/functions/chamon-query/index.ts`:
- Agregar `today_summary` y `list_unread` al switch del router.
- Aceptar `params.limit` opcional (validado con `coerceNumber`, igual que en `what_needs_attention` / `search`).
- Actualizar el mensaje de error `missing_query_type` para incluir los dos nuevos valores.

### 5. Actualizar README

En `supabase/functions/chamon-query/README.md`:
- Agregar las dos nuevas filas a la tabla de query types.
- Nota corta sobre el scope `gmail.readonly` y el filtro Primary.

### 6. Configurar el agente de ElevenLabs

Después de desplegar:
- En la herramienta del agente, agregar las dos nuevas operaciones (`today_summary`, `list_unread`) con sus descripciones para que sepa cuándo invocarlas.

## Archivos afectados

```text
supabase/functions/_shared/gmail.ts              [nuevo]
supabase/functions/chamon-query/handlers/today_summary.ts   [nuevo]
supabase/functions/chamon-query/handlers/list_unread.ts     [nuevo]
supabase/functions/chamon-query/index.ts                    [editar: router]
supabase/functions/chamon-query/README.md                   [editar: docs]
```

## Validación

1. Deploy de `chamon-query`.
2. Llamada manual con `sign-request.ts today_summary` → ver últimos emails de Primary de hoy.
3. Llamada con `sign-request.ts list_unread '{"limit":5}'` → ver 5 no leídos.
4. Probar desde el agente de ElevenLabs: "¿Qué emails tengo hoy?" / "¿Tengo correos sin leer?"

## Lo que NO incluye este plan

- Enviar emails (requeriría `gmail.send` y un `chamon-send-email` separado).
- Marcar como leído / archivar (requeriría `gmail.modify`).
- Buscar emails por contenido o remitente (lo dejamos para una iteración futura como `search_email`).
- Almacenar emails en la base de datos — todo se lee on-demand.

Si confirmas, procedo en modo build con la conexión y la implementación.
