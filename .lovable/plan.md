## Objetivo

Agregar `email_detail` como nuevo `query_type` en `chamon-query` para que Chamón pueda traer el cuerpo completo de un correo específico **solo cuando Carlos lo pida explícitamente**. Por defecto, `today_summary` y `list_unread` siguen igual (metadata + snippet corto).

## Cambios

### 1. `supabase/functions/_shared/gmail.ts`
Agregar `getMessageFullAcrossAccounts(messageId, accountFilter?)`:
- Itera las cuentas Gmail conectadas (usa el mismo scan de env vars que ya existe).
- Llama `GET /users/me/messages/{id}?format=full` en cada una hasta encontrar match (Gmail devuelve 404 si el id no pertenece a esa cuenta).
- Si `accountFilter` viene, restringe la búsqueda a cuentas cuyo email haga match parcial.
- Decodifica el cuerpo MIME: prefiere `text/plain`; si solo hay `text/html`, hace strip básico de tags. Base64url → UTF-8.
- Trunca el body a ~8000 caracteres y marca `truncated: true` si aplica.
- Devuelve `{ id, account, from, to, subject, received_at, body_text, truncated }` o lanza si ninguna cuenta lo tiene.

### 2. Nuevo handler `supabase/functions/chamon-query/handlers/email_detail.ts`
- Input: `{ message_id: string, account?: string }`.
- Llama a `getMessageFullAcrossAccounts`.
- Devuelve el objeto + un `message` corto tipo `"Correo de <from> recibido <fecha>. Asunto: <subject>."` para anclar al LLM antes del cuerpo.

### 3. `supabase/functions/chamon-query/index.ts`
- Agregar `case "email_detail"`: validar `params.message_id` (string requerido, mín. 5 chars) y `params.account` (string opcional).
- Agregar `email_detail` a la lista de query_types válidos en el mensaje de error.

### 4. System prompt de Chamón (ElevenLabs)
- Agregar `email_detail` al enum de `query_type` en la tool definition.
- Documentar `params.message_id` y `params.account` (opcional).
- Agregar sección en el system prompt:
  > **Detalle de correo (opt-in).** Nunca traigas el cuerpo completo por tu cuenta. `today_summary` y `list_unread` ya te dan asunto, remitente y un fragmento — eso es suficiente para responder "¿qué tengo?". Solo invoca `email_detail` cuando Carlos pida explícitamente más profundidad: "léeme ese", "qué dice completo", "dame el detalle del de Andrea", "resume ese correo", etc. Toma el `message_id` del correo correspondiente (de la respuesta previa de `today_summary`/`list_unread`) y resume el cuerpo. Si tienes duda de a cuál se refiere, pregunta antes de llamar. Uno a la vez.

### 5. README de `chamon-query`
- Documentar el nuevo query_type, sus params, el comportamiento opt-in, el límite de truncado, y el manejo HTML→texto.

## Detalles técnicos

- **HTML strip básico**: regex para remover `<script>`, `<style>`, y luego `<[^>]+>`, decodificar entidades comunes (`&amp;`, `&lt;`, `&gt;`, `&nbsp;`, `&quot;`). Suficiente para emails de Airbnb/transaccionales típicos.
- **Búsqueda multi-cuenta**: en paralelo con `Promise.allSettled`; primer success gana. Si todas fallan con 404, error claro tipo `"No encontré ese correo en ninguna cuenta conectada."`.
- **Sin cambios** en `today_summary.ts` ni `list_unread.ts` — ya devuelven `id` por item, que es lo que Chamón pasará como `message_id`.
- **Outlook**: este plan cubre solo Gmail (que es donde están los emails de Airbnb). Si más adelante se necesita para Outlook, se agrega un helper paralelo en `outlook.ts` y el orquestador.

## Archivos afectados

```text
supabase/functions/_shared/gmail.ts                          [editar]
supabase/functions/chamon-query/handlers/email_detail.ts     [nuevo]
supabase/functions/chamon-query/index.ts                     [editar]
supabase/functions/chamon-query/README.md                    [editar]
```

(El system prompt de ElevenLabs lo actualizas tú en el dashboard de ElevenLabs; te dejo el texto exacto al terminar.)

## Validación

1. Llamar `today_summary` → tomar un `id` del response.
2. Llamar `email_detail` con ese `id` → debe devolver `body_text` legible.
3. Llamar `email_detail` con un `id` inventado → error claro.
4. Probar con voz: "Chamón, ¿qué emails tengo?" → "Léeme el de Andrea completo".
