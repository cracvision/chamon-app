## Activar Digest Automático (Phase 2)

Hoy `send-digest-now` solo dispara con el botón porque requiere el JWT del usuario logueado. Para enviar automáticamente a la hora configurada por cada usuario, necesitamos un job programado que recorra los profiles habilitados y dispare envíos sin sesión interactiva.

### Cambios

**1. Nueva Edge Function `send-digest-cron`**
- Sin auth de usuario: protegida con header `x-cron-secret` validado contra un nuevo secret `CHAMON_CRON_SECRET`.
- Recibe `{ hour: number }` (hora PR actual, 0-23).
- Query: `profiles` donde `digest_enabled=true` AND `digest_hour = hour`.
- Para cada profile: ejecuta la misma lógica de `send-digest-now` (focus + overdue + render + Resend + insert en `notifications`) usando service role.
- Refactor: extraer la lógica de armar/enviar el email a un helper compartido (`_shared/digest.ts`) usado por ambas functions para evitar duplicación.

**2. Cron job (pg_cron + pg_net)**
- Habilitar extensiones `pg_cron` y `pg_net` si no lo están.
- Programar job `chamon-digest-hourly` que corra cada hora en punto (`0 * * * *`).
- El body calcula la hora actual en `America/Puerto_Rico` y la pasa como `hour` para que la function filtre los profiles que pidieron esa hora.
- SQL insertado vía supabase tool (no migración) porque contiene URL del proyecto y secret.

**3. Secret nuevo**
- `CHAMON_CRON_SECRET`: string aleatorio que valida que la llamada viene de pg_cron y no de internet abierto.

**4. UI tweak menor en Settings**
- Quitar el disclaimer "Phase 2 pendiente" si lo hubiera; añadir microcopy: "Recibirás el digest cada día a la hora seleccionada (zona PR)."

### Detalles técnicos

- Timezone: el cálculo de "hora actual PR" se hace en SQL con `EXTRACT(HOUR FROM (now() AT TIME ZONE 'America/Puerto_Rico'))`. PR no tiene DST, así que es estable.
- Idempotencia básica: insertamos en `notifications` con `type='digest'` y un check opcional para no enviar dos veces el mismo día al mismo user (query previo por `sent_at::date = today AND type='digest' AND user_id=X`).
- Errores por usuario no detienen el batch: try/catch por profile, log a `notifications` con `status='failed'`.
- Respeta el setting `preferred_language` (es/en) que ya existe en `send-digest-now`.

### Tests / verificación

1. Crear secret `CHAMON_CRON_SECRET`.
2. Llamar manualmente la function con curl + secret + `{hour: <hora actual PR>}` → debe enviar a tu profile.
3. Llamar con secret incorrecto → 401.
4. Verificar `cron.job` que el schedule existe.
5. Esperar a la próxima hora en punto y confirmar envío automático.

¿Confirmas que dale?